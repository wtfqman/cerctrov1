import { BOT_TEXTS } from '../../utils/constants.js';
import { getMainMenuKeyboard } from '../keyboards/mainMenu.js';
import { renderAdminMenu } from '../scenes/adminShared.js';
import { resetSceneSession, SCENE_EXIT_REASONS } from './sceneNavigation.js';

const ADMIN_COMMAND_HANDLED_KEY = '__adminCommandHandled';

function getMessageText(ctx) {
  return ctx.message?.text?.trim() ?? '';
}

function getMessageCommand(ctx) {
  const text = getMessageText(ctx);

  if (!text.startsWith('/')) {
    return '';
  }

  return text.split(/\s+/u, 1)[0].toLowerCase().replace(/@.+$/u, '');
}

function getRequestLogger(ctx) {
  return ctx.state?.requestLogger ?? null;
}

function wasAdminCommandHandled(ctx) {
  return Boolean(ctx.state?.[ADMIN_COMMAND_HANDLED_KEY]);
}

function markAdminCommandHandled(ctx) {
  ctx.state ??= {};
  ctx.state[ADMIN_COMMAND_HANDLED_KEY] = true;
}

function logAdminCommandEvent(ctx, event, extra = {}, level = 'info') {
  getRequestLogger(ctx)?.[level]?.(
    {
      event,
      sceneId: ctx.scene?.current?.id ?? null,
      telegramId: ctx.from?.id ? String(ctx.from.id) : null,
      ...extra,
    },
    `Admin command event: ${event}`,
  );
}

async function replyAdminEntryMessage(ctx, message) {
  await ctx.reply(message, getMainMenuKeyboard());
}

export async function openAdminMenuFromAnywhere(ctx) {
  if (wasAdminCommandHandled(ctx)) {
    return true;
  }

  markAdminCommandHandled(ctx);
  logAdminCommandEvent(ctx, 'admin_command_received');

  try {
    const admin = await ctx.state.services.adminService.getAdminByActorId(ctx.from.id);

    if (!admin) {
      logAdminCommandEvent(ctx, 'admin_command_access_denied', {}, 'warn');
      await replyAdminEntryMessage(ctx, BOT_TEXTS.ADMIN_ONLY);
      return false;
    }

    await resetSceneSession(ctx, {
      logMessage: 'Scene session reset by /admin',
      reason: SCENE_EXIT_REASONS.GLOBAL_NAVIGATION,
    });

    await renderAdminMenu(ctx, admin, null, {
      fresh: true,
    });

    logAdminCommandEvent(ctx, 'admin_menu_opened', {
      adminId: admin.id,
      role: admin.role,
    });
    return true;
  } catch (error) {
    logAdminCommandEvent(
      ctx,
      'admin_menu_failed',
      {
        err: error,
      },
      'error',
    );
    await replyAdminEntryMessage(ctx, BOT_TEXTS.ADMIN_MENU_OPEN_FAILED);
    return false;
  }
}

export async function maybeOpenAdminMenuFromScene(ctx) {
  if (getMessageCommand(ctx) !== '/admin') {
    return false;
  }

  await openAdminMenuFromAnywhere(ctx);
  return true;
}
