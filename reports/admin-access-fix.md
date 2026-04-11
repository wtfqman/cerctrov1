# Admin Access Fix

[src/bot/utils/adminEntry.js](/c:/Users/PC/OneDrive/Desktop/cerca%20trova%20bot/src/bot/utils/adminEntry.js)
`$(System.Collections.Hashtable.Lang)
import { BOT_TEXTS } from '../../utils/constants.js';
import { getMainMenuKeyboard } from '../keyboards/mainMenu.js';
import { renderAdminMenu } from '../scenes/adminShared.js';

function getMessageText(ctx) {
  return ctx.message?.text?.trim() ?? '';
}

export async function maybeOpenAdminMenuFromScene(ctx) {
  if (getMessageText(ctx) !== '/admin') {
    return false;
  }

  const admin = await ctx.state.services.adminService.getAdminByActorId(ctx.from.id);

  if (!admin) {
    await ctx.reply(BOT_TEXTS.ADMIN_ONLY, getMainMenuKeyboard());
    return true;
  }

  await ctx.scene.leave();
  await renderAdminMenu(ctx, admin);
  return true;
}
```

[src/bot/handlers/adminHandlers.js](/c:/Users/PC/OneDrive/Desktop/cerca%20trova%20bot/src/bot/handlers/adminHandlers.js)
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

    const admin = await ctx.state.services.adminService.getAdminByActorId(ctx.from.id);

    if (!admin) {
      await rejectAccess(ctx);
      return null;
    }

    return admin;
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

[src/bot/scenes/registrationScene.js](/c:/Users/PC/OneDrive/Desktop/cerca%20trova%20bot/src/bot/scenes/registrationScene.js)
`$(System.Collections.Hashtable.Lang)
import { Scenes } from 'telegraf';

import { BOT_TEXTS } from '../../utils/constants.js';
import { ValidationError } from '../../utils/errors.js';
import { formatRegistrationConfirmation } from '../../utils/formatters.js';
import { parseRegistrationSizes } from '../../utils/registration.js';
import { ensureNonEmptyString } from '../../utils/validators.js';
import {
  getRegistrationCancelKeyboard,
  getRegistrationConfirmKeyboard,
  getRegistrationStepKeyboard,
  getUsernameKeyboard,
  REGISTRATION_BUTTONS,
} from '../keyboards/registration.js';
import { getMainMenuKeyboard } from '../keyboards/mainMenu.js';
import { maybeOpenAdminMenuFromScene } from '../utils/adminEntry.js';
import { REGISTRATION_EDIT_SCENE_ID, REGISTRATION_SCENE_ID } from './sceneIds.js';

export { REGISTRATION_SCENE_ID };

function getSceneState(ctx) {
  ctx.wizard.state.registrationDraft ??= {};
  return ctx.wizard.state.registrationDraft;
}

function getMessageText(ctx) {
  return ctx.message?.text?.trim() ?? '';
}

function isCancelAction(ctx) {
  const text = getMessageText(ctx);
  return text === REGISTRATION_BUTTONS.CANCEL || text === '/cancel';
}

function isBackAction(ctx) {
  return getMessageText(ctx) === REGISTRATION_BUTTONS.BACK;
}

function buildBlockedMessage(user, supportContact) {
  const lines = [BOT_TEXTS.BLOCKED];

  if (user.blockedReason) {
    lines.push(`РџСЂРёС‡РёРЅР°: ${user.blockedReason}`);
  }

  lines.push(`Р•СЃР»Рё РЅСѓР¶РЅР° РїРѕРјРѕС‰СЊ: ${supportContact}`);

  return lines.join('\n');
}

async function leaveWithMainMenu(ctx, message) {
  await ctx.reply(message, getMainMenuKeyboard());
  await ctx.scene.leave();
}

async function cancelFlow(ctx) {
  await leaveWithMainMenu(ctx, 'Р РµРіРёСЃС‚СЂР°С†РёСЋ РјРѕР¶РЅРѕ РїСЂРѕРґРѕР»Р¶РёС‚СЊ РїРѕР·Р¶Рµ.');
}

async function ensureRegistrationAccess(ctx) {
  const user = await ctx.state.services.registrationService.ensureTelegramUser(ctx.from);
  const isBlocked = await ctx.state.services.bookingService.isUserBlocked(user.id);

  if (isBlocked) {
    await leaveWithMainMenu(ctx, buildBlockedMessage(user, ctx.state.env.SUPPORT_CONTACT));
    return null;
  }

  return user;
}

async function promptFullName(ctx) {
  await ctx.reply(
    'РќР°РїРёС€Рё Р¤РРћ',
    getRegistrationCancelKeyboard(),
  );
}

async function promptPhone(ctx) {
  await ctx.reply('РќР°РїРёС€Рё РЅРѕРјРµСЂ С‚РµР»РµС„РѕРЅР°', getRegistrationStepKeyboard());
}

async function promptUsername(ctx) {
  await ctx.reply(
    'РќР°РїРёС€Рё СЃРІРѕР№ РЅРёРє РІ Telegram\nРќР°РїСЂРёРјРµСЂ: @username',
    getUsernameKeyboard(Boolean(ctx.from?.username)),
  );
}

async function promptAddress(ctx) {
  await ctx.reply('РќР°РїРёС€Рё РґРѕРјР°С€РЅРёР№ Р°РґСЂРµСЃ', getRegistrationStepKeyboard());
}

async function promptCdekAddress(ctx) {
  await ctx.reply('РќР°РїРёС€Рё Р°РґСЂРµСЃ РЎР”Р­Рљ', getRegistrationStepKeyboard());
}

async function promptSizes(ctx) {
  await ctx.reply(BOT_TEXTS.REGISTRATION_SIZE_TEMPLATE, getRegistrationStepKeyboard());
}

export function createRegistrationScene() {
  return new Scenes.WizardScene(
    REGISTRATION_SCENE_ID,
    async (ctx) => {
      if (await maybeOpenAdminMenuFromScene(ctx)) {
        return undefined;
      }

      const user = await ensureRegistrationAccess(ctx);

      if (!user) {
        return undefined;
      }

      const existingRegistration = await ctx.state.services.registrationService.getRegistrationByUserId(user.id);

      if (existingRegistration) {
        await ctx.scene.enter(REGISTRATION_EDIT_SCENE_ID);
        return undefined;
      }

      ctx.wizard.state.registrationDraft = {
        profileUsername: ctx.from?.username ? `@${ctx.from.username}` : null,
        userId: user.id,
      };

      await ctx.reply('Р”Р°РІР°Р№ Р±С‹СЃС‚СЂРѕ Р·Р°РїРѕР»РЅРёРј СЂРµРіРёСЃС‚СЂР°С†РёСЋ вњЁ');
      await promptFullName(ctx);
      return ctx.wizard.next();
    },
    async (ctx) => {
      if (await maybeOpenAdminMenuFromScene(ctx)) {
        return undefined;
      }

      if (isCancelAction(ctx)) {
        await cancelFlow(ctx);
        return undefined;
      }

      const fullName = getMessageText(ctx);

      try {
        getSceneState(ctx).fullName = ensureNonEmptyString(fullName, 'Р¤РРћ');
      } catch (error) {
        if (error instanceof ValidationError) {
          await ctx.reply('РќР°РїРёС€Рё Р¤РРћ', getRegistrationCancelKeyboard());
          return undefined;
        }

        throw error;
      }

      await promptPhone(ctx);
      return ctx.wizard.next();
    },
    async (ctx) => {
      if (await maybeOpenAdminMenuFromScene(ctx)) {
        return undefined;
      }

      if (isCancelAction(ctx)) {
        await cancelFlow(ctx);
        return undefined;
      }

      if (isBackAction(ctx)) {
        await promptFullName(ctx);
        ctx.wizard.selectStep(1);
        return undefined;
      }

      const phone = getMessageText(ctx);

      try {
        getSceneState(ctx).phone = ensureNonEmptyString(phone, 'РўРµР»РµС„РѕРЅ');
      } catch (error) {
        if (error instanceof ValidationError) {
          await promptPhone(ctx);
          return undefined;
        }

        throw error;
      }

      await promptUsername(ctx);
      return ctx.wizard.next();
    },
    async (ctx) => {
      if (await maybeOpenAdminMenuFromScene(ctx)) {
        return undefined;
      }

      if (isCancelAction(ctx)) {
        await cancelFlow(ctx);
        return undefined;
      }

      if (isBackAction(ctx)) {
        await promptPhone(ctx);
        ctx.wizard.selectStep(2);
        return undefined;
      }

      const state = getSceneState(ctx);
      const text = getMessageText(ctx);

      if (text === REGISTRATION_BUTTONS.USE_PROFILE_USERNAME) {
        if (!state.profileUsername) {
          await promptUsername(ctx);
          return undefined;
        }

        state.telegramUsername = state.profileUsername;
      } else {
        try {
          state.telegramUsername = ensureNonEmptyString(text, 'Telegram username');
        } catch (error) {
          if (error instanceof ValidationError) {
            await promptUsername(ctx);
            return undefined;
          }

          throw error;
        }
      }

      await promptAddress(ctx);
      return ctx.wizard.next();
    },
    async (ctx) => {
      if (await maybeOpenAdminMenuFromScene(ctx)) {
        return undefined;
      }

      if (isCancelAction(ctx)) {
        await cancelFlow(ctx);
        return undefined;
      }

      if (isBackAction(ctx)) {
        await promptUsername(ctx);
        ctx.wizard.selectStep(3);
        return undefined;
      }

      const address = getMessageText(ctx);

      try {
        getSceneState(ctx).homeAddress = ensureNonEmptyString(address, 'Р”РѕРјР°С€РЅРёР№ Р°РґСЂРµСЃ');
      } catch (error) {
        if (error instanceof ValidationError) {
          await promptAddress(ctx);
          return undefined;
        }

        throw error;
      }

      await promptCdekAddress(ctx);
      return ctx.wizard.next();
    },
    async (ctx) => {
      if (await maybeOpenAdminMenuFromScene(ctx)) {
        return undefined;
      }

      if (isCancelAction(ctx)) {
        await cancelFlow(ctx);
        return undefined;
      }

      if (isBackAction(ctx)) {
        await promptAddress(ctx);
        ctx.wizard.selectStep(4);
        return undefined;
      }

      const cdekAddress = getMessageText(ctx);

      try {
        getSceneState(ctx).cdekAddress = ensureNonEmptyString(cdekAddress, 'РђРґСЂРµСЃ РЎР”Р­Рљ');
      } catch (error) {
        if (error instanceof ValidationError) {
          await promptCdekAddress(ctx);
          return undefined;
        }

        throw error;
      }

      await promptSizes(ctx);
      return ctx.wizard.next();
    },
    async (ctx) => {
      if (await maybeOpenAdminMenuFromScene(ctx)) {
        return undefined;
      }

      if (isCancelAction(ctx)) {
        await cancelFlow(ctx);
        return undefined;
      }

      if (isBackAction(ctx)) {
        await promptCdekAddress(ctx);
        ctx.wizard.selectStep(5);
        return undefined;
      }

      const sizes = getMessageText(ctx);

      try {
        const normalizedSizes = ensureNonEmptyString(sizes, 'Р Р°Р·РјРµСЂС‹');
        const parsedSizes = parseRegistrationSizes(normalizedSizes);

        if (!parsedSizes.hasStructuredData) {
          await ctx.reply(
            'Р—Р°РїРѕР»РЅРё СЂР°Р·РјРµСЂС‹ РїРѕ С€Р°Р±Р»РѕРЅСѓ РЅРёР¶Рµ, С‡С‚РѕР±С‹ СЏ РїРѕРєР°Р·Р°Р» РёС… Р°РєРєСѓСЂР°С‚РЅРѕ РїРѕ РїРѕР»СЏРј.',
            getRegistrationStepKeyboard(),
          );
          await promptSizes(ctx);
          return undefined;
        }

        getSceneState(ctx).sizes = parsedSizes.normalizedText || parsedSizes.rawText;
      } catch (error) {
        if (error instanceof ValidationError) {
          await promptSizes(ctx);
          return undefined;
        }

        throw error;
      }

      await ctx.reply(
        formatRegistrationConfirmation(getSceneState(ctx)),
        getRegistrationConfirmKeyboard(),
      );
      return ctx.wizard.next();
    },
    async (ctx) => {
      if (await maybeOpenAdminMenuFromScene(ctx)) {
        return undefined;
      }

      if (isCancelAction(ctx)) {
        await cancelFlow(ctx);
        return undefined;
      }

      const action = getMessageText(ctx);

      if (action === REGISTRATION_BUTTONS.BACK) {
        await promptSizes(ctx);
        ctx.wizard.selectStep(6);
        return undefined;
      }

      if (action === REGISTRATION_BUTTONS.RESTART) {
        ctx.wizard.state.registrationDraft = {
          profileUsername: getSceneState(ctx).profileUsername,
          userId: getSceneState(ctx).userId,
        };
        await promptFullName(ctx);
        ctx.wizard.selectStep(1);
        return undefined;
      }

      if (action !== REGISTRATION_BUTTONS.CONFIRM) {
        await ctx.reply('Р’С‹Р±РµСЂРё РєРЅРѕРїРєСѓ РЅРёР¶Рµ.', getRegistrationConfirmKeyboard());
        return undefined;
      }

      const state = getSceneState(ctx);

      try {
        await ctx.state.services.registrationService.registerUser({
          userId: state.userId,
          fullName: state.fullName,
          phone: state.phone,
          telegramUsername: state.telegramUsername,
          homeAddress: state.homeAddress,
          cdekAddress: state.cdekAddress,
          sizes: state.sizes,
          telegramProfileUsername: state.profileUsername,
        });

        await ctx.reply(
          BOT_TEXTS.REGISTRATION_DONE,
          getMainMenuKeyboard(),
        );

        const pdfResult = await ctx.state.services.registrationService.sendRegistrationPdf({
          chatId: ctx.chat.id,
          telegram: ctx.telegram,
          userId: state.userId,
        });

        if (!pdfResult.sent) {
          await ctx.reply(pdfResult.message, getMainMenuKeyboard());
        }

        await ctx.scene.leave();
        return undefined;
      } catch (error) {
        if (error instanceof ValidationError) {
          await ctx.reply(error.message);

          if (error.details?.field === 'phone') {
            await promptPhone(ctx);
            ctx.wizard.selectStep(2);
            return undefined;
          }

          if (error.details?.field === 'registration') {
            await ctx.scene.enter(REGISTRATION_EDIT_SCENE_ID);
            return undefined;
          }

          await ctx.reply(
            formatRegistrationConfirmation(state),
            getRegistrationConfirmKeyboard(),
          );
          return undefined;
        }

        throw error;
      }
    },
  );
}
```

[src/bot/scenes/registrationEditScene.js](/c:/Users/PC/OneDrive/Desktop/cerca%20trova%20bot/src/bot/scenes/registrationEditScene.js)
`$(System.Collections.Hashtable.Lang)
import { Scenes } from 'telegraf';

import { BOT_TEXTS } from '../../utils/constants.js';
import { ValidationError } from '../../utils/errors.js';
import { formatRegistrationSizes, getRegistrationCdekAddress, getRegistrationHomeAddress } from '../../utils/registration.js';
import { REGISTRATION_EDITABLE_FIELDS, getRegistrationEditableField } from '../../utils/registrationEdit.js';
import {
  isMessageNotModifiedError,
  isUnavailableMessageError,
  normalizeInlineMarkup,
} from '../utils/inlineKeyboard.js';
import {
  getRegistrationEditFieldsKeyboard,
  getRegistrationEditPromptKeyboard,
  getRegistrationOverviewKeyboard,
  REGISTRATION_EDIT_CALLBACKS,
} from '../keyboards/registration.js';
import { getMainMenuKeyboard } from '../keyboards/mainMenu.js';
import { maybeOpenAdminMenuFromScene } from '../utils/adminEntry.js';
import { REGISTRATION_EDIT_SCENE_ID, REGISTRATION_SCENE_ID } from './sceneIds.js';

export { REGISTRATION_EDIT_SCENE_ID };

function getSceneState(ctx) {
  ctx.wizard.state.registrationEdit ??= {};
  return ctx.wizard.state.registrationEdit;
}

function getMessageText(ctx) {
  return ctx.message?.text?.trim() ?? '';
}

function getCallbackData(ctx) {
  return ctx.callbackQuery?.data ?? '';
}

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

function rememberPanel(ctx, target) {
  if (!target?.chatId || !target?.messageId) {
    return;
  }

  getSceneState(ctx).panel = target;
}

function getStoredPanel(ctx) {
  return getSceneState(ctx).panel ?? null;
}

function getPanelTarget(ctx) {
  return getCallbackPanel(ctx) ?? getStoredPanel(ctx);
}

function extractCallbackValue(ctx, prefix) {
  const callbackData = getCallbackData(ctx);
  return callbackData.startsWith(prefix) ? callbackData.slice(prefix.length) : null;
}

function isCancelAction(ctx) {
  return getMessageText(ctx) === '/cancel';
}

function buildBlockedMessage(user, supportContact) {
  const lines = [BOT_TEXTS.BLOCKED];

  if (user.blockedReason) {
    lines.push(`РџСЂРёС‡РёРЅР°: ${user.blockedReason}`);
  }

  lines.push(`Р•СЃР»Рё РЅСѓР¶РЅР° РїРѕРјРѕС‰СЊ: ${supportContact}`);

  return lines.join('\n');
}

function buildRegistrationOverviewText(registration, notice = '') {
  const homeAddress = getRegistrationHomeAddress(registration);
  const cdekAddress = getRegistrationCdekAddress(registration);

  return [
    notice,
    'РўРІРѕРё РґР°РЅРЅС‹Рµ СѓР¶Рµ СЃРѕС…СЂР°РЅРµРЅС‹ рџ’«',
    '',
    `Р¤РРћ: ${registration.fullName}`,
    `РўРµР»РµС„РѕРЅ: ${registration.phone}`,
    `РќРёРє: ${registration.telegramUsername}`,
    `Р”РѕРјР°С€РЅРёР№ Р°РґСЂРµСЃ: ${homeAddress || 'РЅРµ СѓРєР°Р·Р°РЅ'}`,
    `РђРґСЂРµСЃ РЎР”Р­Рљ: ${cdekAddress || 'РЅРµ СѓРєР°Р·Р°РЅ'}`,
    '',
    formatRegistrationSizes(registration.sizes),
  ]
    .filter(Boolean)
    .join('\n');
}

function buildFieldSelectionText(notice = '') {
  return [notice, 'Р§С‚Рѕ С…РѕС‡РµС€СЊ РёР·РјРµРЅРёС‚СЊ?']
    .filter(Boolean)
    .join('\n\n');
}

function buildPromptText(fieldConfig, notice = '') {
  return [notice, fieldConfig.prompt]
    .filter(Boolean)
    .join('\n\n');
}

async function answerRegistrationCallback(ctx, text = undefined) {
  if (!ctx.callbackQuery) {
    return;
  }

  try {
    await ctx.answerCbQuery(text);
  } catch {
    // Ignore callback acknowledgement errors.
  }
}

async function renderRegistrationPanel(ctx, text, markup = undefined) {
  const target = getPanelTarget(ctx);
  const extra = normalizeInlineMarkup(markup);

  if (target) {
    rememberPanel(ctx, target);

    try {
      await ctx.telegram.editMessageText(
        target.chatId,
        target.messageId,
        undefined,
        text,
        extra,
      );

      return target;
    } catch (error) {
      if (isUnavailableMessageError(error)) {
        delete getSceneState(ctx).panel;
      } else if (!isMessageNotModifiedError(error)) {
        throw error;
      } else {
        try {
          await ctx.telegram.editMessageReplyMarkup(
            target.chatId,
            target.messageId,
            undefined,
            extra.reply_markup,
          );

          return target;
        } catch (replyMarkupError) {
          if (isUnavailableMessageError(replyMarkupError)) {
            delete getSceneState(ctx).panel;
          } else if (!isMessageNotModifiedError(replyMarkupError)) {
            throw replyMarkupError;
          }
        }

        if (getSceneState(ctx).panel) {
          return target;
        }
      }
    }
  }

  const sentMessage = await ctx.reply(text, extra);
  const newTarget = {
    chatId: sentMessage.chat.id,
    messageId: sentMessage.message_id,
  };

  rememberPanel(ctx, newTarget);
  return newTarget;
}

async function clearRegistrationPanelKeyboard(ctx) {
  const target = getPanelTarget(ctx);

  if (!target) {
    return;
  }

  try {
    await ctx.telegram.editMessageReplyMarkup(
      target.chatId,
      target.messageId,
      undefined,
      {
        inline_keyboard: [],
      },
    );
  } catch (error) {
    if (isMessageNotModifiedError(error) || isUnavailableMessageError(error)) {
      return;
    }

    throw error;
  }
}

async function leaveToMainMenu(ctx, message = BOT_TEXTS.MENU_HINT) {
  await clearRegistrationPanelKeyboard(ctx);
  await ctx.scene.leave();
  await ctx.reply(message, getMainMenuKeyboard());
}

async function ensureRegistrationEditAccess(ctx) {
  const user = await ctx.state.services.registrationService.ensureTelegramUser(ctx.from);
  const isBlocked = await ctx.state.services.bookingService.isUserBlocked(user.id);

  if (isBlocked) {
    await leaveToMainMenu(ctx, buildBlockedMessage(user, ctx.state.env.SUPPORT_CONTACT));
    return null;
  }

  const registration = await ctx.state.services.registrationService.getRegistrationByUserId(user.id);

  if (!registration) {
    await ctx.scene.enter(REGISTRATION_SCENE_ID);
    return null;
  }

  return {
    registration,
    user,
  };
}

export function createRegistrationEditScene() {
  return new Scenes.WizardScene(
    REGISTRATION_EDIT_SCENE_ID,
    async (ctx) => {
      if (await maybeOpenAdminMenuFromScene(ctx)) {
        return undefined;
      }

      const access = await ensureRegistrationEditAccess(ctx);

      if (!access) {
        return undefined;
      }

      const state = getSceneState(ctx);
      state.registration = access.registration;
      state.userId = access.user.id;

      await renderRegistrationPanel(
        ctx,
        buildRegistrationOverviewText(access.registration),
        getRegistrationOverviewKeyboard(),
      );

      return ctx.wizard.next();
    },
    async (ctx) => {
      if (await maybeOpenAdminMenuFromScene(ctx)) {
        return undefined;
      }

      if (isCancelAction(ctx)) {
        await leaveToMainMenu(ctx, 'РР·РјРµРЅРµРЅРёРµ РґР°РЅРЅС‹С… РјРѕР¶РЅРѕ РїСЂРѕРґРѕР»Р¶РёС‚СЊ РїРѕР·Р¶Рµ.');
        return undefined;
      }

      const callbackData = getCallbackData(ctx);
      const state = getSceneState(ctx);

      if (callbackData === REGISTRATION_EDIT_CALLBACKS.OVERVIEW_BACK) {
        await answerRegistrationCallback(ctx);
        await leaveToMainMenu(ctx);
        return undefined;
      }

      if (callbackData === REGISTRATION_EDIT_CALLBACKS.OVERVIEW_EDIT) {
        await answerRegistrationCallback(ctx);
        await renderRegistrationPanel(
          ctx,
          buildFieldSelectionText(),
          getRegistrationEditFieldsKeyboard(REGISTRATION_EDITABLE_FIELDS),
        );
        return ctx.wizard.next();
      }

      if (getMessageText(ctx)) {
        await renderRegistrationPanel(
          ctx,
          buildRegistrationOverviewText(
            state.registration,
            'РќР°Р¶РјРё В«РР·РјРµРЅРёС‚СЊ РґР°РЅРЅС‹РµВ», С‡С‚РѕР±С‹ РѕР±РЅРѕРІРёС‚СЊ РЅСѓР¶РЅРѕРµ РїРѕР»Рµ.',
          ),
          getRegistrationOverviewKeyboard(),
        );
      }

      return undefined;
    },
    async (ctx) => {
      if (await maybeOpenAdminMenuFromScene(ctx)) {
        return undefined;
      }

      if (isCancelAction(ctx)) {
        await leaveToMainMenu(ctx, 'РР·РјРµРЅРµРЅРёРµ РґР°РЅРЅС‹С… РјРѕР¶РЅРѕ РїСЂРѕРґРѕР»Р¶РёС‚СЊ РїРѕР·Р¶Рµ.');
        return undefined;
      }

      const callbackData = getCallbackData(ctx);

      if (callbackData === REGISTRATION_EDIT_CALLBACKS.FIELDS_BACK) {
        await answerRegistrationCallback(ctx);
        await renderRegistrationPanel(
          ctx,
          buildRegistrationOverviewText(getSceneState(ctx).registration),
          getRegistrationOverviewKeyboard(),
        );
        ctx.wizard.selectStep(1);
        return undefined;
      }

      const fieldKey = extractCallbackValue(ctx, REGISTRATION_EDIT_CALLBACKS.FIELD_PREFIX);
      const fieldConfig = getRegistrationEditableField(fieldKey);

      if (!fieldConfig) {
        if (ctx.callbackQuery) {
          await answerRegistrationCallback(ctx, 'Р’С‹Р±РµСЂРё РїРѕР»Рµ РЅРёР¶Рµ.');
        }

        if (getMessageText(ctx)) {
          await renderRegistrationPanel(
            ctx,
            buildFieldSelectionText('РЎРЅР°С‡Р°Р»Р° РІС‹Р±РµСЂРё РїРѕР»Рµ РЅРёР¶Рµ.'),
            getRegistrationEditFieldsKeyboard(REGISTRATION_EDITABLE_FIELDS),
          );
        }

        return undefined;
      }

      const state = getSceneState(ctx);
      state.selectedField = fieldConfig.key;

      await answerRegistrationCallback(ctx);
      await renderRegistrationPanel(
        ctx,
        buildPromptText(fieldConfig),
        getRegistrationEditPromptKeyboard(),
      );

      return ctx.wizard.next();
    },
    async (ctx) => {
      if (await maybeOpenAdminMenuFromScene(ctx)) {
        return undefined;
      }

      if (isCancelAction(ctx)) {
        await leaveToMainMenu(ctx, 'РР·РјРµРЅРµРЅРёРµ РґР°РЅРЅС‹С… РјРѕР¶РЅРѕ РїСЂРѕРґРѕР»Р¶РёС‚СЊ РїРѕР·Р¶Рµ.');
        return undefined;
      }

      if (getCallbackData(ctx) === REGISTRATION_EDIT_CALLBACKS.PROMPT_BACK) {
        await answerRegistrationCallback(ctx);
        await renderRegistrationPanel(
          ctx,
          buildFieldSelectionText(),
          getRegistrationEditFieldsKeyboard(REGISTRATION_EDITABLE_FIELDS),
        );
        ctx.wizard.selectStep(2);
        return undefined;
      }

      const state = getSceneState(ctx);
      const fieldConfig = getRegistrationEditableField(state.selectedField);
      const value = getMessageText(ctx);

      if (!fieldConfig) {
        await renderRegistrationPanel(
          ctx,
          buildFieldSelectionText(),
          getRegistrationEditFieldsKeyboard(REGISTRATION_EDITABLE_FIELDS),
        );
        ctx.wizard.selectStep(2);
        return undefined;
      }

      if (!value) {
        await renderRegistrationPanel(
          ctx,
          buildPromptText(fieldConfig, 'РќР°РїРёС€Рё РЅРѕРІРѕРµ Р·РЅР°С‡РµРЅРёРµ РёР»Рё РЅР°Р¶РјРё В«РќР°Р·Р°РґВ».'),
          getRegistrationEditPromptKeyboard(),
        );
        return undefined;
      }

      try {
        const result = await ctx.state.services.registrationService.updateRegistrationField({
          field: fieldConfig.key,
          userId: state.userId,
          value,
        });

        state.registration = result.registration;
        state.selectedField = null;

        await renderRegistrationPanel(
          ctx,
          buildRegistrationOverviewText(
            result.registration,
            result.changed ? fieldConfig.successMessage : 'РЈ С‚РµР±СЏ СѓР¶Рµ СѓРєР°Р·Р°РЅРѕ СЌС‚Рѕ Р·РЅР°С‡РµРЅРёРµ.',
          ),
          getRegistrationOverviewKeyboard(),
        );
        ctx.wizard.selectStep(1);
        return undefined;
      } catch (error) {
        if (error instanceof ValidationError) {
          await renderRegistrationPanel(
            ctx,
            buildPromptText(fieldConfig, error.message),
            getRegistrationEditPromptKeyboard(),
          );
          return undefined;
        }

        throw error;
      }
    },
  );
}
```

[src/bot/scenes/bookingScene.js](/c:/Users/PC/OneDrive/Desktop/cerca%20trova%20bot/src/bot/scenes/bookingScene.js)
`$(System.Collections.Hashtable.Lang)
import { BookingRequestType, VisitMode } from '@prisma/client';
import { Scenes } from 'telegraf';

import { BOT_TEXTS } from '../../utils/constants.js';
import { getUserVisibleBoutiqueLabel } from '../../utils/boutiques.js';
import { formatDate } from '../../utils/date.js';
import { AppError } from '../../utils/errors.js';
import { formatSlotLabelForUser } from '../../utils/slots.js';
import {
  BOOKING_CALLBACKS,
  BOOKING_WIZARD_BUTTONS,
  USER_UI_OPTION_KINDS,
  getBookingConfirmKeyboard,
  getBookingTextStepKeyboard,
  getBoutiquesKeyboard,
  getDateKeyboard,
  getRequestTypeKeyboard,
  getSlotKeyboard,
  getVisitModeKeyboard,
  getWishKeyboard,
} from '../keyboards/booking.js';
import { getMainMenuKeyboard } from '../keyboards/mainMenu.js';
import { maybeOpenAdminMenuFromScene } from '../utils/adminEntry.js';
import { safelyRemoveInlineKeyboard } from '../utils/inlineKeyboard.js';

export const BOOKING_SCENE_ID = 'booking-scene';

const REQUEST_TYPE_BY_CALLBACK = Object.freeze({
  [BOOKING_CALLBACKS.REQUEST_RETURN]: BookingRequestType.RETURN,
  [BOOKING_CALLBACKS.REQUEST_PICKUP]: BookingRequestType.PICKUP,
  [BOOKING_CALLBACKS.REQUEST_RETURN_PICKUP]: BookingRequestType.RETURN_PICKUP,
});

const VISIT_MODE_BY_CALLBACK = Object.freeze({
  [BOOKING_CALLBACKS.MODE_BOUTIQUE]: VisitMode.BOUTIQUE,
  [BOOKING_CALLBACKS.MODE_DELIVERY]: VisitMode.DELIVERY,
});

function getSceneState(ctx) {
  ctx.wizard.state.bookingDraft ??= {};
  return ctx.wizard.state.bookingDraft;
}

function getMessageText(ctx) {
  return ctx.message?.text?.trim() ?? '';
}

function getCallbackData(ctx) {
  return ctx.callbackQuery?.data ?? '';
}

function isCancelAction(ctx) {
  const text = getMessageText(ctx);
  const callbackData = getCallbackData(ctx);

  return (
    text === BOOKING_WIZARD_BUTTONS.CANCEL ||
    text === '/cancel' ||
    callbackData === BOOKING_CALLBACKS.CANCEL
  );
}

function isBackAction(ctx) {
  const text = getMessageText(ctx);
  const callbackData = getCallbackData(ctx);

  return text === BOOKING_WIZARD_BUTTONS.BACK || callbackData === BOOKING_CALLBACKS.BACK;
}

function extractCallbackValue(ctx, prefix) {
  const callbackData = getCallbackData(ctx);
  return callbackData.startsWith(prefix) ? callbackData.slice(prefix.length) : null;
}

async function answerBookingCallback(ctx, text = undefined) {
  if (!ctx.callbackQuery) {
    return;
  }

  try {
    await ctx.answerCbQuery(text);
  } catch {
    // Ignore callback acknowledgement errors.
  }
}

function buildBlockedMessage(user, supportContact) {
  const lines = [BOT_TEXTS.BLOCKED];

  if (user.blockedReason) {
    lines.push(`РџСЂРёС‡РёРЅР°: ${user.blockedReason}`);
  }

  lines.push(`Р•СЃР»Рё РЅСѓР¶РЅР° РїРѕРјРѕС‰СЊ: ${supportContact}`);

  return lines.join('\n');
}

async function leaveWithMainMenu(ctx, message) {
  await safelyRemoveInlineKeyboard(ctx);
  await ctx.reply(message, getMainMenuKeyboard());
  await ctx.scene.leave();
}

async function cancelFlow(ctx) {
  await leaveWithMainMenu(ctx, 'Р—Р°СЏРІРєСѓ РјРѕР¶РЅРѕ РѕС„РѕСЂРјРёС‚СЊ РїРѕР·Р¶Рµ.');
}

function getRequestTypeLabel(requestType) {
  return {
    [BookingRequestType.RETURN]: 'Р’РѕР·РІСЂР°С‚',
    [BookingRequestType.PICKUP]: 'Р—Р°Р±РѕСЂ',
    [BookingRequestType.RETURN_PICKUP]: 'Р’РѕР·РІСЂР°С‚ + Р—Р°Р±РѕСЂ',
  }[requestType] ?? 'Р—Р°СЏРІРєР°';
}

function buildBoutiqueConfirmationMessage(state) {
  return [
    'РџСЂРѕРІРµСЂСЊ Р·Р°РїРёСЃСЊ:',
    '',
    `РўРёРї: ${getRequestTypeLabel(state.requestType)}`,
    `Р‘СѓС‚РёРє: ${getUserVisibleBoutiqueLabel(state.boutique, 'Р‘СѓС‚РёРє')}`,
    `Р”Р°С‚Р°: ${formatDate(state.visitDate, 'DD.MM.YYYY')}`,
    `Р’СЂРµРјСЏ: ${formatSlotLabelForUser(state.selectedSlot.label)}`,
    '',
    'РџРѕРґС‚РІРµСЂРґРёС‚СЊ?',
  ].join('\n');
}

function buildDeliveryConfirmationMessage(state) {
  const lines = [
    'РџСЂРѕРІРµСЂСЊ Р·Р°СЏРІРєСѓ:',
    '',
    `РўРёРї: ${getRequestTypeLabel(state.requestType)}`,
    'Р¤РѕСЂРјР°С‚: Р”РѕСЃС‚Р°РІРєР°',
    `РђРґСЂРµСЃ: ${state.deliveryAddress}`,
  ];

  if (state.wishText) {
    lines.push(`РџРѕР¶РµР»Р°РЅРёСЏ: ${state.wishText}`);
  }

  lines.push('', 'РџРѕРґС‚РІРµСЂРґРёС‚СЊ?');

  return lines.join('\n');
}

async function ensureBookingAccess(ctx) {
  const user = await ctx.state.services.registrationService.ensureTelegramUser(ctx.from);
  const isBlocked = await ctx.state.services.bookingService.isUserBlocked(user.id);

  if (isBlocked) {
    await leaveWithMainMenu(ctx, buildBlockedMessage(user, ctx.state.env.SUPPORT_CONTACT));
    return null;
  }

  const registrationSummary = await ctx.state.services.registrationService.getRegistrationSummary(user.id);

  if (!registrationSummary.exists) {
    await leaveWithMainMenu(ctx, 'РЎРЅР°С‡Р°Р»Р° РЅР°Р¶РјРё В«Р РµРіРёСЃС‚СЂР°С†РёСЏВ».');
    return null;
  }

  return user;
}

async function promptWishStep(ctx) {
  await ctx.reply(
    'Р•СЃС‚СЊ РїРѕР¶РµР»Р°РЅРёСЏ?\nРњРѕР¶РЅРѕ РЅР°РїРёСЃР°С‚СЊ РёР»Рё РїСЂРѕРїСѓСЃС‚РёС‚СЊ.',
    getWishKeyboard(),
  );
}

async function promptVisitModeStep(ctx) {
  await ctx.reply('Р’С‹Р±РµСЂРё С„РѕСЂРјР°С‚', getVisitModeKeyboard());
}

async function promptBoutiqueStep(ctx) {
  const boutiques = await ctx.state.services.bookingService.getUserVisibleBoutiques();

  if (boutiques.length === 0) {
    await leaveWithMainMenu(ctx, 'РЎРµР№С‡Р°СЃ Р·Р°РїРёСЃСЊ РІ Р±СѓС‚РёРє РЅРµРґРѕСЃС‚СѓРїРЅР°.');
    return false;
  }

  const state = getSceneState(ctx);
  state.boutiqueOptions = boutiques.map((boutique) => ({
    boutique,
    id: boutique.id,
    kind: USER_UI_OPTION_KINDS.BOUTIQUE,
    label: getUserVisibleBoutiqueLabel(boutique, 'Р‘СѓС‚РёРє'),
  }));

  if (state.boutiqueOptions.length === 0) {
    await leaveWithMainMenu(ctx, 'РЎРµР№С‡Р°СЃ Р·Р°РїРёСЃСЊ РІ Р±СѓС‚РёРє РЅРµРґРѕСЃС‚СѓРїРЅР°.');
    return false;
  }

  await ctx.reply(
    'Р’С‹Р±РµСЂРё Р±СѓС‚РёРє',
    getBoutiquesKeyboard(state.boutiqueOptions),
  );

  return true;
}

async function promptDateStep(ctx) {
  const state = getSceneState(ctx);
  const dateOptions = ctx.state.services.bookingService.getAvailableVisitDates(14).map((value) => ({
    code: formatDate(value, 'YYYY-MM-DD'),
    kind: USER_UI_OPTION_KINDS.DATE,
    label: formatDate(value, 'DD.MM dd'),
    value,
  }));

  state.dateOptions = dateOptions;

  if (dateOptions.length === 0) {
    await leaveWithMainMenu(ctx, 'РЎРµР№С‡Р°СЃ РЅРµС‚ РґРѕСЃС‚СѓРїРЅС‹С… РґР°С‚.');
    return false;
  }

  await ctx.reply(
    'Р’С‹Р±РµСЂРё РґРµРЅСЊ',
    getDateKeyboard(dateOptions),
  );

  return true;
}

async function promptSlotStep(ctx) {
  const state = getSceneState(ctx);
  const slots = await ctx.state.services.bookingService.getAvailableSlotsByDate(state.boutique.id, state.visitDate);
  const availableSlots = slots.filter((item) => item.isAvailable);

  if (availableSlots.length === 0) {
    await ctx.reply(
      'РќР° СЌС‚РѕС‚ РґРµРЅСЊ СЃРІРѕР±РѕРґРЅС‹С… СЃР»РѕС‚РѕРІ РЅРµС‚.',
      getDateKeyboard(state.dateOptions),
    );
    ctx.wizard.selectStep(5);
    return false;
  }

  state.slotOptions = availableSlots.map((item) => ({
    id: item.slot.id,
    kind: USER_UI_OPTION_KINDS.SLOT,
    label: formatSlotLabelForUser(item.slot.label),
    slot: item.slot,
  }));

  await ctx.reply(
    'Р’С‹Р±РµСЂРё РІСЂРµРјСЏ',
    getSlotKeyboard(state.slotOptions),
  );

  return true;
}

async function promptDeliveryAddressStep(ctx) {
  await ctx.reply(
    'РќР°РїРёС€Рё Р°РґСЂРµСЃ РЎР”Р­Рљ',
    getBookingTextStepKeyboard(),
  );
}

async function finalizeBooking(ctx, payload) {
  await ctx.state.services.bookingService.createBooking(payload);
  await leaveWithMainMenu(
    ctx,
    payload.visitMode === VisitMode.BOUTIQUE
      ? 'Р“РѕС‚РѕРІРѕ, С‚С‹ Р·Р°РїРёСЃР°РЅ(Р°) вњЁ'
      : 'Р“РѕС‚РѕРІРѕ, Р·Р°СЏРІРєР° РѕС‚РїСЂР°РІР»РµРЅР° вњЁ',
  );
}

export function createBookingScene() {
  return new Scenes.WizardScene(
    BOOKING_SCENE_ID,
    async (ctx) => {
      if (await maybeOpenAdminMenuFromScene(ctx)) {
        return undefined;
      }

      const user = await ensureBookingAccess(ctx);

      if (!user) {
        return undefined;
      }

      ctx.wizard.state.bookingDraft = {
        userId: user.id,
      };

      await ctx.reply('Р’С‹Р±РµСЂРё РІР°СЂРёР°РЅС‚', getRequestTypeKeyboard());
      return ctx.wizard.next();
    },
    async (ctx) => {
      if (await maybeOpenAdminMenuFromScene(ctx)) {
        return undefined;
      }

      if (isCancelAction(ctx)) {
        await answerBookingCallback(ctx);
        await cancelFlow(ctx);
        return undefined;
      }

      const requestType = REQUEST_TYPE_BY_CALLBACK[getCallbackData(ctx)];

      if (!requestType) {
        await answerBookingCallback(ctx, 'Р’С‹Р±РµСЂРё РІР°СЂРёР°РЅС‚ РЅРёР¶Рµ.');
        await ctx.reply('Р’С‹Р±РµСЂРё РІР°СЂРёР°РЅС‚', getRequestTypeKeyboard());
        return undefined;
      }

      const state = getSceneState(ctx);
      state.requestType = requestType;

      await answerBookingCallback(ctx);
      await safelyRemoveInlineKeyboard(ctx);
      await promptWishStep(ctx);
      return ctx.wizard.next();
    },
    async (ctx) => {
      if (await maybeOpenAdminMenuFromScene(ctx)) {
        return undefined;
      }

      if (isCancelAction(ctx)) {
        await answerBookingCallback(ctx);
        await cancelFlow(ctx);
        return undefined;
      }

      if (isBackAction(ctx)) {
        await answerBookingCallback(ctx);
        await ctx.reply('Р’С‹Р±РµСЂРё РІР°СЂРёР°РЅС‚', getRequestTypeKeyboard());
        ctx.wizard.selectStep(1);
        return undefined;
      }

      const callbackData = getCallbackData(ctx);

      if (callbackData === BOOKING_CALLBACKS.SKIP_WISH) {
        await answerBookingCallback(ctx);
        getSceneState(ctx).wishText = null;
        await safelyRemoveInlineKeyboard(ctx);
        await promptVisitModeStep(ctx);
        return ctx.wizard.next();
      }

      const wishText = getMessageText(ctx);

      if (!wishText) {
        await answerBookingCallback(ctx);
        await ctx.reply('РњРѕР¶РЅРѕ РЅР°РїРёСЃР°С‚СЊ РїРѕР¶РµР»Р°РЅРёРµ РёР»Рё РЅР°Р¶Р°С‚СЊ В«РџСЂРѕРїСѓСЃС‚РёС‚СЊВ».', getWishKeyboard());
        return undefined;
      }

      getSceneState(ctx).wishText = wishText;
      await promptVisitModeStep(ctx);
      return ctx.wizard.next();
    },
    async (ctx) => {
      if (await maybeOpenAdminMenuFromScene(ctx)) {
        return undefined;
      }

      if (isCancelAction(ctx)) {
        await answerBookingCallback(ctx);
        await cancelFlow(ctx);
        return undefined;
      }

      if (isBackAction(ctx)) {
        await answerBookingCallback(ctx);
        await safelyRemoveInlineKeyboard(ctx);
        await promptWishStep(ctx);
        ctx.wizard.selectStep(2);
        return undefined;
      }

      const visitMode = VISIT_MODE_BY_CALLBACK[getCallbackData(ctx)];

      if (!visitMode) {
        await answerBookingCallback(ctx, 'Р’С‹Р±РµСЂРё С„РѕСЂРјР°С‚ РЅРёР¶Рµ.');
        await promptVisitModeStep(ctx);
        return undefined;
      }

      const state = getSceneState(ctx);
      state.visitMode = visitMode;

      await answerBookingCallback(ctx);
      await safelyRemoveInlineKeyboard(ctx);

      if (visitMode === VisitMode.BOUTIQUE) {
        const prompted = await promptBoutiqueStep(ctx);

        if (!prompted) {
          return undefined;
        }

        return ctx.wizard.next();
      }

      await promptDeliveryAddressStep(ctx);
      ctx.wizard.selectStep(8);
      return undefined;
    },
    async (ctx) => {
      if (await maybeOpenAdminMenuFromScene(ctx)) {
        return undefined;
      }

      if (isCancelAction(ctx)) {
        await answerBookingCallback(ctx);
        await cancelFlow(ctx);
        return undefined;
      }

      if (isBackAction(ctx)) {
        await answerBookingCallback(ctx);
        await safelyRemoveInlineKeyboard(ctx);
        await promptVisitModeStep(ctx);
        ctx.wizard.selectStep(3);
        return undefined;
      }

      const state = getSceneState(ctx);
      const boutiqueId = extractCallbackValue(ctx, BOOKING_CALLBACKS.BOUTIQUE_PREFIX);
      const selected = state.boutiqueOptions?.find((item) => item.id === boutiqueId);

      if (!selected) {
        await answerBookingCallback(ctx, 'Р’С‹Р±РµСЂРё Р±СѓС‚РёРє РЅРёР¶Рµ.');
        await ctx.reply('Р’С‹Р±РµСЂРё Р±СѓС‚РёРє', getBoutiquesKeyboard(state.boutiqueOptions ?? []));
        return undefined;
      }

      state.boutique = selected.boutique;

      await answerBookingCallback(ctx);
      await safelyRemoveInlineKeyboard(ctx);
      const prompted = await promptDateStep(ctx);

      if (prompted) {
        return ctx.wizard.next();
      }

      return undefined;
    },
    async (ctx) => {
      if (await maybeOpenAdminMenuFromScene(ctx)) {
        return undefined;
      }

      if (isCancelAction(ctx)) {
        await answerBookingCallback(ctx);
        await cancelFlow(ctx);
        return undefined;
      }

      if (isBackAction(ctx)) {
        await answerBookingCallback(ctx);
        await safelyRemoveInlineKeyboard(ctx);
        const prompted = await promptBoutiqueStep(ctx);

        if (prompted) {
          ctx.wizard.selectStep(4);
        }

        return undefined;
      }

      const state = getSceneState(ctx);
      const dateCode = extractCallbackValue(ctx, BOOKING_CALLBACKS.DATE_PREFIX);
      const selectedDate = state.dateOptions?.find((item) => item.code === dateCode);

      if (!selectedDate) {
        await answerBookingCallback(ctx, 'Р’С‹Р±РµСЂРё РґРµРЅСЊ РЅРёР¶Рµ.');
        await ctx.reply('Р’С‹Р±РµСЂРё РґРµРЅСЊ', getDateKeyboard(state.dateOptions ?? []));
        return undefined;
      }

      state.visitDate = selectedDate.value;

      await answerBookingCallback(ctx);
      await safelyRemoveInlineKeyboard(ctx);

      const prompted = await promptSlotStep(ctx);

      if (!prompted) {
        return undefined;
      }

      return ctx.wizard.next();
    },
    async (ctx) => {
      if (await maybeOpenAdminMenuFromScene(ctx)) {
        return undefined;
      }

      if (isCancelAction(ctx)) {
        await answerBookingCallback(ctx);
        await cancelFlow(ctx);
        return undefined;
      }

      if (isBackAction(ctx)) {
        await answerBookingCallback(ctx);
        await safelyRemoveInlineKeyboard(ctx);
        const prompted = await promptDateStep(ctx);

        if (prompted) {
          ctx.wizard.selectStep(5);
        }

        return undefined;
      }

      const state = getSceneState(ctx);
      const slotId = extractCallbackValue(ctx, BOOKING_CALLBACKS.SLOT_PREFIX);
      const selectedSlot = state.slotOptions?.find((item) => item.id === slotId);

      if (!selectedSlot) {
        await answerBookingCallback(ctx, 'Р’С‹Р±РµСЂРё РІСЂРµРјСЏ РЅРёР¶Рµ.');
        await ctx.reply('Р’С‹Р±РµСЂРё РІСЂРµРјСЏ', getSlotKeyboard(state.slotOptions ?? []));
        return undefined;
      }

      state.selectedSlot = selectedSlot.slot;

      await answerBookingCallback(ctx);
      await safelyRemoveInlineKeyboard(ctx);
      await ctx.reply(
        buildBoutiqueConfirmationMessage(state),
        getBookingConfirmKeyboard(),
      );

      return ctx.wizard.next();
    },
    async (ctx) => {
      if (await maybeOpenAdminMenuFromScene(ctx)) {
        return undefined;
      }

      if (isCancelAction(ctx)) {
        await answerBookingCallback(ctx);
        await cancelFlow(ctx);
        return undefined;
      }

      if (isBackAction(ctx)) {
        await answerBookingCallback(ctx);
        await safelyRemoveInlineKeyboard(ctx);
        const prompted = await promptSlotStep(ctx);

        if (prompted) {
          ctx.wizard.selectStep(6);
        }

        return undefined;
      }

      if (getCallbackData(ctx) !== BOOKING_CALLBACKS.CONFIRM) {
        await answerBookingCallback(ctx, 'Р’С‹Р±РµСЂРё РєРЅРѕРїРєСѓ РЅРёР¶Рµ.');
        await ctx.reply(
          buildBoutiqueConfirmationMessage(getSceneState(ctx)),
          getBookingConfirmKeyboard(),
        );
        return undefined;
      }

      const state = getSceneState(ctx);

      try {
        await answerBookingCallback(ctx);
        await finalizeBooking(ctx, {
          boutiqueId: state.boutique.id,
          requestType: state.requestType,
          slotId: state.selectedSlot.id,
          userId: state.userId,
          visitDate: state.visitDate,
          visitMode: state.visitMode,
          wishText: state.wishText,
        });
      } catch (error) {
        if (error instanceof AppError) {
          await safelyRemoveInlineKeyboard(ctx);
          await ctx.reply(error.message);

          const prompted = await promptSlotStep(ctx);

          if (prompted) {
            ctx.wizard.selectStep(6);
          }

          return undefined;
        }

        throw error;
      }

      return undefined;
    },
    async (ctx) => {
      if (await maybeOpenAdminMenuFromScene(ctx)) {
        return undefined;
      }

      if (isCancelAction(ctx)) {
        await answerBookingCallback(ctx);
        await cancelFlow(ctx);
        return undefined;
      }

      if (isBackAction(ctx)) {
        await answerBookingCallback(ctx);
        await promptVisitModeStep(ctx);
        ctx.wizard.selectStep(3);
        return undefined;
      }

      const deliveryAddress = getMessageText(ctx);

      if (!deliveryAddress) {
        await answerBookingCallback(ctx);
        await promptDeliveryAddressStep(ctx);
        return undefined;
      }

      const state = getSceneState(ctx);
      state.deliveryAddress = deliveryAddress;

      await ctx.reply(
        buildDeliveryConfirmationMessage(state),
        getBookingConfirmKeyboard(),
      );

      return ctx.wizard.next();
    },
    async (ctx) => {
      if (await maybeOpenAdminMenuFromScene(ctx)) {
        return undefined;
      }

      if (isCancelAction(ctx)) {
        await answerBookingCallback(ctx);
        await cancelFlow(ctx);
        return undefined;
      }

      if (isBackAction(ctx)) {
        await answerBookingCallback(ctx);
        await safelyRemoveInlineKeyboard(ctx);
        await promptDeliveryAddressStep(ctx);
        ctx.wizard.selectStep(8);
        return undefined;
      }

      if (getCallbackData(ctx) !== BOOKING_CALLBACKS.CONFIRM) {
        await answerBookingCallback(ctx, 'Р’С‹Р±РµСЂРё РєРЅРѕРїРєСѓ РЅРёР¶Рµ.');
        await ctx.reply(
          buildDeliveryConfirmationMessage(getSceneState(ctx)),
          getBookingConfirmKeyboard(),
        );
        return undefined;
      }

      const state = getSceneState(ctx);

      try {
        await answerBookingCallback(ctx);
        await finalizeBooking(ctx, {
          deliveryAddress: state.deliveryAddress,
          requestType: state.requestType,
          userId: state.userId,
          visitMode: state.visitMode,
          wishText: state.wishText,
        });
      } catch (error) {
        if (error instanceof AppError) {
          await safelyRemoveInlineKeyboard(ctx);
          await ctx.reply(error.message, getBookingConfirmKeyboard());
          return undefined;
        }

        throw error;
      }

      return undefined;
    },
  );
}
```

[src/bot/scenes/bookingRescheduleScene.js](/c:/Users/PC/OneDrive/Desktop/cerca%20trova%20bot/src/bot/scenes/bookingRescheduleScene.js)
`$(System.Collections.Hashtable.Lang)
import { BookingStatus, VisitMode } from '@prisma/client';
import { Scenes } from 'telegraf';

import { getUserVisibleBoutiqueLabel } from '../../utils/boutiques.js';
import { formatDate } from '../../utils/date.js';
import { AppError } from '../../utils/errors.js';
import { formatUserBookingCard } from '../../utils/formatters.js';
import { formatSlotLabelForUser } from '../../utils/slots.js';
import {
  BOOKING_CALLBACKS,
  USER_UI_OPTION_KINDS,
  getBookingRescheduleConfirmKeyboard,
  getBookingRescheduleDateKeyboard,
  getBookingRescheduleSlotKeyboard,
  getUserBoutiqueBookingActionsKeyboard,
} from '../keyboards/booking.js';
import { getMainMenuKeyboard } from '../keyboards/mainMenu.js';
import {
  isMessageNotModifiedError,
  normalizeInlineMarkup,
  safelyRemoveInlineKeyboard,
} from '../utils/inlineKeyboard.js';
import { maybeOpenAdminMenuFromScene } from '../utils/adminEntry.js';

export const BOOKING_RESCHEDULE_SCENE_ID = 'booking-reschedule-scene';

const ACTIVE_BOOKING_STATUSES = [BookingStatus.CREATED, BookingStatus.SUBMITTED];

function getSceneState(ctx) {
  ctx.wizard.state.bookingReschedule ??= {};
  return ctx.wizard.state.bookingReschedule;
}

function getCallbackData(ctx) {
  return ctx.callbackQuery?.data ?? '';
}

function extractCallbackValue(ctx, prefix) {
  const callbackData = getCallbackData(ctx);
  return callbackData.startsWith(prefix) ? callbackData.slice(prefix.length) : null;
}

async function answerBookingCallback(ctx, text = undefined) {
  if (!ctx.callbackQuery) {
    return;
  }

  try {
    await ctx.answerCbQuery(text);
  } catch {
    // Ignore callback acknowledgement errors.
  }
}

async function renderSceneMessage(ctx, text, markup = undefined) {
  const extra = normalizeInlineMarkup(markup);

  try {
    await ctx.editMessageText(text, extra);
  } catch (error) {
    if (!isMessageNotModifiedError(error)) {
      throw error;
    }

    await ctx.editMessageReplyMarkup(extra.reply_markup).catch(() => undefined);
  }
}

function buildBookingReferenceText(booking) {
  return [
    'РџРµСЂРµР·Р°РїРёСЃСЊ',
    `Р‘СѓС‚РёРє: ${getUserVisibleBoutiqueLabel(booking, 'Р‘СѓС‚РёРє')}`,
    `РЎРµР№С‡Р°СЃ: ${booking.visitDate ? formatDate(booking.visitDate, 'DD.MM.YYYY') : 'РќРµ СѓРєР°Р·Р°РЅРѕ'} / ${formatSlotLabelForUser(booking.slotLabel) || 'РќРµ СѓРєР°Р·Р°РЅРѕ'}`,
  ].join('\n');
}

function buildDateStepText(booking, notice = '') {
  return [
    notice,
    buildBookingReferenceText(booking),
    '',
    'Р’С‹Р±РµСЂРё РЅРѕРІС‹Р№ РґРµРЅСЊ',
  ]
    .filter(Boolean)
    .join('\n');
}

function buildSlotStepText(booking, visitDate, notice = '') {
  return [
    notice,
    buildBookingReferenceText(booking),
    `РќРѕРІС‹Р№ РґРµРЅСЊ: ${formatDate(visitDate, 'DD.MM.YYYY')}`,
    '',
    'Р’С‹Р±РµСЂРё РЅРѕРІРѕРµ РІСЂРµРјСЏ',
  ]
    .filter(Boolean)
    .join('\n');
}

function buildConfirmText(booking, state) {
  return [
    buildBookingReferenceText(booking),
    '',
    `РќРѕРІС‹Р№ РґРµРЅСЊ: ${formatDate(state.visitDate, 'DD.MM.YYYY')}`,
    `РќРѕРІРѕРµ РІСЂРµРјСЏ: ${formatSlotLabelForUser(state.selectedSlot.label)}`,
    '',
    'РўРµРєСѓС‰Р°СЏ Р·Р°РїРёСЃСЊ Р±СѓРґРµС‚ Р·Р°РјРµРЅРµРЅР° РЅРѕРІРѕР№. РџСЂРѕРґРѕР»Р¶РёС‚СЊ?',
  ].join('\n');
}

function buildSuccessText(booking) {
  return [
    'Р“РѕС‚РѕРІРѕ, Р·Р°РїРёСЃСЊ РѕР±РЅРѕРІР»РµРЅР° вњЁ',
    '',
    formatUserBookingCard(booking, {
      includeStatus: false,
    }),
  ].join('\n');
}

function isActiveBooking(booking) {
  return ACTIVE_BOOKING_STATUSES.includes(booking.status);
}

function buildBookingCardText(booking, notice = '') {
  return [
    notice,
    formatUserBookingCard(booking, {
      includeStatus: !isActiveBooking(booking),
    }),
  ]
    .filter(Boolean)
    .join('\n\n');
}

function getBookingKeyboard(booking) {
  if (booking.visitMode !== VisitMode.BOUTIQUE || !isActiveBooking(booking)) {
    return undefined;
  }

  return getUserBoutiqueBookingActionsKeyboard(booking.id);
}

async function leaveToMainMenu(ctx, message) {
  await safelyRemoveInlineKeyboard(ctx);
  await ctx.scene.leave();
  await ctx.reply(message, getMainMenuKeyboard());
}

async function promptDateStep(ctx, notice = '') {
  const state = getSceneState(ctx);
  state.dateOptions = ctx.state.services.bookingService.getAvailableVisitDates(14).map((value) => ({
    code: formatDate(value, 'YYYY-MM-DD'),
    kind: USER_UI_OPTION_KINDS.DATE,
    label: formatDate(value, 'DD.MM dd'),
    value,
  }));

  if (state.dateOptions.length === 0) {
    await leaveBackToCurrentCard(ctx, notice || 'РЎРµР№С‡Р°СЃ РЅРµС‚ РґРѕСЃС‚СѓРїРЅС‹С… РґР°С‚.');
    return false;
  }

  await renderSceneMessage(
    ctx,
    buildDateStepText(state.booking, notice),
    getBookingRescheduleDateKeyboard(state.dateOptions),
  );

  return true;
}

async function promptSlotStep(ctx, notice = '') {
  const state = getSceneState(ctx);
  const slots = await ctx.state.services.bookingService.getAvailableSlotsByDate(
    state.booking.boutiqueId,
    state.visitDate,
  );
  const availableSlots = slots.filter((item) => item.isAvailable);

  if (availableSlots.length === 0) {
    await promptDateStep(ctx, notice || 'РќР° СЌС‚РѕС‚ РґРµРЅСЊ СЃРІРѕР±РѕРґРЅС‹С… СЃР»РѕС‚РѕРІ РЅРµС‚.');
    ctx.wizard.selectStep(1);
    return false;
  }

  state.slotOptions = availableSlots.map((item) => ({
    id: item.slot.id,
    kind: USER_UI_OPTION_KINDS.SLOT,
    label: formatSlotLabelForUser(item.slot.label),
    slot: item.slot,
  }));

  await renderSceneMessage(
    ctx,
    buildSlotStepText(state.booking, state.visitDate, notice),
    getBookingRescheduleSlotKeyboard(state.slotOptions),
  );

  return true;
}

async function leaveBackToCurrentCard(ctx, notice = '') {
  const state = getSceneState(ctx);
  const latestBooking = await ctx.state.services.bookingService.getUserVisibleBookingById(
    state.userId,
    state.bookingId,
  );

  if (!latestBooking) {
    await renderSceneMessage(ctx, notice || 'Р—Р°РїРёСЃСЊ Р±РѕР»СЊС€Рµ РЅРµ РґРѕСЃС‚СѓРїРЅР°.');
    await ctx.scene.leave();
    return;
  }

  await renderSceneMessage(
    ctx,
    buildBookingCardText(latestBooking, notice),
    getBookingKeyboard(latestBooking),
  );
  await ctx.scene.leave();
}

export function createBookingRescheduleScene() {
  return new Scenes.WizardScene(
    BOOKING_RESCHEDULE_SCENE_ID,
    async (ctx) => {
      if (await maybeOpenAdminMenuFromScene(ctx)) {
        return undefined;
      }

      const bookingId = ctx.scene.state?.bookingId;
      const user = await ctx.state.services.registrationService.ensureTelegramUser(ctx.from);

      if (!bookingId) {
        await leaveToMainMenu(ctx, 'Р—Р°РїРёСЃСЊ РЅРµ РЅР°Р№РґРµРЅР°.');
        return undefined;
      }

      const isBlocked = await ctx.state.services.bookingService.isUserBlocked(user.id);

      if (isBlocked) {
        await leaveToMainMenu(ctx, 'РЎРµР№С‡Р°СЃ РґРѕСЃС‚СѓРї РІСЂРµРјРµРЅРЅРѕ РѕРіСЂР°РЅРёС‡РµРЅ.');
        return undefined;
      }

      try {
        const booking = await ctx.state.services.bookingService.getUserActiveBoutiqueBooking(user.id, bookingId);
        const state = getSceneState(ctx);

        state.booking = booking;
        state.bookingId = booking.id;
        state.userId = user.id;

        await answerBookingCallback(ctx);
        const prompted = await promptDateStep(ctx);

        if (prompted) {
          return ctx.wizard.next();
        }

        return undefined;
      } catch (error) {
        if (error instanceof AppError) {
          await answerBookingCallback(ctx, error.message);
          await leaveToMainMenu(ctx, error.message);
          return undefined;
        }

        throw error;
      }
    },
    async (ctx) => {
      if (await maybeOpenAdminMenuFromScene(ctx)) {
        return undefined;
      }

      const callbackData = getCallbackData(ctx);

      if (
        callbackData === BOOKING_CALLBACKS.RESCHEDULE_BACK ||
        callbackData === BOOKING_CALLBACKS.RESCHEDULE_CANCEL
      ) {
        await answerBookingCallback(ctx);
        await leaveBackToCurrentCard(ctx);
        return undefined;
      }

      const state = getSceneState(ctx);
      const dateCode = extractCallbackValue(ctx, BOOKING_CALLBACKS.RESCHEDULE_DATE_PREFIX);
      const selectedDate = state.dateOptions?.find((item) => item.code === dateCode);

      if (!selectedDate) {
        await answerBookingCallback(ctx, 'Р’С‹Р±РµСЂРё РґРµРЅСЊ РЅРёР¶Рµ.');
        return undefined;
      }

      state.visitDate = selectedDate.value;

      await answerBookingCallback(ctx);
      const prompted = await promptSlotStep(ctx);

      if (prompted) {
        return ctx.wizard.next();
      }

      return undefined;
    },
    async (ctx) => {
      if (await maybeOpenAdminMenuFromScene(ctx)) {
        return undefined;
      }

      const callbackData = getCallbackData(ctx);

      if (callbackData === BOOKING_CALLBACKS.RESCHEDULE_CANCEL) {
        await answerBookingCallback(ctx);
        await leaveBackToCurrentCard(ctx);
        return undefined;
      }

      if (callbackData === BOOKING_CALLBACKS.RESCHEDULE_BACK) {
        await answerBookingCallback(ctx);
        const prompted = await promptDateStep(ctx);

        if (prompted) {
          ctx.wizard.selectStep(1);
        }

        return undefined;
      }

      const state = getSceneState(ctx);
      const slotId = extractCallbackValue(ctx, BOOKING_CALLBACKS.RESCHEDULE_SLOT_PREFIX);
      const selectedSlot = state.slotOptions?.find((item) => item.id === slotId);

      if (!selectedSlot) {
        await answerBookingCallback(ctx, 'Р’С‹Р±РµСЂРё РІСЂРµРјСЏ РЅРёР¶Рµ.');
        return undefined;
      }

      state.selectedSlot = selectedSlot.slot;

      await answerBookingCallback(ctx);
      await renderSceneMessage(
        ctx,
        buildConfirmText(state.booking, state),
        getBookingRescheduleConfirmKeyboard(),
      );

      return ctx.wizard.next();
    },
    async (ctx) => {
      if (await maybeOpenAdminMenuFromScene(ctx)) {
        return undefined;
      }

      const callbackData = getCallbackData(ctx);
      const state = getSceneState(ctx);

      if (callbackData === BOOKING_CALLBACKS.RESCHEDULE_CANCEL) {
        await answerBookingCallback(ctx);
        await leaveBackToCurrentCard(ctx);
        return undefined;
      }

      if (callbackData === BOOKING_CALLBACKS.RESCHEDULE_BACK) {
        await answerBookingCallback(ctx);
        const prompted = await promptSlotStep(ctx);

        if (prompted) {
          ctx.wizard.selectStep(2);
        }

        return undefined;
      }

      if (callbackData !== BOOKING_CALLBACKS.RESCHEDULE_CONFIRM) {
        await answerBookingCallback(ctx, 'Р’С‹Р±РµСЂРё РєРЅРѕРїРєСѓ РЅРёР¶Рµ.');
        return undefined;
      }

      try {
        await answerBookingCallback(ctx);
        const result = await ctx.state.services.bookingService.rescheduleBoutiqueBooking({
          bookingId: state.bookingId,
          slotId: state.selectedSlot.id,
          userId: state.userId,
          visitDate: state.visitDate,
        });

        state.booking = result.newBooking;
        state.bookingId = result.newBooking.id;

        await renderSceneMessage(
          ctx,
          buildSuccessText(result.newBooking),
          getUserBoutiqueBookingActionsKeyboard(result.newBooking.id),
        );
        await ctx.scene.leave();
        return undefined;
      } catch (error) {
        if (error instanceof AppError) {
          const latestBooking = await ctx.state.services.bookingService.getUserVisibleBookingById(
            state.userId,
            state.bookingId,
          );

          if (
            latestBooking &&
            latestBooking.visitMode === VisitMode.BOUTIQUE &&
            ACTIVE_BOOKING_STATUSES.includes(latestBooking.status)
          ) {
            state.booking = latestBooking;
            const prompted = await promptSlotStep(ctx, error.message);

            if (prompted) {
              ctx.wizard.selectStep(2);
            }

            return undefined;
          }

          await renderSceneMessage(ctx, error.message);
          await ctx.scene.leave();
          return undefined;
        }

        throw error;
      }
    },
  );
}
```

