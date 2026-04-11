import { createReadStream } from 'node:fs';

import {
  ADMIN_PERMISSIONS,
  AUDIT_ACTIONS,
  BOT_TEXTS,
} from '../../utils/constants.js';
import { ForbiddenError } from '../../utils/errors.js';
import {
  formatAdminBookingDetailCard,
  formatAdminBookingSelectorLabel,
  formatAdminDebtorsList,
  formatUserDisplayName,
  hasAdminBookingUserPdf,
} from '../../utils/formatters.js';
import {
  ADMIN_CALLBACKS,
  buildAdminBookingPdfCallback,
  buildAdminBookingViewCallback,
  getAdminBackKeyboard,
  getAdminBookingDetailKeyboard,
  getAdminBookingListKeyboard,
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
import { openAdminMenuFromAnywhere } from '../utils/adminEntry.js';
import { resetSceneSession, SCENE_EXIT_REASONS } from '../utils/sceneNavigation.js';

const AWAITING_PDF_UPLOAD_KEY = 'registration_welcome_pdf';
const ADMIN_BOOKING_LIST_TYPES = Object.freeze({
  RECENT: 'recent',
  TODAY: 'today',
});

function getBackToMenuKeyboard() {
  return getAdminBackKeyboard(ADMIN_CALLBACKS.MENU, 'Назад');
}

function buildPdfUploadText(prefix = '') {
  const lines = [];

  if (prefix) {
    lines.push(prefix, '');
  }

  lines.push('Отправьте PDF одним сообщением.');
  lines.push('После загрузки он станет активным.');

  return lines.join('\n');
}

function getBookingListConfig(listType) {
  return listType === ADMIN_BOOKING_LIST_TYPES.TODAY
    ? {
        callbackData: ADMIN_CALLBACKS.BOOKINGS_TODAY,
        emptyMessage: 'Сегодня заявок пока нет.',
        title: 'Заявки за сегодня',
      }
    : {
        callbackData: ADMIN_CALLBACKS.BOOKINGS_RECENT,
        emptyMessage: 'Пока заявок нет.',
        title: 'Последние заявки',
      };
}

function getBookingListText(listType) {
  return `${getBookingListConfig(listType).title}\nВыбери заявку:`;
}

function getBookingListBackCallback(listType) {
  return getBookingListConfig(listType).callbackData;
}

function getRequestLogger(ctx) {
  return ctx.state?.requestLogger ?? null;
}

function getUserPdfFileId(booking) {
  const telegramFileId = booking?.user?.personalPdf?.telegramFileId;

  if (typeof telegramFileId !== 'string') {
    return null;
  }

  const normalized = telegramFileId.trim();
  return normalized || null;
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

async function getBookingsByListType(services, listType) {
  if (listType === ADMIN_BOOKING_LIST_TYPES.TODAY) {
    return services.bookingService.getAdminBookingsForToday(50);
  }

  return services.bookingService.getVisibleAdminBookings(20);
}

async function renderAdminBookingList(ctx, services, listType) {
  const bookings = await getBookingsByListType(services, listType);
  const listConfig = getBookingListConfig(listType);

  if (bookings.length === 0) {
    await renderAdminPanel(
      ctx,
      `${listConfig.title}\n${listConfig.emptyMessage}`,
      getBackToMenuKeyboard(),
    );
    return;
  }

  const options = bookings.map((booking, index) => ({
    callbackData: buildAdminBookingViewCallback(listType, booking.id),
    text: formatAdminBookingSelectorLabel(booking, index),
  }));

  await renderAdminPanel(
    ctx,
    getBookingListText(listType),
    getAdminBookingListKeyboard(options, {
      backCallbackData: ADMIN_CALLBACKS.MENU,
      backText: 'Назад',
    }),
  );
}

async function renderAdminBookingDetail(ctx, services, bookingId, listType) {
  const booking = await services.bookingService.getVisibleAdminBookingById(bookingId);

  if (!booking) {
    await renderAdminPanel(
      ctx,
      'Заявка больше не доступна.',
      getAdminBackKeyboard(getBookingListBackCallback(listType), 'Назад'),
    );
    return;
  }

  await renderAdminPanel(
    ctx,
    formatAdminBookingDetailCard(booking),
    getAdminBookingDetailKeyboard({
      backCallbackData: getBookingListBackCallback(listType),
      backText: 'Назад',
      pdfCallbackData: hasAdminBookingUserPdf(booking)
        ? buildAdminBookingPdfCallback(booking.id)
        : null,
      pdfText: 'Открыть PDF',
    }),
  );
}

async function sendBookingPdfToAdmin(ctx, services, bookingId) {
  const booking = await services.bookingService.getVisibleAdminBookingById(bookingId);

  if (!booking) {
    await ctx.answerCbQuery('Заявка не найдена.', {
      show_alert: true,
    });
    return;
  }

  const telegramFileId = getUserPdfFileId(booking);

  if (!telegramFileId) {
    await ctx.answerCbQuery('PDF не загружен.', {
      show_alert: true,
    });
    return;
  }

  try {
    await ctx.replyWithDocument(telegramFileId, {
      caption: `PDF креатора: ${formatUserDisplayName(booking.user)}`,
    });
    await ctx.answerCbQuery('PDF отправлен.');
  } catch (error) {
    getRequestLogger(ctx)?.error(
      {
        bookingId: booking.id,
        err: error,
        telegramId: ctx.from?.id ? String(ctx.from.id) : null,
      },
      'Failed to send creator PDF from admin booking card',
    );

    await ctx.answerCbQuery('Не удалось отправить PDF. Попробуй ещё раз.', {
      show_alert: true,
    });
  }
}

export function registerAdminHandlers(bot, { services, env }) {
  bot.command('admin', async (ctx) => {
    await openAdminMenuFromAnywhere(ctx);
  });

  bot.command('upload_registration_pdf', async (ctx) => {
    const admin = await resolveAdmin(ctx, ADMIN_PERMISSIONS.MANAGE_PDFS);

    if (!admin) {
      return;
    }

    await resetSceneSession(ctx, {
      logMessage: 'Scene session reset by /upload_registration_pdf',
      reason: SCENE_EXIT_REASONS.GLOBAL_NAVIGATION,
    });

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
    await renderAdminBookingList(ctx, services, ADMIN_BOOKING_LIST_TYPES.RECENT);

    await logAdminAction(
      services,
      admin,
      AUDIT_ACTIONS.VIEW_RECENT_BOOKINGS,
      'Просмотр последних заявок',
    );
  });

  bot.action(ADMIN_CALLBACKS.BOOKINGS_TODAY, async (ctx) => {
    const admin = await resolveAdmin(ctx, ADMIN_PERMISSIONS.VIEW_BOOKINGS);

    if (!admin) {
      return;
    }

    await ctx.answerCbQuery();
    await renderAdminBookingList(ctx, services, ADMIN_BOOKING_LIST_TYPES.TODAY);

    await logAdminAction(
      services,
      admin,
      AUDIT_ACTIONS.VIEW_TODAY_BOOKINGS,
      'Просмотр заявок за сегодня',
    );
  });

  bot.action(/^admin:booking:view:(recent|today):(.+)$/, async (ctx) => {
    const admin = await resolveAdmin(ctx, ADMIN_PERMISSIONS.VIEW_BOOKINGS);

    if (!admin) {
      return;
    }

    const [, listType, bookingId] = ctx.match;
    await ctx.answerCbQuery();
    await renderAdminBookingDetail(ctx, services, bookingId, listType);
  });

  bot.action(/^admin:booking:pdf:(.+)$/, async (ctx) => {
    const admin = await resolveAdmin(ctx, ADMIN_PERMISSIONS.VIEW_BOOKINGS);

    if (!admin) {
      return;
    }

    const [, bookingId] = ctx.match;
    await sendBookingPdfToAdmin(ctx, services, bookingId);
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
      'Просмотр должников по вещам',
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
      'Пользователи\nВыбери действие.',
      getAdminOptionKeyboard(
        [
          { text: 'Заблокировать', callbackData: ADMIN_CALLBACKS.USER_BLOCK },
          { text: 'Разблокировать', callbackData: ADMIN_CALLBACKS.USER_UNBLOCK },
        ],
        {
          cancelCallbackData: ADMIN_CALLBACKS.MENU,
          cancelText: 'Назад',
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
      'Бутики\nВыбери действие.',
      getAdminOptionKeyboard(
        [
          { text: 'Добавить бутик', callbackData: ADMIN_CALLBACKS.BOUTIQUE_ADD },
          { text: 'Удалить бутик', callbackData: ADMIN_CALLBACKS.BOUTIQUE_REMOVE },
        ],
        {
          cancelCallbackData: ADMIN_CALLBACKS.MENU,
          cancelText: 'Назад',
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
      'Слоты\nВыбери действие.',
      getAdminOptionKeyboard(
        [
          { text: 'Добавить слот', callbackData: ADMIN_CALLBACKS.TIME_SLOT_ADD },
          { text: 'Удалить слот', callbackData: ADMIN_CALLBACKS.TIME_SLOT_REMOVE },
        ],
        {
          cancelCallbackData: ADMIN_CALLBACKS.MENU,
          cancelText: 'Назад',
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

    await ctx.answerCbQuery('Готовлю CSV...');

    const exportResult = await services.adminService.exportDataToCsv(ctx.from.id);

    await ctx.replyWithDocument(
      {
        source: createReadStream(exportResult.filePath),
        filename: exportResult.fileName,
      },
      {
        caption: `Готово. В выгрузке ${exportResult.rowsCount} строк.`,
      },
    );

    await renderAdminMenu(ctx, admin, 'Выгрузка отправлена.');
    await logAdminAction(
      services,
      admin,
      AUDIT_ACTIONS.DATA_EXPORTED,
      `Выгружен CSV ${exportResult.fileName}, строк: ${exportResult.rowsCount}`,
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
        buildPdfUploadText('Нужен именно PDF-файл. Попробуйте ещё раз.'),
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
      'PDF сохранён.',
    );

    await logAdminAction(
      services,
      admin,
      AUDIT_ACTIONS.PDF_UPLOADED,
      `Загружен PDF ${document.file_name ?? 'registration.pdf'}`,
      {
        pdfFileId: document.file_id,
      },
    );

    return undefined;
  });
}
