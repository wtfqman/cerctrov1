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

  await bot.telegram.setMyCommands([
    { command: 'start', description: 'Запустить бота' },
    { command: 'booking', description: 'Создать заявку' },
    { command: 'menu', description: 'Показать главное меню' },
    { command: 'help', description: 'Помощь' },
    { command: 'registration', description: 'Пройти регистрацию' },
    { command: 'admin', description: 'Открыть админку' },
  ]);

  return bot;
}
