# Admin UX Single Panel Changes

## src/bot/scenes/adminShared.js

`$(System.Collections.Hashtable.Lang)
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

export const ADMIN_TEXT_CANCEL = 'РћС‚РјРµРЅР°';
export const ADMIN_TEXT_BACK = 'РќР°Р·Р°Рґ';

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

export async function renderAdminMenu(ctx, admin, text = null) {
  await renderAdminPanel(
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
```

## src/bot/handlers/adminHandlers.js

`$(System.Collections.Hashtable.Lang)
import { createReadStream } from 'node:fs';

import {
  ADMIN_PERMISSIONS,
  AUDIT_ACTIONS,
  BOT_TEXTS,
} from '../../utils/constants.js';
import { ForbiddenError } from '../../utils/errors.js';
import {
  formatAdminBookingList,
  formatAdminDebtorsList,
} from '../../utils/formatters.js';
import {
  ADMIN_CALLBACKS,
  getAdminBackKeyboard,
  getAdminOptionKeyboard,
} from '../keyboards/admin.js';
import { getMainMenuKeyboard } from '../keyboards/mainMenu.js';
import { ADMIN_ADMIN_SCENE_ID } from '../scenes/adminAdminScene.js';
import { ADMIN_BOUTIQUE_SCENE_ID } from '../scenes/adminBoutiqueScene.js';
import {
  renderAdminMenu,
  renderAdminPanel,
} from '../scenes/adminShared.js';
import { ADMIN_SLOT_SCENE_ID } from '../scenes/adminSlotScene.js';
import { ADMIN_TIME_SLOT_SCENE_ID } from '../scenes/adminTimeSlotScene.js';
import { ADMIN_USER_SCENE_ID } from '../scenes/adminUserScene.js';

const AWAITING_PDF_UPLOAD_KEY = 'registration_welcome_pdf';

function getBackToMenuKeyboard() {
  return getAdminBackKeyboard(ADMIN_CALLBACKS.MENU, 'РќР°Р·Р°Рґ');
}

function buildPdfUploadText(prefix = '') {
  const lines = [];

  if (prefix) {
    lines.push(prefix, '');
  }

  lines.push('РћС‚РїСЂР°РІСЊС‚Рµ PDF РѕРґРЅРёРј СЃРѕРѕР±С‰РµРЅРёРµРј.');
  lines.push('РџРѕСЃР»Рµ Р·Р°РіСЂСѓР·РєРё РѕРЅ СЃС‚Р°РЅРµС‚ Р°РєС‚РёРІРЅС‹Рј.');

  return lines.join('\n');
}

async function rejectAccess(ctx, message = BOT_TEXTS.ADMIN_ONLY) {
  if (ctx.callbackQuery) {
    await ctx.answerCbQuery(message, {
      show_alert: true,
    });
    return;
  }

  await ctx.reply(message, getMainMenuKeyboard());
}

async function resolveAdmin(ctx, permission = null) {
  try {
    if (permission) {
      return await ctx.state.services.adminService.assertPermission(ctx.from.id, permission);
    }

    return await ctx.state.services.adminService.getAdminByActorId(ctx.from.id);
  } catch (error) {
    if (error instanceof ForbiddenError) {
      await rejectAccess(ctx, error.message);
      return null;
    }

    throw error;
  }
}

async function resolveRootAdmin(ctx) {
  try {
    return await ctx.state.services.adminService.assertRootAdmin(ctx.from.id);
  } catch (error) {
    if (error instanceof ForbiddenError) {
      await rejectAccess(ctx, error.message);
      return null;
    }

    throw error;
  }
}

async function logAdminAction(services, admin, action, comment, extra = {}) {
  await services.googleSheets.logAdminAction({
    action,
    adminId: admin.user.telegramId,
    comment,
    ...extra,
  });
}

async function resetAdminScene(ctx) {
  if (!ctx.scene?.current) {
    return;
  }

  await ctx.scene.leave();
}

async function renderAdminRecentBookings(ctx, services) {
  const bookings = await services.bookingService.getVisibleAdminBookings(20);

  await renderAdminPanel(
    ctx,
    formatAdminBookingList(bookings, 'РџРѕСЃР»РµРґРЅРёРµ Р·Р°СЏРІРєРё', 'РџРѕРєР° Р·Р°СЏРІРѕРє РЅРµС‚.'),
    getBackToMenuKeyboard(),
  );
}

async function renderAdminTodayBookings(ctx, services) {
  const bookings = await services.bookingService.getAdminBookingsForToday(50);

  await renderAdminPanel(
    ctx,
    formatAdminBookingList(bookings, 'Р—Р°СЏРІРєРё Р·Р° СЃРµРіРѕРґРЅСЏ', 'РЎРµРіРѕРґРЅСЏ Р·Р°СЏРІРѕРє РїРѕРєР° РЅРµС‚.'),
    getBackToMenuKeyboard(),
  );
}

export function registerAdminHandlers(bot, { services, env }) {
  bot.command('admin', async (ctx) => {
    const admin = await resolveAdmin(ctx);

    if (!admin) {
      return;
    }

    await resetAdminScene(ctx);
    await renderAdminMenu(ctx, admin);
  });

  bot.command('upload_registration_pdf', async (ctx) => {
    const admin = await resolveAdmin(ctx, ADMIN_PERMISSIONS.MANAGE_PDFS);

    if (!admin) {
      return;
    }

    await resetAdminScene(ctx);
    ctx.session ??= {};
    ctx.session.awaitingPdfUpload = AWAITING_PDF_UPLOAD_KEY;

    await renderAdminPanel(
      ctx,
      buildPdfUploadText(),
      getBackToMenuKeyboard(),
    );
  });

  const openMenuHandler = async (ctx) => {
    const admin = await resolveAdmin(ctx);

    if (!admin) {
      return;
    }

    await ctx.answerCbQuery();
    await renderAdminMenu(ctx, admin);
  };

  bot.action(ADMIN_CALLBACKS.MENU, openMenuHandler);
  bot.action(ADMIN_CALLBACKS.REFRESH, openMenuHandler);

  bot.action(ADMIN_CALLBACKS.BOOKINGS_RECENT, async (ctx) => {
    const admin = await resolveAdmin(ctx, ADMIN_PERMISSIONS.VIEW_BOOKINGS);

    if (!admin) {
      return;
    }

    await ctx.answerCbQuery();
    await renderAdminRecentBookings(ctx, services);

    await logAdminAction(
      services,
      admin,
      AUDIT_ACTIONS.VIEW_RECENT_BOOKINGS,
      'РџСЂРѕСЃРјРѕС‚СЂ РїРѕСЃР»РµРґРЅРёС… Р·Р°СЏРІРѕРє',
    );
  });

  bot.action(ADMIN_CALLBACKS.BOOKINGS_TODAY, async (ctx) => {
    const admin = await resolveAdmin(ctx, ADMIN_PERMISSIONS.VIEW_BOOKINGS);

    if (!admin) {
      return;
    }

    await ctx.answerCbQuery();
    await renderAdminTodayBookings(ctx, services);

    await logAdminAction(
      services,
      admin,
      AUDIT_ACTIONS.VIEW_TODAY_BOOKINGS,
      'РџСЂРѕСЃРјРѕС‚СЂ Р·Р°СЏРІРѕРє Р·Р° СЃРµРіРѕРґРЅСЏ',
    );
  });

  bot.action(ADMIN_CALLBACKS.DEBTORS, async (ctx) => {
    const admin = await resolveAdmin(ctx, ADMIN_PERMISSIONS.VIEW_DEBTORS);

    if (!admin) {
      return;
    }

    await ctx.answerCbQuery();

    const timers = await services.timerService.listOverdueTimers(20);

    await renderAdminPanel(
      ctx,
      formatAdminDebtorsList(timers, env.RETURN_ADMIN_ALERT_DAYS),
      getBackToMenuKeyboard(),
    );

    await logAdminAction(
      services,
      admin,
      AUDIT_ACTIONS.VIEW_DEBTORS,
      'РџСЂРѕСЃРјРѕС‚СЂ РґРѕР»Р¶РЅРёРєРѕРІ РїРѕ РІРµС‰Р°Рј',
    );
  });

  bot.action(ADMIN_CALLBACKS.USERS_MENU, async (ctx) => {
    const admin = await resolveAdmin(ctx, ADMIN_PERMISSIONS.MANAGE_USERS);

    if (!admin) {
      return;
    }

    await ctx.answerCbQuery();
    await renderAdminPanel(
      ctx,
      'РџРѕР»СЊР·РѕРІР°С‚РµР»Рё\nР’С‹Р±РµСЂРё РґРµР№СЃС‚РІРёРµ.',
      getAdminOptionKeyboard(
        [
          { text: 'Р—Р°Р±Р»РѕРєРёСЂРѕРІР°С‚СЊ', callbackData: ADMIN_CALLBACKS.USER_BLOCK },
          { text: 'Р Р°Р·Р±Р»РѕРєРёСЂРѕРІР°С‚СЊ', callbackData: ADMIN_CALLBACKS.USER_UNBLOCK },
        ],
        {
          cancelCallbackData: ADMIN_CALLBACKS.MENU,
          cancelText: 'РќР°Р·Р°Рґ',
        },
      ),
    );
  });

  bot.action(ADMIN_CALLBACKS.BOUTIQUES_MENU, async (ctx) => {
    const admin = await resolveAdmin(ctx, ADMIN_PERMISSIONS.MANAGE_BOUTIQUES);

    if (!admin) {
      return;
    }

    await ctx.answerCbQuery();
    await renderAdminPanel(
      ctx,
      'Р‘СѓС‚РёРєРё\nР’С‹Р±РµСЂРё РґРµР№СЃС‚РІРёРµ.',
      getAdminOptionKeyboard(
        [
          { text: 'Р”РѕР±Р°РІРёС‚СЊ Р±СѓС‚РёРє', callbackData: ADMIN_CALLBACKS.BOUTIQUE_ADD },
          { text: 'РЈРґР°Р»РёС‚СЊ Р±СѓС‚РёРє', callbackData: ADMIN_CALLBACKS.BOUTIQUE_REMOVE },
        ],
        {
          cancelCallbackData: ADMIN_CALLBACKS.MENU,
          cancelText: 'РќР°Р·Р°Рґ',
        },
      ),
    );
  });

  bot.action(ADMIN_CALLBACKS.TIME_SLOTS_MENU, async (ctx) => {
    const admin = await resolveAdmin(ctx, ADMIN_PERMISSIONS.MANAGE_TIME_SLOTS);

    if (!admin) {
      return;
    }

    await ctx.answerCbQuery();
    await renderAdminPanel(
      ctx,
      'РЎР»РѕС‚С‹\nР’С‹Р±РµСЂРё РґРµР№СЃС‚РІРёРµ.',
      getAdminOptionKeyboard(
        [
          { text: 'Р”РѕР±Р°РІРёС‚СЊ СЃР»РѕС‚', callbackData: ADMIN_CALLBACKS.TIME_SLOT_ADD },
          { text: 'РЈРґР°Р»РёС‚СЊ СЃР»РѕС‚', callbackData: ADMIN_CALLBACKS.TIME_SLOT_REMOVE },
        ],
        {
          cancelCallbackData: ADMIN_CALLBACKS.MENU,
          cancelText: 'РќР°Р·Р°Рґ',
        },
      ),
    );
  });

  bot.action(ADMIN_CALLBACKS.ADMINS_MENU, async (ctx) => {
    const admin = await resolveRootAdmin(ctx);

    if (!admin) {
      return;
    }

    await ctx.answerCbQuery();
    await ctx.scene.enter(ADMIN_ADMIN_SCENE_ID);
  });

  bot.action(ADMIN_CALLBACKS.SLOT_CLOSE, async (ctx) => {
    const admin = await resolveAdmin(ctx, ADMIN_PERMISSIONS.MANAGE_SLOTS);

    if (!admin) {
      return;
    }

    await ctx.answerCbQuery();
    await ctx.scene.enter(ADMIN_SLOT_SCENE_ID, { mode: 'close' });
  });

  bot.action(ADMIN_CALLBACKS.SLOT_OPEN, async (ctx) => {
    const admin = await resolveAdmin(ctx, ADMIN_PERMISSIONS.MANAGE_SLOTS);

    if (!admin) {
      return;
    }

    await ctx.answerCbQuery();
    await ctx.scene.enter(ADMIN_SLOT_SCENE_ID, { mode: 'open' });
  });

  bot.action(ADMIN_CALLBACKS.USER_BLOCK, async (ctx) => {
    const admin = await resolveAdmin(ctx, ADMIN_PERMISSIONS.MANAGE_USERS);

    if (!admin) {
      return;
    }

    await ctx.answerCbQuery();
    await ctx.scene.enter(ADMIN_USER_SCENE_ID, { mode: 'block' });
  });

  bot.action(ADMIN_CALLBACKS.USER_UNBLOCK, async (ctx) => {
    const admin = await resolveAdmin(ctx, ADMIN_PERMISSIONS.MANAGE_USERS);

    if (!admin) {
      return;
    }

    await ctx.answerCbQuery();
    await ctx.scene.enter(ADMIN_USER_SCENE_ID, { mode: 'unblock' });
  });

  bot.action(ADMIN_CALLBACKS.PDF_UPLOAD, async (ctx) => {
    const admin = await resolveAdmin(ctx, ADMIN_PERMISSIONS.MANAGE_PDFS);

    if (!admin) {
      return;
    }

    ctx.session ??= {};
    ctx.session.awaitingPdfUpload = AWAITING_PDF_UPLOAD_KEY;

    await ctx.answerCbQuery();
    await renderAdminPanel(
      ctx,
      buildPdfUploadText(),
      getBackToMenuKeyboard(),
    );
  });

  bot.action(ADMIN_CALLBACKS.EXPORT_DATA, async (ctx) => {
    const admin = await resolveAdmin(ctx, ADMIN_PERMISSIONS.EXPORT_DATA);

    if (!admin) {
      return;
    }

    await ctx.answerCbQuery('Р“РѕС‚РѕРІР»СЋ CSV...');

    const exportResult = await services.adminService.exportDataToCsv(ctx.from.id);

    await ctx.replyWithDocument(
      {
        source: createReadStream(exportResult.filePath),
        filename: exportResult.fileName,
      },
      {
        caption: `Р“РѕС‚РѕРІРѕ. Р’ РІС‹РіСЂСѓР·РєРµ ${exportResult.rowsCount} СЃС‚СЂРѕРє.`,
      },
    );

    await renderAdminMenu(ctx, admin, 'Р’С‹РіСЂСѓР·РєР° РѕС‚РїСЂР°РІР»РµРЅР°.');
    await logAdminAction(
      services,
      admin,
      AUDIT_ACTIONS.DATA_EXPORTED,
      `Р’С‹РіСЂСѓР¶РµРЅ CSV ${exportResult.fileName}, СЃС‚СЂРѕРє: ${exportResult.rowsCount}`,
    );
  });

  bot.action(ADMIN_CALLBACKS.BOUTIQUE_ADD, async (ctx) => {
    const admin = await resolveAdmin(ctx, ADMIN_PERMISSIONS.MANAGE_BOUTIQUES);

    if (!admin) {
      return;
    }

    await ctx.answerCbQuery();
    await ctx.scene.enter(ADMIN_BOUTIQUE_SCENE_ID, { mode: 'add' });
  });

  bot.action(ADMIN_CALLBACKS.BOUTIQUE_REMOVE, async (ctx) => {
    const admin = await resolveAdmin(ctx, ADMIN_PERMISSIONS.MANAGE_BOUTIQUES);

    if (!admin) {
      return;
    }

    await ctx.answerCbQuery();
    await ctx.scene.enter(ADMIN_BOUTIQUE_SCENE_ID, { mode: 'remove' });
  });

  bot.action(ADMIN_CALLBACKS.TIME_SLOT_ADD, async (ctx) => {
    const admin = await resolveAdmin(ctx, ADMIN_PERMISSIONS.MANAGE_TIME_SLOTS);

    if (!admin) {
      return;
    }

    await ctx.answerCbQuery();
    await ctx.scene.enter(ADMIN_TIME_SLOT_SCENE_ID, { mode: 'add' });
  });

  bot.action(ADMIN_CALLBACKS.TIME_SLOT_REMOVE, async (ctx) => {
    const admin = await resolveAdmin(ctx, ADMIN_PERMISSIONS.MANAGE_TIME_SLOTS);

    if (!admin) {
      return;
    }

    await ctx.answerCbQuery();
    await ctx.scene.enter(ADMIN_TIME_SLOT_SCENE_ID, { mode: 'remove' });
  });

  bot.on('document', async (ctx, next) => {
    const awaitingUpload = ctx.session?.awaitingPdfUpload === AWAITING_PDF_UPLOAD_KEY;

    if (!awaitingUpload) {
      return next();
    }

    const admin = await resolveAdmin(ctx, ADMIN_PERMISSIONS.MANAGE_PDFS);

    if (!admin) {
      return undefined;
    }

    const document = ctx.message.document;

    if (document.mime_type !== 'application/pdf') {
      await renderAdminPanel(
        ctx,
        buildPdfUploadText('РќСѓР¶РµРЅ РёРјРµРЅРЅРѕ PDF-С„Р°Р№Р». РџРѕРїСЂРѕР±СѓР№С‚Рµ РµС‰Рµ СЂР°Р·.'),
        getBackToMenuKeyboard(),
      );
      return undefined;
    }

    await services.pdfStorage.saveRegistrationTemplatePdf({
      adminId: admin.id,
      fileId: document.file_id,
      fileName: document.file_name ?? 'registration.pdf',
      mimeType: document.mime_type,
    });

    ctx.session ??= {};
    delete ctx.session.awaitingPdfUpload;

    await renderAdminMenu(
      ctx,
      admin,
      'PDF СЃРѕС…СЂР°РЅС‘РЅ.',
    );

    await logAdminAction(
      services,
      admin,
      AUDIT_ACTIONS.PDF_UPLOADED,
      `Р—Р°РіСЂСѓР¶РµРЅ PDF ${document.file_name ?? 'registration.pdf'}`,
      {
        pdfFileId: document.file_id,
      },
    );

    return undefined;
  });
}
```

