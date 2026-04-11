import { env } from '../config/env.js';

export async function runOverdueCheckOnce({ services, bot, logger }) {
  const jobLogger = logger.child({ job: 'overdueCheck' });

  const result = await services.timerService.processOverdueTimers({
    getAdminRecipient: async () => services.adminService.getPrimaryAlertAdmin(),
    notifyAdmin: async ({ telegramId, message }) => {
      await bot.telegram.sendMessage(String(telegramId), message);
    },
    notifyUser: async ({ telegramId, message }) => {
      await bot.telegram.sendMessage(String(telegramId), message);
    },
  });

  jobLogger.info(result, 'Overdue check completed');

  return result;
}

export function startOverdueCheckJob({ services, bot, logger }) {
  const jobLogger = logger.child({ job: 'overdueCheck' });
  const intervalMs = env.OVERDUE_CHECK_INTERVAL_MS;
  let isRunning = false;

  async function runSafely() {
    if (isRunning) {
      jobLogger.warn('Skipping overdue check because previous run is still in progress');
      return;
    }

    isRunning = true;

    try {
      await runOverdueCheckOnce({
        bot,
        logger: jobLogger,
        services,
      });
    } catch (error) {
      jobLogger.error({ err: error }, 'Overdue check failed');
    } finally {
      isRunning = false;
    }
  }

  void runSafely();

  const intervalId = setInterval(() => {
    void runSafely();
  }, intervalMs);

  intervalId.unref?.();

  jobLogger.info({ intervalMs }, 'Overdue check job scheduled');

  return () => clearInterval(intervalId);
}
