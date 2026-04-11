import { BOT_TEXTS } from '../../utils/constants.js';
import { ForbiddenError } from '../../utils/errors.js';
import { formatAdminWelcome } from '../../utils/formatters.js';
import { ADMIN_CALLBACKS, getAdminMenuKeyboard } from '../keyboards/admin.js';
import {
  getClearedInlineKeyboard,
  isMessageNotModifiedError,
  isUnavailableMessageError,
  normalizeInlineMarkup,
} from '../utils/inlineKeyboard.js';

export const ADMIN_TEXT_CANCEL = 'Отмена';
export const ADMIN_TEXT_BACK = 'Назад';

function getCallbackPanel(ctx) {
  const message = ctx.callbackQuery?.message;

  if (!message?.chat?.id || !message?.message_id) {
    return null;
  }

  return {
    chatId: message.chat.id,
    messageId: message.message_id,
  };
}

function getStoredPanel(ctx) {
  const chatId = ctx.session?.adminPanel?.chatId;
  const messageId = ctx.session?.adminPanel?.messageId;

  if (!chatId || !messageId) {
    return null;
  }

  return { chatId, messageId };
}

function isSamePanelTarget(left, right) {
  return Boolean(
    left &&
    right &&
    left.chatId === right.chatId &&
    left.messageId === right.messageId,
  );
}

function rememberAdminPanel(ctx, target) {
  if (!target?.chatId || !target?.messageId) {
    return;
  }

  ctx.session ??= {};
  ctx.session.adminPanel = {
    chatId: target.chatId,
    messageId: target.messageId,
  };
}

function clearStoredPanel(ctx) {
  if (!ctx.session?.adminPanel) {
    return;
  }

  delete ctx.session.adminPanel;
}

function getAdminPanelCandidates(ctx) {
  const candidates = [];
  const storedPanel = getStoredPanel(ctx);
  const callbackPanel = getCallbackPanel(ctx);

  if (storedPanel) {
    candidates.push(storedPanel);
  }

  if (callbackPanel && !isSamePanelTarget(callbackPanel, storedPanel)) {
    candidates.push(callbackPanel);
  }

  return candidates;
}

async function clearAdminKeyboardByTarget(ctx, target) {
  if (!target) {
    return false;
  }

  try {
    await ctx.telegram.editMessageReplyMarkup(
      target.chatId,
      target.messageId,
      undefined,
      getClearedInlineKeyboard(),
    );

    return true;
  } catch (error) {
    if (isMessageNotModifiedError(error) || isUnavailableMessageError(error)) {
      return false;
    }

    throw error;
  }
}

async function clearStaleCallbackKeyboard(ctx) {
  const callbackPanel = getCallbackPanel(ctx);
  const storedPanel = getStoredPanel(ctx);

  if (!callbackPanel || !storedPanel || isSamePanelTarget(callbackPanel, storedPanel)) {
    return false;
  }

  return clearAdminKeyboardByTarget(ctx, callbackPanel);
}

export async function clearPreviousAdminKeyboard(ctx, exceptTarget = null) {
  const storedPanel = getStoredPanel(ctx);

  if (!storedPanel || isSamePanelTarget(storedPanel, exceptTarget)) {
    return false;
  }

  const cleared = await clearAdminKeyboardByTarget(ctx, storedPanel);

  if (cleared || isSamePanelTarget(getStoredPanel(ctx), storedPanel)) {
    clearStoredPanel(ctx);
  }

  return cleared;
}

export function getAdminText(ctx) {
  return ctx.message?.text?.trim() ?? '';
}

export function getAdminCallbackData(ctx) {
  return ctx.callbackQuery?.data ?? '';
}

export function extractCallbackValue(ctx, prefix) {
  const data = getAdminCallbackData(ctx);
  return data.startsWith(prefix) ? data.slice(prefix.length) : null;
}

export async function answerAdminCallback(ctx, text = null, showAlert = false) {
  if (!ctx.callbackQuery) {
    return;
  }

  try {
    await ctx.answerCbQuery(text ?? undefined, {
      show_alert: showAlert,
    });
  } catch {
    // Ignore callback acknowledgement errors.
  }
}

export async function ensureAdminSceneAccess(ctx, permission = null) {
  const adminService = ctx.state.services.adminService;

  if (permission) {
    return adminService.assertPermission(ctx.from.id, permission);
  }

  const admin = await adminService.getAdminByActorId(ctx.from.id);

  if (!admin) {
    throw new ForbiddenError(BOT_TEXTS.ADMIN_ONLY);
  }

  return admin;
}

export async function safeEditOrReply(ctx, text, markup = undefined) {
  const extra = normalizeInlineMarkup(markup);
  const candidates = getAdminPanelCandidates(ctx);

  await clearStaleCallbackKeyboard(ctx);

  for (const target of candidates) {
    try {
      await ctx.telegram.editMessageText(
        target.chatId,
        target.messageId,
        undefined,
        text,
        extra,
      );

      rememberAdminPanel(ctx, target);
      return target;
    } catch (error) {
      if (isUnavailableMessageError(error)) {
        if (isSamePanelTarget(getStoredPanel(ctx), target)) {
          clearStoredPanel(ctx);
        }

        continue;
      }

      if (!isMessageNotModifiedError(error)) {
        throw error;
      }

      try {
        await ctx.telegram.editMessageReplyMarkup(
          target.chatId,
          target.messageId,
          undefined,
          extra.reply_markup,
        );
        rememberAdminPanel(ctx, target);
        return target;
      } catch (replyMarkupError) {
        if (isUnavailableMessageError(replyMarkupError)) {
          if (isSamePanelTarget(getStoredPanel(ctx), target)) {
            clearStoredPanel(ctx);
          }

          continue;
        }

        if (!isMessageNotModifiedError(replyMarkupError)) {
          throw replyMarkupError;
        }

        rememberAdminPanel(ctx, target);
        return target;
      }
    }
  }

  await clearPreviousAdminKeyboard(ctx);

  const sentMessage = await ctx.reply(text, extra);
  const target = {
    chatId: sentMessage.chat.id,
    messageId: sentMessage.message_id,
  };

  rememberAdminPanel(ctx, target);
  return target;
}

export async function renderAdminPanel(ctx, text, markup = undefined) {
  return safeEditOrReply(ctx, text, markup);
}

export async function renderFreshAdminPanel(ctx, text, markup = undefined) {
  const callbackPanel = getCallbackPanel(ctx);

  if (callbackPanel) {
    await clearAdminKeyboardByTarget(ctx, callbackPanel);
  }

  await clearPreviousAdminKeyboard(ctx, callbackPanel);

  const extra = normalizeInlineMarkup(markup);
  const sentMessage = await ctx.reply(text, extra);
  const target = {
    chatId: sentMessage.chat.id,
    messageId: sentMessage.message_id,
  };

  rememberAdminPanel(ctx, target);
  return target;
}

export async function renderAdminMenu(ctx, admin, text = null, { fresh = false } = {}) {
  const renderPanel = fresh ? renderFreshAdminPanel : renderAdminPanel;

  await renderPanel(
    ctx,
    text ?? formatAdminWelcome(admin),
    getAdminMenuKeyboard({
      admin,
      hasPermission: ctx.state.services.adminService.hasPermission,
      isRootAdmin: ctx.state.services.adminService.isRootAdminRecord,
    }),
  );
}

export async function showAdminMenu(ctx, admin, text = null) {
  await renderAdminMenu(ctx, admin, text);
}

export async function leaveAdminScene(ctx, admin, message = null) {
  await ctx.scene.leave();
  await renderAdminMenu(ctx, admin, message);
}

export async function maybeLeaveAdminScene(ctx, admin, message = null) {
  const text = getAdminText(ctx);
  const callbackData = getAdminCallbackData(ctx);

  if (
    text === ADMIN_TEXT_CANCEL ||
    text === ADMIN_TEXT_BACK ||
    text === '/cancel' ||
    text === '/admin' ||
    callbackData === ADMIN_CALLBACKS.SCENE_CANCEL ||
    callbackData === ADMIN_CALLBACKS.MENU
  ) {
    await answerAdminCallback(ctx);
    await leaveAdminScene(ctx, admin, message);
    return true;
  }

  return false;
}
