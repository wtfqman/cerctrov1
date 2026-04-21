import { createBot } from './bot/index.js';
import { env } from './config/env.js';
import { startBookingDailySummaryJob } from './jobs/bookingDailySummary.js';
import { connectPrisma, disconnectPrisma, prisma } from './db/prisma.js';
import { startOverdueCheckJob } from './jobs/overdueCheck.js';
import { createServices } from './services/index.js';
import { logger } from './utils/logger.js';

let botInstance = null;
let stopOverdueJob = null;
let stopBookingDailySummaryJob = null;
let shutdownPromise = null;
let keepAliveInterval = null;

async function bootstrap() {
  logger.info('Starting application bootstrap');
  await connectPrisma();
  logger.info('Prisma connected');

  const services = createServices({
    env,
    logger,
    prisma,
  });

  await services.adminService.ensureConfiguredAdmins();

  const googleSheetsReady = env.GOOGLE_SHEETS_ENABLED
    ? await services.googleSheets.init()
    : false;
  const emailReady = env.MAIL_ENABLED
    ? await services.emailService.init()
    : false;

  if (!env.GOOGLE_SHEETS_ENABLED) {
    if (env.GOOGLE_SHEETS_HAS_ANY_CONFIG) {
      logger.warn(
        {
          missingEnv: env.GOOGLE_SHEETS_MISSING_VARS,
        },
        'Google Sheets configuration is incomplete, integration is disabled',
      );
    } else {
      logger.info('Google Sheets integration is disabled');
    }
  } else if (!googleSheetsReady) {
    logger.warn(
      {
        credentialsPath: env.GOOGLE_SERVICE_ACCOUNT_JSON_PATH,
        sheetName: env.GOOGLE_SHEET_NAME,
        spreadsheetId: env.GOOGLE_SHEETS_SPREADSHEET_ID,
      },
      'Google Sheets initialization failed, the bot will continue running and retry on demand',
    );
  }

  if (!env.MAIL_ENABLED) {
    if (env.MAIL_HAS_ANY_CONFIG) {
      logger.warn(
        {
          missingEnv: env.MAIL_MISSING_VARS,
        },
        'Email configuration is incomplete, boutique notifications are disabled',
      );
    } else {
      logger.info('Email notifications are disabled');
    }
  } else if (!emailReady) {
    logger.warn(
      {
        host: env.SMTP_HOST,
        mailFrom: env.MAIL_FROM,
        port: env.SMTP_PORT,
        secure: env.SMTP_SECURE,
        user: env.SMTP_USER,
      },
      'Email service initialization failed, the bot will continue running and retry on demand',
    );
  }

  if (!env.BOT_ENABLED) {
    keepAliveInterval = setInterval(() => {}, 60 * 1000);

    logger.warn('BOT_ENABLED=false, Telegram launch skipped');
    return;
  }

  botInstance = await createBot({
    env,
    logger,
    prisma,
    services,
  });

  stopOverdueJob = startOverdueCheckJob({
    bot: botInstance,
    logger,
    services,
  });
  stopBookingDailySummaryJob = startBookingDailySummaryJob({
    bot: botInstance,
    logger,
    services,
  });

  await botInstance.launch();
  logger.info(
    {
      adminIds: env.ADMIN_IDS,
      botUsername: env.BOT_USERNAME,
      googleSheetName: env.GOOGLE_SHEET_NAME,
      spreadsheetId: env.GOOGLE_SHEETS_SPREADSHEET_ID,
    },
    'Telegram bot launched',
  );
}

async function shutdown(signal, initialExitCode = 0) {
  if (shutdownPromise) {
    return shutdownPromise;
  }

  shutdownPromise = (async () => {
    let exitCode = initialExitCode;
    const forceExitTimer = setTimeout(() => {
      logger.error({ signal }, 'Graceful shutdown timed out, forcing process exit');
      process.exit(exitCode === 0 ? 1 : exitCode);
    }, 10000);

    forceExitTimer.unref?.();

    logger.info({ signal }, 'Shutting down application');

    try {
      if (stopOverdueJob) {
        stopOverdueJob();
        stopOverdueJob = null;
      }

      if (stopBookingDailySummaryJob) {
        stopBookingDailySummaryJob();
        stopBookingDailySummaryJob = null;
      }

      if (keepAliveInterval) {
        clearInterval(keepAliveInterval);
        keepAliveInterval = null;
      }
    } catch (error) {
      exitCode = 1;
      logger.error({ err: error }, 'Failed to stop overdue timer job');
    }

    try {
      botInstance?.stop(signal);
      botInstance = null;
    } catch (error) {
      exitCode = 1;
      logger.error({ err: error }, 'Failed to stop Telegram bot cleanly');
    }

    try {
      await disconnectPrisma();
    } catch (error) {
      exitCode = 1;
      logger.error({ err: error }, 'Failed to disconnect Prisma cleanly');
    }

    clearTimeout(forceExitTimer);
    logger.info({ signal, exitCode }, 'Application shutdown completed');
    process.exit(exitCode);
  })();

  return shutdownPromise;
}

process.once('SIGINT', () => {
  void shutdown('SIGINT', 0);
});

process.once('SIGTERM', () => {
  void shutdown('SIGTERM', 0);
});

process.on('unhandledRejection', (err) => {
  console.error(err);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  logger.fatal({ err: error }, 'Uncaught exception');
  void shutdown('uncaughtException', 1);
});

bootstrap().catch(async (error) => {
  logger.fatal({ err: error }, 'Failed to bootstrap application');

  try {
    await disconnectPrisma();
  } catch (disconnectError) {
    logger.error({ err: disconnectError }, 'Failed to disconnect Prisma after bootstrap error');
  }

  process.exit(1);
});
