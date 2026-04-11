import { BOT_TEXTS } from '../utils/constants.js';
import { getBookingPdfRequiredKeyboard } from './keyboards/booking.js';
import { getHelpKeyboard } from './keyboards/help.js';
import { getMainMenuKeyboard } from './keyboards/mainMenu.js';
import { BOOKING_SCENE_ID } from './scenes/bookingScene.js';
import { REGISTRATION_EDIT_SCENE_ID } from './scenes/registrationEditScene.js';
import { REGISTRATION_SCENE_ID } from './scenes/registrationScene.js';
import { resetSceneSession, SCENE_EXIT_REASONS } from './utils/sceneNavigation.js';

function buildBlockedMessage(user, supportContact) {
  const lines = [BOT_TEXTS.BLOCKED];

  if (user.blockedReason) {
    lines.push(`Причина: ${user.blockedReason}`);
  }

  lines.push(`Если нужна помощь: ${supportContact}`);

  return lines.join('\n');
}

export function registerCommands(bot, { env, services }) {
  bot.start(async (ctx) => {
    await resetSceneSession(ctx, {
      logMessage: 'Scene session reset by /start',
      reason: SCENE_EXIT_REASONS.GLOBAL_NAVIGATION,
    });

    const user = await services.registrationService.ensureTelegramUser(ctx.from);
    const isBlocked = await services.bookingService.isUserBlocked(user.id);

    if (isBlocked) {
      await ctx.reply(buildBlockedMessage(user, env.SUPPORT_CONTACT), getMainMenuKeyboard());
      return;
    }

    const registrationSummary = await services.registrationService.getRegistrationSummary(user.id);
    const message = registrationSummary.exists
      ? BOT_TEXTS.START_REGISTERED
      : BOT_TEXTS.START_NEW_USER;

    await ctx.reply(message, getMainMenuKeyboard());
  });

  bot.command('menu', async (ctx) => {
    const user = await services.registrationService.ensureTelegramUser(ctx.from);
    const isBlocked = await services.bookingService.isUserBlocked(user.id);

    if (isBlocked) {
      await ctx.reply(buildBlockedMessage(user, env.SUPPORT_CONTACT), getMainMenuKeyboard());
      return;
    }

    await ctx.reply(BOT_TEXTS.MENU_HINT, getMainMenuKeyboard());
  });

  bot.command('help', async (ctx) => {
    await ctx.reply(BOT_TEXTS.HELP_PROMPT, getHelpKeyboard());
  });

  bot.command('registration', async (ctx) => {
    const user = await services.registrationService.ensureTelegramUser(ctx.from);
    const isBlocked = await services.bookingService.isUserBlocked(user.id);

    if (isBlocked) {
      await ctx.reply(buildBlockedMessage(user, env.SUPPORT_CONTACT), getMainMenuKeyboard());
      return;
    }

    const registration = await services.registrationService.getRegistrationByUserId(user.id);

    await ctx.scene.enter(registration ? REGISTRATION_EDIT_SCENE_ID : REGISTRATION_SCENE_ID);
  });

  bot.command('booking', async (ctx) => {
    const user = await services.registrationService.ensureTelegramUser(ctx.from);
    const isBlocked = await services.bookingService.isUserBlocked(user.id);

    if (isBlocked) {
      await ctx.reply(buildBlockedMessage(user, env.SUPPORT_CONTACT), getMainMenuKeyboard());
      return;
    }

    const registration = await services.registrationService.getRegistrationByUserId(user.id);

    if (!registration) {
      await ctx.reply('Сначала нажми «Регистрация».', getMainMenuKeyboard());
      return;
    }

    const hasUserPdf = await services.userPdfService.hasUserPdf(user.id);

    if (!hasUserPdf) {
      await ctx.reply('Сначала нужно загрузить PDF.', getBookingPdfRequiredKeyboard());
      return;
    }

    await ctx.scene.enter(BOOKING_SCENE_ID);
  });
}
