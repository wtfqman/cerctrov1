import { Scenes, Telegraf, session } from 'telegraf';

import { registerCommands } from './commands.js';
import { registerAdminHandlers } from './handlers/adminHandlers.js';
import { registerMenuHandlers } from './handlers/menuHandlers.js';
import { createContextMiddleware } from './middlewares/context.js';
import { registerErrorHandler } from './middlewares/errorHandler.js';
import { createLoggingMiddleware } from './middlewares/logging.js';
import { createAdminBoutiqueScene } from './scenes/adminBoutiqueScene.js';
import { createAdminAdminScene } from './scenes/adminAdminScene.js';
import { createAdminSlotScene } from './scenes/adminSlotScene.js';
import { createAdminTimeSlotScene } from './scenes/adminTimeSlotScene.js';
import { createAdminUserScene } from './scenes/adminUserScene.js';
import { createBookingRescheduleScene } from './scenes/bookingRescheduleScene.js';
import { createBookingScene } from './scenes/bookingScene.js';
import { createRegistrationEditScene } from './scenes/registrationEditScene.js';
import { createRegistrationScene } from './scenes/registrationScene.js';
import {
  attachSceneLifecycleLogging,
  createGlobalSceneNavigationGuard,
} from './utils/sceneNavigation.js';

const TELEGRAM_COMMANDS_SETUP_MAX_ATTEMPTS = 2;
const TELEGRAM_COMMANDS_SETUP_RETRY_DELAY_MS = 1000;

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function setupTelegramCommandsSafely(bot, logger, commands) {
  logger.info({ event: 'telegram_commands_setup_started' }, 'telegram_commands_setup_started');

  for (let attempt = 1; attempt <= TELEGRAM_COMMANDS_SETUP_MAX_ATTEMPTS; attempt += 1) {
    try {
      await bot.telegram.setMyCommands(commands);
      return;
    } catch (error) {
      logger.warn(
        {
          attempt,
          err: error,
          event: 'telegram_commands_setup_failed',
          maxAttempts: TELEGRAM_COMMANDS_SETUP_MAX_ATTEMPTS,
        },
        'telegram_commands_setup_failed',
      );

      if (attempt < TELEGRAM_COMMANDS_SETUP_MAX_ATTEMPTS) {
        await delay(TELEGRAM_COMMANDS_SETUP_RETRY_DELAY_MS);
      }
    }
  }

  logger.warn(
    { event: 'telegram_commands_setup_skipped_after_error' },
    'telegram_commands_setup_skipped_after_error',
  );
  logger.info({ event: 'telegram_bot_launch_continues' }, 'telegram_bot_launch_continues');
}

export async function createBot({ env, logger, services }) {
  const bot = new Telegraf(env.BOT_TOKEN);
  const stage = new Scenes.Stage([
    attachSceneLifecycleLogging(createRegistrationScene()),
    attachSceneLifecycleLogging(createRegistrationEditScene()),
    attachSceneLifecycleLogging(createBookingScene()),
    attachSceneLifecycleLogging(createBookingRescheduleScene()),
    attachSceneLifecycleLogging(createAdminAdminScene()),
    attachSceneLifecycleLogging(createAdminSlotScene()),
    attachSceneLifecycleLogging(createAdminUserScene()),
    attachSceneLifecycleLogging(createAdminBoutiqueScene()),
    attachSceneLifecycleLogging(createAdminTimeSlotScene()),
  ]);
  stage.use(createGlobalSceneNavigationGuard());

  registerErrorHandler(bot, { logger });

  bot.use(createLoggingMiddleware({ logger }));
  bot.use(createContextMiddleware({ env, logger, services }));
  bot.use(session());
  bot.use(stage.middleware());

  registerCommands(bot, { env, services });
  registerAdminHandlers(bot, { env, services });
  registerMenuHandlers(bot, { env, services });

  await setupTelegramCommandsSafely(bot, logger, [
    { command: 'start', description: 'Запустить бота' },
    { command: 'booking', description: 'Создать заявку' },
    { command: 'menu', description: 'Показать главное меню' },
    { command: 'help', description: 'Помощь' },
    { command: 'registration', description: 'Пройти регистрацию' },
    { command: 'admin', description: 'Открыть админку' },
  ]);

  return bot;
}
