import { BookingStatus, VisitMode } from '@prisma/client';

import { BOT_TEXTS, MENU_BUTTONS } from '../../utils/constants.js';
import { dayjs, formatDate } from '../../utils/date.js';
import { AppError } from '../../utils/errors.js';
import { formatSlotLabelForUser } from '../../utils/slots.js';
import {
  formatAdminUserIdentityLines,
  formatUserBookingArchive,
  formatUserBookingCard,
} from '../../utils/formatters.js';
import {
  BOOKING_CALLBACKS,
  getBookingPdfRequiredKeyboard,
  getUserBookingCancelConfirmKeyboard,
  getUserBookingReschedulePromptKeyboard,
  getUserBoutiqueBookingActionsKeyboard,
} from '../keyboards/booking.js';
import { getHelpKeyboard } from '../keyboards/help.js';
import { getMainMenuKeyboard } from '../keyboards/mainMenu.js';
import { BOOKING_RESCHEDULE_SCENE_ID } from '../scenes/bookingRescheduleScene.js';
import { BOOKING_SCENE_ID } from '../scenes/bookingScene.js';
import { REGISTRATION_EDIT_SCENE_ID } from '../scenes/registrationEditScene.js';
import { REGISTRATION_SCENE_ID } from '../scenes/registrationScene.js';
import { isMessageNotModifiedError, normalizeInlineMarkup } from '../utils/inlineKeyboard.js';

const ACTIVE_BOOKING_STATUSES = [BookingStatus.CREATED, BookingStatus.SUBMITTED];

function buildBlockedMessage(user, supportContact) {
  const lines = [BOT_TEXTS.BLOCKED];

  if (user.blockedReason) {
    lines.push(`Причина: ${user.blockedReason}`);
  }

  lines.push(`Если нужна помощь: ${supportContact}`);

  return lines.join('\n');
}

function getCallbackData(ctx) {
  return ctx.callbackQuery?.data ?? '';
}

function extractCallbackValue(ctx, prefix) {
  const callbackData = getCallbackData(ctx);
  return callbackData.startsWith(prefix) ? callbackData.slice(prefix.length) : null;
}

async function answerBookingCallback(ctx, text = undefined, showAlert = false) {
  if (!ctx.callbackQuery) {
    return;
  }

  try {
    await ctx.answerCbQuery(text, {
      show_alert: showAlert,
    });
  } catch {
    // Ignore callback acknowledgement errors.
  }
}

async function renderInlineMessage(ctx, text, markup = undefined) {
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

function isActiveBooking(booking) {
  return ACTIVE_BOOKING_STATUSES.includes(booking.status);
}

function hasBoutiqueBookingActions(booking) {
  return booking.visitMode === VisitMode.BOUTIQUE && isActiveBooking(booking);
}

function sortActiveBookings(bookings) {
  return [...bookings].sort((left, right) => (
    (left.visitDate ? new Date(left.visitDate).getTime() : Number.MAX_SAFE_INTEGER) -
    (right.visitDate ? new Date(right.visitDate).getTime() : Number.MAX_SAFE_INTEGER)
  ));
}

function sortArchivedBookings(bookings) {
  return [...bookings].sort((left, right) => (
    (right.cancelledAt
      ? new Date(right.cancelledAt).getTime()
      : right.completedAt
        ? new Date(right.completedAt).getTime()
        : new Date(right.createdAt).getTime()) -
    (left.cancelledAt
      ? new Date(left.cancelledAt).getTime()
      : left.completedAt
        ? new Date(left.completedAt).getTime()
        : new Date(left.createdAt).getTime())
  ));
}

function buildBookingCardText(booking, notice = '') {
  return [notice, formatUserBookingCard(booking, { includeStatus: !isActiveBooking(booking) })]
    .filter(Boolean)
    .join('\n\n');
}

function buildCancelPromptText(booking) {
  return [
    formatUserBookingCard(booking, {
      includeStatus: false,
    }),
    'Отменить эту запись?',
  ].join('\n\n');
}

function buildReschedulePromptText(booking) {
  return [
    formatUserBookingCard(booking, {
      includeStatus: false,
    }),
    'Текущая запись будет заменена новой. Продолжить?',
  ].join('\n\n');
}

function buildCancelledText() {
  return 'Запись отменена.';
}

function isUrgentSameDayCancellation(booking, timezone) {
  if (!booking?.visitDate) {
    return false;
  }

  const cancelledAt = booking.cancelledAt ?? new Date();

  return dayjs(booking.visitDate).tz(timezone).isSame(dayjs(cancelledAt).tz(timezone), 'day');
}

function buildAdminBookingCancellationMessage(booking, timezone) {
  const isUrgent = isUrgentSameDayCancellation(booking, timezone);
  const cancelledAt = booking.cancelledAt ?? new Date();
  const boutiqueName = booking?.boutique?.name ?? booking?.boutiqueAddress ?? 'Не указан';

  return [
    isUrgent ? 'Срочная отмена записи на сегодня' : 'Отмена записи',
    '',
    ...formatAdminUserIdentityLines(booking?.user, { label: 'Креатор' }),
    `Бутик: ${boutiqueName}`,
    `Дата: ${booking?.visitDate ? formatDate(booking.visitDate, 'DD.MM.YYYY') : 'Не указана'}`,
    `Время: ${formatSlotLabelForUser(booking?.slotLabel ?? booking?.timeSlot?.label) || 'Не указано'}`,
    `Отменено: ${formatDate(cancelledAt, 'DD.MM.YYYY HH:mm')}`,
  ].join('\n');
}

function buildArchivedBookingsText(bookings) {
  const visibleBookings = bookings.slice(0, 3);
  const hiddenCount = bookings.length - visibleBookings.length;
  const lines = [formatUserBookingArchive(visibleBookings, 'Прошлые заявки')];

  if (hiddenCount > 0) {
    lines.push(`И ещё ${hiddenCount} в истории.`);
  }

  return lines.filter(Boolean).join('\n\n');
}

function getBookingKeyboard(booking) {
  if (!hasBoutiqueBookingActions(booking)) {
    return undefined;
  }

  return getUserBoutiqueBookingActionsKeyboard(booking.id);
}

async function renderExistingBookingCard(ctx, booking, notice = '') {
  await renderInlineMessage(
    ctx,
    buildBookingCardText(booking, notice),
    getBookingKeyboard(booking),
  );
}

export function registerMenuHandlers(bot, { env, services }) {
  async function ensureUserAccess(ctx) {
    const user = await services.registrationService.ensureTelegramUser(ctx.from);
    const isBlocked = await services.bookingService.isUserBlocked(user.id);

    if (isBlocked) {
      const message = buildBlockedMessage(user, env.SUPPORT_CONTACT);

      if (ctx.callbackQuery) {
        await answerBookingCallback(ctx, message, true);
      } else {
        await ctx.reply(message, getMainMenuKeyboard());
      }

      return null;
    }

    return user;
  }

  async function openRegistrationSection(ctx, user) {
    const registration = await services.registrationService.getRegistrationByUserId(user.id);

    if (!registration) {
      await ctx.scene.enter(REGISTRATION_SCENE_ID);
      return;
    }

    await ctx.scene.enter(REGISTRATION_EDIT_SCENE_ID);
  }

  async function openBookingSection(ctx, user) {
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
  }

  async function notifyBookingAdminsAboutUserCancellation(ctx, booking) {
    const requestLogger = ctx.state?.requestLogger;
    const recipients = await services.adminService.getBookingNotificationRecipientTelegramIds();

    if (recipients.length === 0) {
      if (requestLogger) {
        requestLogger.warn(
          {
            bookingId: booking.id,
            recipients,
            userId: booking.userId,
          },
          'No admin recipient configured for booking cancellation alerts',
        );
      }
      return;
    }

    try {
      for (const adminTelegramId of recipients) {
        try {
          await ctx.telegram.sendMessage(
            String(adminTelegramId),
            buildAdminBookingCancellationMessage(booking, env.DEFAULT_TIMEZONE),
          );

          if (requestLogger) {
            requestLogger.info(
              {
                adminTelegramId: String(adminTelegramId),
                bookingId: booking.id,
                userId: booking.userId,
              },
              'Admin was notified about user booking cancellation',
            );
          }
        } catch (error) {
          if (requestLogger) {
            requestLogger.error(
              {
                adminTelegramId: String(adminTelegramId),
                bookingId: booking.id,
                err: error,
                userId: booking.userId,
              },
              'Failed to send admin booking cancellation alert',
            );
          }
        }
      }
    } catch (error) {
      if (requestLogger) {
        requestLogger.error(
          {
            bookingId: booking.id,
            err: error,
            userId: booking.userId,
          },
          'Failed to resolve admin booking cancellation recipients',
        );
      }
    }
  }

  async function showUserBookings(ctx, user) {
    const bookings = await services.bookingService.listUserVisibleBookings(user.id, 50);

    if (bookings.length === 0) {
      await ctx.reply('У тебя пока нет заявок.', getMainMenuKeyboard());
      return;
    }

    const activeBookings = sortActiveBookings(bookings.filter(isActiveBooking));
    const archivedBookings = sortArchivedBookings(bookings.filter((booking) => !isActiveBooking(booking)));

    if (activeBookings.length > 0) {
      await ctx.reply('Активные заявки', getMainMenuKeyboard());

      for (const [index, booking] of activeBookings.entries()) {
        const title = `${index + 1}.`;

        await ctx.reply(
          formatUserBookingCard(booking, {
            includeStatus: false,
            title,
          }),
          getBookingKeyboard(booking),
        );
      }
    }

    if (archivedBookings.length > 0) {
      await ctx.reply(
        buildArchivedBookingsText(archivedBookings),
        activeBookings.length === 0 ? getMainMenuKeyboard() : undefined,
      );
    }
  }

  async function withBookingAction(ctx, action) {
    const user = await ensureUserAccess(ctx);

    if (!user) {
      return;
    }

    try {
      await action(user);
    } catch (error) {
      if (error instanceof AppError) {
        await answerBookingCallback(ctx, error.message, true);
        return;
      }

      throw error;
    }
  }

  bot.hears(MENU_BUTTONS.REGISTRATION, async (ctx) => {
    const user = await ensureUserAccess(ctx);

    if (!user) {
      return;
    }

    await openRegistrationSection(ctx, user);
  });

  bot.hears(MENU_BUTTONS.MY_DATA, async (ctx) => {
    const user = await ensureUserAccess(ctx);

    if (!user) {
      return;
    }

    await openRegistrationSection(ctx, user);
  });

  bot.hears(MENU_BUTTONS.BOOKING, async (ctx) => {
    const user = await ensureUserAccess(ctx);

    if (!user) {
      return;
    }

    await openBookingSection(ctx, user);
  });

  bot.hears(MENU_BUTTONS.MY_BOOKINGS, async (ctx) => {
    const user = await ensureUserAccess(ctx);

    if (!user) {
      return;
    }

    await showUserBookings(ctx, user);
  });

  bot.hears(MENU_BUTTONS.HELP, async (ctx) => {
    await ctx.reply(BOT_TEXTS.HELP_PROMPT, getHelpKeyboard());
  });

  bot.action(BOOKING_CALLBACKS.CANCEL, async (ctx) => {
    ctx.state?.requestLogger?.info(
      {
        event: 'booking_cancelled',
        sceneId: ctx.scene?.current?.id ?? null,
        staleCallback: true,
      },
      'Booking flow event: booking_cancelled',
    );

    if (!ctx.scene?.current || ctx.scene.current.id === BOOKING_SCENE_ID) {
      ctx.scene?.reset?.();
    }
    await answerBookingCallback(ctx);
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] }).catch(() => undefined);
    await ctx.reply('Заявку можно оформить позже.', getMainMenuKeyboard());
  });

  bot.action(/^booking:user:cancel:(?!confirm:|back:)(.+)$/, async (ctx) => {
    await withBookingAction(ctx, async (user) => {
      const bookingId = extractCallbackValue(ctx, BOOKING_CALLBACKS.USER_CANCEL_PREFIX);
      const booking = await services.bookingService.getUserActiveBoutiqueBooking(user.id, bookingId);

      await answerBookingCallback(ctx);
      await renderInlineMessage(
        ctx,
        buildCancelPromptText(booking),
        getUserBookingCancelConfirmKeyboard(booking.id),
      );
    });
  });

  bot.action(/^booking:user:cancel:confirm:(.+)$/, async (ctx) => {
    await withBookingAction(ctx, async (user) => {
      const bookingId = extractCallbackValue(ctx, BOOKING_CALLBACKS.USER_CANCEL_CONFIRM_PREFIX);
      const booking = await services.bookingService.cancelUserBoutiqueBooking(user.id, bookingId);

      await answerBookingCallback(ctx);
      await renderInlineMessage(ctx, buildCancelledText(booking));
      await notifyBookingAdminsAboutUserCancellation(ctx, booking);
    });
  });

  bot.action(/^booking:user:cancel:back:(.+)$/, async (ctx) => {
    await withBookingAction(ctx, async (user) => {
      const bookingId = extractCallbackValue(ctx, BOOKING_CALLBACKS.USER_CANCEL_BACK_PREFIX);
      const booking = await services.bookingService.getUserVisibleBookingById(user.id, bookingId);

      if (!booking) {
        await answerBookingCallback(ctx, 'Запись не найдена.', true);
        return;
      }

      await answerBookingCallback(ctx);
      await renderExistingBookingCard(ctx, booking);
    });
  });

  bot.action(/^booking:user:reschedule:(?!continue:|back:)(.+)$/, async (ctx) => {
    await withBookingAction(ctx, async (user) => {
      const bookingId = extractCallbackValue(ctx, BOOKING_CALLBACKS.USER_RESCHEDULE_PREFIX);
      const booking = await services.bookingService.getUserActiveBoutiqueBooking(user.id, bookingId);

      await answerBookingCallback(ctx);
      await renderInlineMessage(
        ctx,
        buildReschedulePromptText(booking),
        getUserBookingReschedulePromptKeyboard(booking.id),
      );
    });
  });

  bot.action(/^booking:user:reschedule:back:(.+)$/, async (ctx) => {
    await withBookingAction(ctx, async (user) => {
      const bookingId = extractCallbackValue(ctx, BOOKING_CALLBACKS.USER_RESCHEDULE_BACK_PREFIX);
      const booking = await services.bookingService.getUserVisibleBookingById(user.id, bookingId);

      if (!booking) {
        await answerBookingCallback(ctx, 'Запись не найдена.', true);
        return;
      }

      await answerBookingCallback(ctx);
      await renderExistingBookingCard(ctx, booking);
    });
  });

  bot.action(/^booking:user:reschedule:continue:(.+)$/, async (ctx) => {
    await withBookingAction(ctx, async (user) => {
      const bookingId = extractCallbackValue(ctx, BOOKING_CALLBACKS.USER_RESCHEDULE_CONTINUE_PREFIX);

      await services.bookingService.getUserActiveBoutiqueBooking(user.id, bookingId);
      await ctx.scene.enter(BOOKING_RESCHEDULE_SCENE_ID, { bookingId });
    });
  });

  bot.hears(MENU_BUTTONS.TAKE_ITEMS, async (ctx) => {
    const user = await ensureUserAccess(ctx);

    if (!user) {
      return;
    }

    const registrationSummary = await services.registrationService.getRegistrationSummary(user.id);

    if (!registrationSummary.exists) {
      await ctx.reply(
        'Сначала нажми «Регистрация».',
        getMainMenuKeyboard(),
      );
      return;
    }

    const result = await services.timerService.startTimerForUserLatestBooking(user.id);

    if (result.requiresBooking) {
      await ctx.reply(
        'Сначала нажми «Записаться».',
        getMainMenuKeyboard(),
      );
      return;
    }

    if (result.alreadyActive) {
      await ctx.reply(
        'Ты уже отметил(а), что взял(а) образы.',
        getMainMenuKeyboard(),
      );
      return;
    }

    await ctx.reply(
      BOT_TEXTS.TAKE_ITEMS_SUCCESS,
      getMainMenuKeyboard(),
    );
  });

  bot.action(BOOKING_CALLBACKS.PDF_REQUIRED_UPLOAD, async (ctx) => {
    const user = await ensureUserAccess(ctx);

    if (!user) {
      return;
    }

    const registration = await services.registrationService.getRegistrationByUserId(user.id);

    if (!registration) {
      await answerBookingCallback(ctx);
      await renderInlineMessage(ctx, 'Сначала нажми «Регистрация».');
      await ctx.reply('Сначала нажми «Регистрация».', getMainMenuKeyboard());
      return;
    }

    await answerBookingCallback(ctx);
    await ctx.scene.enter(REGISTRATION_EDIT_SCENE_ID, {
      openPdfUpload: true,
    });
  });

  bot.action(BOOKING_CALLBACKS.PDF_REQUIRED_BACK, async (ctx) => {
    await answerBookingCallback(ctx);
    await renderInlineMessage(ctx, 'Сначала нужно загрузить PDF.');
    await ctx.reply(BOT_TEXTS.MENU_HINT, getMainMenuKeyboard());
  });

  bot.hears(MENU_BUTTONS.RETURN_ITEMS, async (ctx) => {
    const user = await ensureUserAccess(ctx);

    if (!user) {
      return;
    }

    const timer = await services.timerService.completeLatestActiveTimerForUser(user.id);

    if (!timer) {
      await ctx.reply('Сейчас у тебя нет активной выдачи образов.', getMainMenuKeyboard());
      return;
    }

    await ctx.reply(
      'Готово, возврат отмечен.',
      getMainMenuKeyboard(),
    );
  });

  bot.hears(MENU_BUTTONS.MAIN_MENU, async (ctx) => {
    await ctx.reply(BOT_TEXTS.MENU_HINT, getMainMenuKeyboard());
  });

  bot.on('text', async (ctx, next) => {
    if (ctx.scene?.current) {
      return next();
    }

    const knownButtons = new Set(Object.values(MENU_BUTTONS));

    if (knownButtons.has(ctx.message.text)) {
      return next();
    }

    await ctx.reply(
      'Выбери нужный раздел ниже.',
      getMainMenuKeyboard(),
    );
  });
}
