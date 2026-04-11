# Admin Booking Cancellation Notification

[src/bot/handlers/menuHandlers.js](C:\Users\PC\OneDrive\Desktop\cerca trova bot\src\bot\handlers\menuHandlers.js)
```js
import { BookingStatus, VisitMode } from '@prisma/client';

import { BOT_TEXTS, MENU_BUTTONS } from '../../utils/constants.js';
import { dayjs, formatDate } from '../../utils/date.js';
import { AppError } from '../../utils/errors.js';
import { formatSlotLabelForUser } from '../../utils/slots.js';
import {
  formatUserBookingArchive,
  formatUserBookingCard,
} from '../../utils/formatters.js';
import { formatRegistrationSizes, getRegistrationCdekAddress, getRegistrationHomeAddress } from '../../utils/registration.js';
import {
  BOOKING_CALLBACKS,
  getUserBookingCancelConfirmKeyboard,
  getUserBookingReschedulePromptKeyboard,
  getUserBoutiqueBookingActionsKeyboard,
} from '../keyboards/booking.js';
import { getMainMenuKeyboard } from '../keyboards/mainMenu.js';
import { BOOKING_RESCHEDULE_SCENE_ID } from '../scenes/bookingRescheduleScene.js';
import { BOOKING_SCENE_ID } from '../scenes/bookingScene.js';
import { REGISTRATION_SCENE_ID } from '../scenes/registrationScene.js';

const ACTIVE_BOOKING_STATUSES = [BookingStatus.CREATED, BookingStatus.SUBMITTED];

function buildBlockedMessage(user, supportContact) {
  const lines = [BOT_TEXTS.BLOCKED];

  if (user.blockedReason) {
    lines.push(`РџСЂРёС‡РёРЅР°: ${user.blockedReason}`);
  }

  lines.push(`Р•СЃР»Рё РЅСѓР¶РЅР° РїРѕРјРѕС‰СЊ: ${supportContact}`);

  return lines.join('\n');
}

function buildRegistrationInfoMessage(registration) {
  const homeAddress = getRegistrationHomeAddress(registration);
  const cdekAddress = getRegistrationCdekAddress(registration);
  const lines = [
    'РўРІРѕРё РґР°РЅРЅС‹Рµ СѓР¶Рµ СЃРѕС…СЂР°РЅРµРЅС‹ рџ’«',
    'Р•СЃР»Рё С‡С‚Рѕ-С‚Рѕ РЅСѓР¶РЅРѕ РёР·РјРµРЅРёС‚СЊ, РЅР°РїРёС€Рё Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂСѓ.',
    '',
    `Р¤РРћ: ${registration.fullName}`,
    `РўРµР»РµС„РѕРЅ: ${registration.phone}`,
    `РќРёРє: ${registration.telegramUsername}`,
    `Р”РѕРјР°С€РЅРёР№ Р°РґСЂРµСЃ: ${homeAddress || 'РЅРµ СѓРєР°Р·Р°РЅ'}`,
    `РђРґСЂРµСЃ РЎР”Р­Рљ: ${cdekAddress || 'РЅРµ СѓРєР°Р·Р°РЅ'}`,
    '',
    formatRegistrationSizes(registration.sizes),
  ];

  return lines.join('\n');
}

function isMessageNotModifiedError(error) {
  return error?.description === 'Bad Request: message is not modified' || error?.response?.description === 'Bad Request: message is not modified';
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
  const extra = markup ?? {};

  try {
    await ctx.editMessageText(text, extra);
  } catch (error) {
    if (!isMessageNotModifiedError(error)) {
      throw error;
    }

    if (extra.reply_markup) {
      await ctx.editMessageReplyMarkup(extra.reply_markup).catch(() => undefined);
    }
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
    'РћС‚РјРµРЅРёС‚СЊ СЌС‚Сѓ Р·Р°РїРёСЃСЊ?',
  ].join('\n\n');
}

function buildReschedulePromptText(booking) {
  return [
    formatUserBookingCard(booking, {
      includeStatus: false,
    }),
    'РўРµРєСѓС‰Р°СЏ Р·Р°РїРёСЃСЊ Р±СѓРґРµС‚ Р·Р°РјРµРЅРµРЅР° РЅРѕРІРѕР№. РџСЂРѕРґРѕР»Р¶РёС‚СЊ?',
  ].join('\n\n');
}

function buildCancelledText() {
  return 'Р—Р°РїРёСЃСЊ РѕС‚РјРµРЅРµРЅР°.';
}

function buildBookingUserName(booking) {
  const fullName =
    booking?.user?.registration?.fullName ||
    [booking?.user?.firstName, booking?.user?.lastName].filter(Boolean).join(' ').trim();

  return fullName || 'РљСЂРµР°С‚РѕСЂ Р±РµР· РёРјРµРЅРё';
}

function buildBookingUsername(booking) {
  const registrationUsername = booking?.user?.registration?.telegramUsername;

  if (registrationUsername) {
    return registrationUsername;
  }

  if (booking?.user?.username) {
    return `@${booking.user.username}`;
  }

  return 'РЅРµ СѓРєР°Р·Р°РЅ';
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
  const boutiqueName = booking?.boutique?.name ?? booking?.boutiqueAddress ?? 'РќРµ СѓРєР°Р·Р°РЅ';

  return [
    isUrgent ? 'РЎСЂРѕС‡РЅР°СЏ РѕС‚РјРµРЅР° Р·Р°РїРёСЃРё РЅР° СЃРµРіРѕРґРЅСЏ' : 'РћС‚РјРµРЅР° Р·Р°РїРёСЃРё',
    '',
    `РљСЂРµР°С‚РѕСЂ: ${buildBookingUserName(booking)}`,
    `РќРёРє: ${buildBookingUsername(booking)}`,
    `Р‘СѓС‚РёРє: ${boutiqueName}`,
    `Р”Р°С‚Р°: ${booking?.visitDate ? formatDate(booking.visitDate, 'DD.MM.YYYY') : 'РќРµ СѓРєР°Р·Р°РЅР°'}`,
    `Р’СЂРµРјСЏ: ${formatSlotLabelForUser(booking?.slotLabel ?? booking?.timeSlot?.label) || 'РќРµ СѓРєР°Р·Р°РЅРѕ'}`,
    `РћС‚РјРµРЅРµРЅРѕ: ${formatDate(cancelledAt, 'DD.MM.YYYY HH:mm')}`,
  ].join('\n');
}

function buildArchivedBookingsText(bookings) {
  const visibleBookings = bookings.slice(0, 3);
  const hiddenCount = bookings.length - visibleBookings.length;
  const lines = [formatUserBookingArchive(visibleBookings, 'РџСЂРѕС€Р»С‹Рµ Р·Р°СЏРІРєРё')];

  if (hiddenCount > 0) {
    lines.push(`Р РµС‰С‘ ${hiddenCount} РІ РёСЃС‚РѕСЂРёРё.`);
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

    await ctx.reply(buildRegistrationInfoMessage(registration), getMainMenuKeyboard());
  }

  async function notifyPrimaryAdminAboutUserCancellation(ctx, booking) {
    const requestLogger = ctx.state?.requestLogger;
    const primaryAdmin = await services.adminService.getPrimaryAlertAdmin();
    const adminTelegramId =
      primaryAdmin?.notificationChatId ??
      primaryAdmin?.user?.telegramId ??
      env.PRIMARY_ADMIN_ID ??
      '1731711996';

    if (!adminTelegramId) {
      if (requestLogger) {
        requestLogger.warn(
          {
            bookingId: booking.id,
            userId: booking.userId,
          },
          'No admin recipient configured for booking cancellation alerts',
        );
      }
      return;
    }

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

  async function showUserBookings(ctx, user) {
    const bookings = await services.bookingService.listUserBookings(user.id, 50);

    if (bookings.length === 0) {
      await ctx.reply('РЈ С‚РµР±СЏ РїРѕРєР° РЅРµС‚ Р·Р°СЏРІРѕРє.', getMainMenuKeyboard());
      return;
    }

    const activeBookings = sortActiveBookings(bookings.filter(isActiveBooking));
    const archivedBookings = sortArchivedBookings(bookings.filter((booking) => !isActiveBooking(booking)));

    if (activeBookings.length > 0) {
      await ctx.reply('РђРєС‚РёРІРЅС‹Рµ Р·Р°СЏРІРєРё', getMainMenuKeyboard());

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

    await ctx.scene.enter(BOOKING_SCENE_ID);
  });

  bot.hears(MENU_BUTTONS.MY_BOOKINGS, async (ctx) => {
    const user = await ensureUserAccess(ctx);

    if (!user) {
      return;
    }

    await showUserBookings(ctx, user);
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
      await notifyPrimaryAdminAboutUserCancellation(ctx, booking);
    });
  });

  bot.action(/^booking:user:cancel:back:(.+)$/, async (ctx) => {
    await withBookingAction(ctx, async (user) => {
      const bookingId = extractCallbackValue(ctx, BOOKING_CALLBACKS.USER_CANCEL_BACK_PREFIX);
      const booking = await services.bookingService.getUserBookingById(user.id, bookingId);

      if (!booking) {
        await answerBookingCallback(ctx, 'Р—Р°РїРёСЃСЊ РЅРµ РЅР°Р№РґРµРЅР°.', true);
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
      const booking = await services.bookingService.getUserBookingById(user.id, bookingId);

      if (!booking) {
        await answerBookingCallback(ctx, 'Р—Р°РїРёСЃСЊ РЅРµ РЅР°Р№РґРµРЅР°.', true);
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
        'РЎРЅР°С‡Р°Р»Р° РЅР°Р¶РјРё В«Р РµРіРёСЃС‚СЂР°С†РёСЏВ».',
        getMainMenuKeyboard(),
      );
      return;
    }

    const result = await services.timerService.startTimerForUserLatestBooking(user.id);

    if (result.requiresBooking) {
      await ctx.reply(
        'РЎРЅР°С‡Р°Р»Р° РЅР°Р¶РјРё В«Р—Р°РїРёСЃР°С‚СЊСЃСЏВ».',
        getMainMenuKeyboard(),
      );
      return;
    }

    if (result.alreadyActive) {
      await ctx.reply(
        'РўС‹ СѓР¶Рµ РѕС‚РјРµС‚РёР»(Р°), С‡С‚Рѕ РІР·СЏР»(Р°) РѕР±СЂР°Р·С‹.',
        getMainMenuKeyboard(),
      );
      return;
    }

    await ctx.reply(
      'Р“РѕС‚РѕРІРѕ, РІС‹РґР°С‡Р° РѕС‚РјРµС‡РµРЅР°.',
      getMainMenuKeyboard(),
    );
  });

  bot.hears(MENU_BUTTONS.RETURN_ITEMS, async (ctx) => {
    const user = await ensureUserAccess(ctx);

    if (!user) {
      return;
    }

    const timer = await services.timerService.completeLatestActiveTimerForUser(user.id);

    if (!timer) {
      await ctx.reply('РЎРµР№С‡Р°СЃ Сѓ С‚РµР±СЏ РЅРµС‚ Р°РєС‚РёРІРЅРѕР№ РІС‹РґР°С‡Рё РѕР±СЂР°Р·РѕРІ.', getMainMenuKeyboard());
      return;
    }

    await ctx.reply(
      'Р“РѕС‚РѕРІРѕ, РІРѕР·РІСЂР°С‚ РѕС‚РјРµС‡РµРЅ.',
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
      'Р’С‹Р±РµСЂРё РЅСѓР¶РЅС‹Р№ СЂР°Р·РґРµР» РЅРёР¶Рµ.',
      getMainMenuKeyboard(),
    );
  });
}

```

[src/services/bookingService.js](C:\Users\PC\OneDrive\Desktop\cerca trova bot\src\services\bookingService.js)
```js
import { BookingRequestType, BookingStatus, Prisma, TimerStatus, VisitMode } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

import { ADMIN_PERMISSIONS, AUDIT_ACTIONS } from '../utils/constants.js';
import { dayjs, formatDate, getNextAvailableBookingDates, now, startOfDate } from '../utils/date.js';
import { AppError, ForbiddenError, NotFoundError, ValidationError } from '../utils/errors.js';
import { filterUserVisibleBoutiques } from '../utils/boutiques.js';
import { normalizeEmail, normalizeEmailList, normalizeOptionalEmail } from '../utils/mail.js';
import {
  formatAvailableSlotsList,
  formatBoutiqueAddress,
  formatBoutiquesList,
  formatTimeSlotsList,
} from '../utils/formatters.js';
import { ensureFutureOrToday, ensureNonEmptyString, normalizeTelegramId } from '../utils/validators.js';

const ACTIVE_BOOKING_STATUSES = [BookingStatus.CREATED, BookingStatus.SUBMITTED];
const OPEN_TIMER_STATUSES = [TimerStatus.ACTIVE, TimerStatus.OVERDUE];
const ADMIN_USER_INCLUDE = Object.freeze({
  registration: true,
  _count: {
    select: {
      bookings: true,
      timers: true,
    },
  },
});
const ADMIN_BOOKING_INCLUDE = Object.freeze({
  user: {
    include: {
      registration: true,
    },
  },
  boutique: true,
  timeSlot: true,
});
const USER_BOOKING_INCLUDE = Object.freeze({
  boutique: true,
  timeSlot: true,
});
const USER_BOOKING_WITH_USER_INCLUDE = Object.freeze({
  ...USER_BOOKING_INCLUDE,
  user: {
    include: {
      registration: true,
    },
  },
});

function buildActiveSlotKey({ boutiqueId, slotId, visitDate }) {
  return `${boutiqueId}:${slotId}:${dayjs(visitDate).format('YYYY-MM-DD')}`;
}

function normalizeOptionalText(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized === '' ? null : normalized;
}

function buildBoutiqueCode({ code, name, city, addressLine1 }) {
  if (code) {
    return ensureNonEmptyString(code, 'РљРѕРґ Р±СѓС‚РёРєР°').toUpperCase();
  }

  const randomCode = uuidv4().split('-')[0].toUpperCase();
  const cityFragment = String(city ?? '').trim().toUpperCase().slice(0, 3);
  const addressFragment = String(addressLine1 ?? '').replace(/\s+/g, '').slice(0, 6).toUpperCase();
  const nameFragment = String(name ?? '').replace(/\s+/g, '').slice(0, 6).toUpperCase();

  return [cityFragment, nameFragment || addressFragment, randomCode].filter(Boolean).join('_');
}

function buildSlotComment({ boutique, date, slot, reason = '' }) {
  return [
    `Р‘СѓС‚РёРє: ${boutique.name}`,
    `Р”Р°С‚Р°: ${formatDate(date, 'DD.MM.YYYY')}`,
    `РЎР»РѕС‚: ${slot.label}`,
    reason ? `РџСЂРёС‡РёРЅР°: ${reason}` : '',
  ]
    .filter(Boolean)
    .join(' | ');
}

function buildUserComment(user, reason = '') {
  const fullName =
    user?.registration?.fullName ||
    [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim() ||
    'Р‘РµР· РёРјРµРЅРё';
  const username = user?.registration?.telegramUsername ?? (user?.username ? `@${user.username}` : 'Р±РµР· username');

  return [
    `РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ: ${fullName}`,
    `Username: ${username}`,
    `Telegram ID: ${user.telegramId}`,
    reason ? `РљРѕРјРјРµРЅС‚Р°СЂРёР№: ${reason}` : '',
  ]
    .filter(Boolean)
    .join(' | ');
}

function buildBookingChangeComment(booking, action, extra = '') {
  return [
    `action: ${action}`,
    booking?.publicId ? `booking_id: ${booking.publicId}` : '',
    extra,
  ]
    .filter(Boolean)
    .join(' | ');
}

function isUniqueConstraintError(error, fieldName) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002' &&
    Array.isArray(error.meta?.target) &&
    error.meta.target.includes(fieldName)
  );
}

function normalizeUsernameQuery(value) {
  const rawValue = ensureNonEmptyString(value, 'Username');
  const withoutAt = rawValue.replace(/^@/, '');

  return {
    withAt: rawValue.startsWith('@') ? rawValue : `@${rawValue}`,
    withoutAt,
  };
}

export function createBookingService({ prisma, logger, googleSheets, adminService, emailService }) {
  const serviceLogger = logger.child({ service: 'booking' });

  async function getBoutiques({ includeInactive = false, includeTimeSlots = true } = {}) {
    return prisma.boutique.findMany({
      where: includeInactive ? undefined : { isActive: true },
      include: includeTimeSlots
        ? {
            timeSlots: {
              where: includeInactive ? undefined : { isActive: true },
              orderBy: [{ sortOrder: 'asc' }, { startTime: 'asc' }],
            },
          }
        : undefined,
      orderBy: [{ city: 'asc' }, { name: 'asc' }],
    });
  }

  async function getUserVisibleBoutiques({ includeTimeSlots = true } = {}) {
    const boutiques = await getBoutiques({
      includeInactive: false,
      includeTimeSlots,
    });

    return filterUserVisibleBoutiques(boutiques);
  }

  async function createBoutique(data, adminActorId) {
    const admin = await adminService.assertPermission(adminActorId, ADMIN_PERMISSIONS.MANAGE_BOUTIQUES);
    const name = ensureNonEmptyString(data.name, 'РќР°Р·РІР°РЅРёРµ Р±СѓС‚РёРєР°');
    const addressLine1 = ensureNonEmptyString(data.addressLine1, 'РђРґСЂРµСЃ Р±СѓС‚РёРєР°');
    const city = ensureNonEmptyString(data.city, 'Р“РѕСЂРѕРґ');
    const email = normalizeOptionalEmail(data.email, 'Email Р±СѓС‚РёРєР°');
    const ccEmails = Array.isArray(data.ccEmails)
      ? [...new Set(data.ccEmails.map((item) => normalizeEmail(item, 'Р”РѕРїРѕР»РЅРёС‚РµР»СЊРЅС‹Рµ email')))]
      : normalizeEmailList(data.ccEmails ?? '', {
          allowEmpty: true,
          fieldName: 'Р”РѕРїРѕР»РЅРёС‚РµР»СЊРЅС‹Рµ email',
        });
    const code = buildBoutiqueCode({
      code: data.code,
      name,
      city,
      addressLine1,
    });

    const existing = await prisma.boutique.findFirst({
      where: {
        OR: [
          { code },
          {
            name,
            addressLine1,
            city,
          },
        ],
      },
    });

    let boutique;

    if (existing?.isActive) {
      throw new ValidationError('Р‘СѓС‚РёРє СЃ С‚Р°РєРёРјРё РґР°РЅРЅС‹РјРё СѓР¶Рµ СЃСѓС‰РµСЃС‚РІСѓРµС‚');
    }

    if (existing) {
      boutique = await prisma.boutique.update({
        where: { id: existing.id },
        data: {
          code,
          name,
          addressLine1,
          addressLine2: data.addressLine2 ?? null,
          ccEmails: ccEmails.length > 0 ? ccEmails.join(', ') : null,
          city,
          email,
          notes: data.notes ?? null,
          isActive: true,
        },
      });
    } else {
      boutique = await prisma.boutique.create({
        data: {
          code,
          name,
          addressLine1,
          addressLine2: data.addressLine2 ?? null,
          ccEmails: ccEmails.length > 0 ? ccEmails.join(', ') : null,
          city,
          email,
          notes: data.notes ?? null,
          isActive: true,
        },
      });
    }

    await prisma.auditLog.create({
      data: {
        action: AUDIT_ACTIONS.BOUTIQUE_CREATED,
        adminId: admin.id,
        actorType: 'ADMIN',
        entityType: 'Boutique',
        entityId: boutique.id,
        message: `РЎРѕР·РґР°РЅ РёР»Рё Р°РєС‚РёРІРёСЂРѕРІР°РЅ Р±СѓС‚РёРє ${boutique.name}`,
      },
    });

    await googleSheets.logAdminAction({
      action: AUDIT_ACTIONS.BOUTIQUE_CREATED,
      adminId: admin.user.telegramId,
      comment: `РЎРѕР·РґР°РЅ РёР»Рё Р°РєС‚РёРІРёСЂРѕРІР°РЅ Р±СѓС‚РёРє "${boutique.name}" (${formatBoutiqueAddress(boutique)})`,
      status: 'active',
    });

    return boutique;
  }

  async function removeBoutique(boutiqueId, adminActorId) {
    const admin = await adminService.assertPermission(adminActorId, ADMIN_PERMISSIONS.MANAGE_BOUTIQUES);
    const boutique = await requireBoutique(boutiqueId, { includeInactive: true });

    await prisma.$transaction([
      prisma.boutique.update({
        where: { id: boutique.id },
        data: { isActive: false },
      }),
      prisma.timeSlot.updateMany({
        where: { boutiqueId: boutique.id },
        data: { isActive: false },
      }),
      prisma.slotClosure.updateMany({
        where: { boutiqueId: boutique.id },
        data: { isActive: false },
      }),
      prisma.auditLog.create({
        data: {
          action: AUDIT_ACTIONS.BOUTIQUE_REMOVED,
          adminId: admin.id,
          actorType: 'ADMIN',
          entityType: 'Boutique',
          entityId: boutique.id,
          message: `Р‘СѓС‚РёРє РґРµР°РєС‚РёРІРёСЂРѕРІР°РЅ: ${boutique.name}`,
        },
      }),
    ]);

    await googleSheets.logAdminAction({
      action: AUDIT_ACTIONS.BOUTIQUE_REMOVED,
      adminId: admin.user.telegramId,
      comment: `Р‘СѓС‚РёРє РґРµР°РєС‚РёРІРёСЂРѕРІР°РЅ: "${boutique.name}" (${formatBoutiqueAddress(boutique)})`,
      status: 'inactive',
    });

    return {
      ...boutique,
      isActive: false,
    };
  }

  async function getTimeSlots(boutiqueId = null, { includeInactive = false } = {}) {
    const where = {
      ...(includeInactive ? {} : { isActive: true }),
      ...(boutiqueId ? { boutiqueId } : {}),
    };

    return prisma.timeSlot.findMany({
      where,
      include: {
        boutique: true,
      },
      orderBy: [{ sortOrder: 'asc' }, { startTime: 'asc' }],
    });
  }

  async function createTimeSlot(boutiqueId, data, adminActorId) {
    const admin = await adminService.assertPermission(adminActorId, ADMIN_PERMISSIONS.MANAGE_TIME_SLOTS);
    const boutique = await requireBoutique(boutiqueId);
    const startTime = ensureNonEmptyString(data.startTime, 'Р’СЂРµРјСЏ РЅР°С‡Р°Р»Р°');
    const endTime = ensureNonEmptyString(data.endTime, 'Р’СЂРµРјСЏ РѕРєРѕРЅС‡Р°РЅРёСЏ');
    const label = data.label ? ensureNonEmptyString(data.label, 'РџРѕРґРїРёСЃСЊ СЃР»РѕС‚Р°') : `${startTime}-${endTime}`;
    const capacity = Number.isInteger(data.capacity) ? data.capacity : 1;
    const sortOrder = Number.isInteger(data.sortOrder) ? data.sortOrder : 0;

    const existing = await prisma.timeSlot.findUnique({
      where: {
        boutiqueId_startTime_endTime: {
          boutiqueId: boutique.id,
          startTime,
          endTime,
        },
      },
    });

    if (existing?.isActive) {
      throw new ValidationError('РўР°РєРѕР№ СЃР»РѕС‚ СѓР¶Рµ СЃСѓС‰РµСЃС‚РІСѓРµС‚ РІ СЌС‚РѕРј Р±СѓС‚РёРєРµ');
    }

    let slot;

    if (existing) {
      slot = await prisma.timeSlot.update({
        where: { id: existing.id },
        data: {
          label,
          capacity,
          sortOrder,
          isActive: true,
        },
      });
    } else {
      slot = await prisma.timeSlot.create({
        data: {
          boutiqueId: boutique.id,
          label,
          startTime,
          endTime,
          capacity,
          sortOrder,
          isActive: true,
        },
      });
    }

    await prisma.auditLog.create({
      data: {
        action: AUDIT_ACTIONS.TIME_SLOT_CREATED,
        adminId: admin.id,
        actorType: 'ADMIN',
        entityType: 'TimeSlot',
        entityId: slot.id,
        message: `РЎРѕР·РґР°РЅ РёР»Рё Р°РєС‚РёРІРёСЂРѕРІР°РЅ СЃР»РѕС‚ ${slot.label} РґР»СЏ Р±СѓС‚РёРєР° ${boutique.name}`,
      },
    });

    await googleSheets.logAdminAction({
      action: AUDIT_ACTIONS.TIME_SLOT_CREATED,
      adminId: admin.user.telegramId,
      comment: `РЎРѕР·РґР°РЅ РёР»Рё Р°РєС‚РёРІРёСЂРѕРІР°РЅ СЃР»РѕС‚ "${slot.label}" РґР»СЏ Р±СѓС‚РёРєР° "${boutique.name}"`,
      status: 'active',
    });

    return slot;
  }

  async function removeTimeSlot(slotId, adminActorId) {
    const admin = await adminService.assertPermission(adminActorId, ADMIN_PERMISSIONS.MANAGE_TIME_SLOTS);
    const slot = await requireTimeSlot(slotId, { includeInactive: true });

    await prisma.$transaction([
      prisma.timeSlot.update({
        where: { id: slot.id },
        data: { isActive: false },
      }),
      prisma.slotClosure.updateMany({
        where: { timeSlotId: slot.id },
        data: { isActive: false },
      }),
      prisma.auditLog.create({
        data: {
          action: AUDIT_ACTIONS.TIME_SLOT_REMOVED,
          adminId: admin.id,
          actorType: 'ADMIN',
          entityType: 'TimeSlot',
          entityId: slot.id,
          message: `РЎР»РѕС‚ РґРµР°РєС‚РёРІРёСЂРѕРІР°РЅ: ${slot.label}`,
        },
      }),
    ]);

    await googleSheets.logAdminAction({
      action: AUDIT_ACTIONS.TIME_SLOT_REMOVED,
      adminId: admin.user.telegramId,
      comment: `РЎР»РѕС‚ РґРµР°РєС‚РёРІРёСЂРѕРІР°РЅ: "${slot.label}"`,
      status: 'inactive',
    });

    return {
      ...slot,
      isActive: false,
    };
  }

  async function getAvailableSlotsByDate(boutiqueId, date) {
    const boutique = await requireBoutique(boutiqueId);
    const normalizedDate = ensureFutureOrToday(date, 'Р”Р°С‚Р° РІРёР·РёС‚Р°');

    const [slots, closures, bookings] = await Promise.all([
      prisma.timeSlot.findMany({
        where: {
          boutiqueId: boutique.id,
          isActive: true,
        },
        orderBy: [{ sortOrder: 'asc' }, { startTime: 'asc' }],
      }),
      prisma.slotClosure.findMany({
        where: {
          boutiqueId: boutique.id,
          date: startOfDate(normalizedDate),
          isActive: true,
        },
      }),
      prisma.booking.findMany({
        where: {
          visitMode: VisitMode.BOUTIQUE,
          boutiqueId: boutique.id,
          visitDate: startOfDate(normalizedDate),
          status: {
            in: ACTIVE_BOOKING_STATUSES,
          },
        },
        include: {
          user: true,
        },
      }),
    ]);

    const closureBySlotId = new Map(closures.map((closure) => [closure.timeSlotId, closure]));
    const bookingBySlotId = new Map(bookings.map((booking) => [booking.timeSlotId, booking]));

    return slots.map((slot) => {
      const closure = closureBySlotId.get(slot.id);
      const booking = bookingBySlotId.get(slot.id);
      const isAvailable = !closure && !booking;

      return {
        boutique,
        booking,
        closure,
        date: startOfDate(normalizedDate),
        isAvailable,
        slot,
        statusText: isAvailable
          ? 'РЎРІРѕР±РѕРґРµРЅ'
          : closure
            ? `Р—Р°РєСЂС‹С‚ Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂРѕРј${closure.reason ? `: ${closure.reason}` : ''}`
            : 'РЈР¶Рµ Р·Р°РЅСЏС‚',
      };
    });
  }

  async function closeSlot(boutiqueId, date, slotId, adminActorId, reason = null) {
    const admin = await adminService.assertPermission(adminActorId, ADMIN_PERMISSIONS.MANAGE_SLOTS);
    const boutique = await requireBoutique(boutiqueId);
    const slot = await requireTimeSlot(slotId);
    const normalizedDate = startOfDate(ensureFutureOrToday(date, 'Р”Р°С‚Р° РІРёР·РёС‚Р°'));

    if (slot.boutiqueId !== boutique.id) {
      throw new ValidationError('РЎР»РѕС‚ РЅРµ РїСЂРёРЅР°РґР»РµР¶РёС‚ РІС‹Р±СЂР°РЅРЅРѕРјСѓ Р±СѓС‚РёРєСѓ');
    }

    const closure = await prisma.slotClosure.upsert({
      where: {
        timeSlotId_date: {
          timeSlotId: slot.id,
          date: normalizedDate,
        },
      },
      create: {
        boutiqueId: boutique.id,
        timeSlotId: slot.id,
        date: normalizedDate,
        reason: normalizeOptionalText(reason),
        closedByAdminId: admin.id,
        isActive: true,
      },
      update: {
        reason: normalizeOptionalText(reason),
        closedByAdminId: admin.id,
        isActive: true,
      },
    });

    const comment = buildSlotComment({
      boutique,
      date: normalizedDate,
      reason: normalizeOptionalText(reason) ?? '',
      slot,
    });

    await prisma.auditLog.create({
      data: {
        action: AUDIT_ACTIONS.SLOT_CLOSED,
        adminId: admin.id,
        actorType: 'ADMIN',
        entityType: 'SlotClosure',
        entityId: closure.id,
        message: comment,
      },
    });

    await googleSheets.logAdminAction({
      action: AUDIT_ACTIONS.SLOT_CLOSED,
      adminId: admin.user.telegramId,
      comment,
      status: 'closed',
    });

    return closure;
  }

  async function openSlot(boutiqueId, date, slotId, adminActorId) {
    const admin = await adminService.assertPermission(adminActorId, ADMIN_PERMISSIONS.MANAGE_SLOTS);
    const boutique = await requireBoutique(boutiqueId);
    const slot = await requireTimeSlot(slotId);
    const normalizedDate = startOfDate(ensureFutureOrToday(date, 'Р”Р°С‚Р° РІРёР·РёС‚Р°'));

    if (slot.boutiqueId !== boutique.id) {
      throw new ValidationError('РЎР»РѕС‚ РЅРµ РїСЂРёРЅР°РґР»РµР¶РёС‚ РІС‹Р±СЂР°РЅРЅРѕРјСѓ Р±СѓС‚РёРєСѓ');
    }

    const closure = await prisma.slotClosure.findUnique({
      where: {
        timeSlotId_date: {
          timeSlotId: slot.id,
          date: normalizedDate,
        },
      },
    });

    if (!closure?.isActive) {
      return null;
    }

    const reopenedClosure = await prisma.slotClosure.update({
      where: { id: closure.id },
      data: { isActive: false },
    });

    const comment = buildSlotComment({
      boutique,
      date: normalizedDate,
      slot,
    });

    await prisma.auditLog.create({
      data: {
        action: AUDIT_ACTIONS.SLOT_OPENED,
        adminId: admin.id,
        actorType: 'ADMIN',
        entityType: 'SlotClosure',
        entityId: closure.id,
        message: comment,
      },
    });

    await googleSheets.logAdminAction({
      action: AUDIT_ACTIONS.SLOT_OPENED,
      adminId: admin.user.telegramId,
      comment,
      status: 'opened',
    });

    return reopenedClosure;
  }

  async function isUserBlocked(userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return false;
    }

    if (user.isBlocked && user.blockedUntil && user.blockedUntil <= new Date()) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          isBlocked: false,
          blockedReason: null,
          blockedUntil: null,
          blockedByAdminId: null,
        },
      });

      return false;
    }

    return Boolean(user.isBlocked);
  }

  async function createBookingEmailFailureAudit(booking, errorMessage) {
    try {
      await prisma.auditLog.create({
        data: {
          action: AUDIT_ACTIONS.BOUTIQUE_BOOKING_EMAIL_FAILED,
          actorType: 'SYSTEM',
          entityType: 'Booking',
          entityId: booking.id,
          message: errorMessage,
          userId: booking.userId,
        },
      });
    } catch (auditError) {
      serviceLogger.error(
        {
          bookingId: booking.id,
          err: auditError,
          userId: booking.userId,
        },
        'Failed to write boutique booking email failure audit log',
      );
    }
  }

  async function notifyBoutiqueByEmail(booking) {
    if (booking.visitMode !== VisitMode.BOUTIQUE) {
      return {
        ok: false,
        reason: 'not_boutique_booking',
        skipped: true,
      };
    }

    const mailResult = await emailService.sendBoutiqueBookingNotification({ booking });

    if (mailResult?.ok) {
      serviceLogger.info(
        {
          bookingId: booking.id,
          boutiqueId: booking.boutiqueId,
          messageId: mailResult.messageId,
          to: booking?.boutique?.email ?? undefined,
          userId: booking.userId,
        },
        'Boutique booking email sent',
      );

      return mailResult;
    }

    if (!mailResult?.skipped) {
      const errorMessage = mailResult?.message ?? 'Boutique booking email failed';

      serviceLogger.error(
        {
          bookingId: booking.id,
          boutiqueId: booking.boutiqueId,
          errorMessage,
          userId: booking.userId,
        },
        'Boutique booking email failed',
      );

      await createBookingEmailFailureAudit(booking, errorMessage);
    }

    return mailResult;
  }

  async function blockUser(userId, adminActorId, reason = null) {
    const admin = await adminService.assertPermission(adminActorId, ADMIN_PERMISSIONS.MANAGE_USERS);
    const user = await requireUser(userId);
    const normalizedReason = normalizeOptionalText(reason) ?? 'РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ Р·Р°Р±Р»РѕРєРёСЂРѕРІР°РЅ Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂРѕРј';

    const blockedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        isBlocked: true,
        blockedReason: normalizedReason,
        blockedByAdminId: admin.id,
      },
      include: {
        registration: true,
      },
    });

    await prisma.auditLog.create({
      data: {
        action: AUDIT_ACTIONS.USER_BLOCKED,
        adminId: admin.id,
        actorType: 'ADMIN',
        entityType: 'User',
        entityId: user.id,
        userId: user.id,
        message: normalizedReason,
      },
    });

    await googleSheets.logAdminAction({
      action: AUDIT_ACTIONS.USER_BLOCKED,
      adminId: admin.user.telegramId,
      targetUser: blockedUser,
      comment: buildUserComment(blockedUser, normalizedReason),
      status: 'blocked',
    });

    return blockedUser;
  }

  async function unblockUser(userId, adminActorId) {
    const admin = await adminService.assertPermission(adminActorId, ADMIN_PERMISSIONS.MANAGE_USERS);
    const user = await requireUser(userId);

    const unblockedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        isBlocked: false,
        blockedReason: null,
        blockedUntil: null,
        blockedByAdminId: null,
      },
      include: {
        registration: true,
      },
    });

    await prisma.auditLog.create({
      data: {
        action: AUDIT_ACTIONS.USER_UNBLOCKED,
        adminId: admin.id,
        actorType: 'ADMIN',
        entityType: 'User',
        entityId: user.id,
        userId: user.id,
        message: 'РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ СЂР°Р·Р±Р»РѕРєРёСЂРѕРІР°РЅ',
      },
    });

    await googleSheets.logAdminAction({
      action: AUDIT_ACTIONS.USER_UNBLOCKED,
      adminId: admin.user.telegramId,
      targetUser: unblockedUser,
      comment: buildUserComment(unblockedUser, 'РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ СЂР°Р·Р±Р»РѕРєРёСЂРѕРІР°РЅ'),
      status: 'unblocked',
    });

    return unblockedUser;
  }

  async function ensureCanCreateBooking(userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        registration: true,
      },
    });

    if (!user) {
      throw new AppError('РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ РЅРµ РЅР°Р№РґРµРЅ', 404);
    }

    if (await isUserBlocked(user.id)) {
      throw new ForbiddenError('РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ Р·Р°Р±Р»РѕРєРёСЂРѕРІР°РЅ Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂРѕРј');
    }

    if (!user.registration) {
      throw new ForbiddenError('РЎРЅР°С‡Р°Р»Р° РїСЂРѕР№РґРё СЂРµРіРёСЃС‚СЂР°С†РёСЋ.');
    }

    return user;
  }

  async function listUserBookings(userId, limit = 5) {
    return prisma.booking.findMany({
      where: { userId },
      include: USER_BOOKING_INCLUDE,
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
    });
  }

  async function getUserBookingById(userId, bookingId, { includeUser = false, prismaClient = prisma } = {}) {
    return prismaClient.booking.findFirst({
      where: {
        id: bookingId,
        userId,
      },
      include: includeUser ? USER_BOOKING_WITH_USER_INCLUDE : USER_BOOKING_INCLUDE,
    });
  }

  async function ensureBookingHasNoOpenTimer(bookingId, prismaClient = prisma) {
    const openTimer = await prismaClient.userItemTimer.findFirst({
      where: {
        bookingId,
        status: {
          in: OPEN_TIMER_STATUSES,
        },
      },
    });

    if (openTimer) {
      throw new ForbiddenError('Р­С‚Сѓ Р·Р°РїРёСЃСЊ СѓР¶Рµ РЅРµР»СЊР·СЏ РёР·РјРµРЅРёС‚СЊ. РќР°РїРёС€Рё Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂСѓ.');
    }
  }

  async function requireUserActiveBoutiqueBooking(userId, bookingId, { includeUser = false, prismaClient = prisma } = {}) {
    const booking = await getUserBookingById(userId, bookingId, {
      includeUser,
      prismaClient,
    });

    if (!booking) {
      throw new NotFoundError('Р—Р°РїРёСЃСЊ РЅРµ РЅР°Р№РґРµРЅР°.');
    }

    if (booking.visitMode !== VisitMode.BOUTIQUE) {
      throw new ForbiddenError('Р­С‚Сѓ Р·Р°СЏРІРєСѓ РїРѕРєР° РЅРµР»СЊР·СЏ РёР·РјРµРЅРёС‚СЊ.');
    }

    if (!ACTIVE_BOOKING_STATUSES.includes(booking.status)) {
      throw new ForbiddenError('Р­С‚Р° Р·Р°РїРёСЃСЊ СѓР¶Рµ РЅРµ Р°РєС‚РёРІРЅР°.');
    }

    await ensureBookingHasNoOpenTimer(booking.id, prismaClient);

    return booking;
  }

  async function getUserActiveBoutiqueBooking(userId, bookingId) {
    return requireUserActiveBoutiqueBooking(userId, bookingId, {
      includeUser: true,
    });
  }

  async function listRecentBookings(limit = 10) {
    return prisma.booking.findMany({
      include: ADMIN_BOOKING_INCLUDE,
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
    });
  }

  async function listBookingsCreatedOnDate(date, limit = 50) {
    const start = dayjs(startOfDate(date));
    const end = start.add(1, 'day').toDate();

    return prisma.booking.findMany({
      where: {
        createdAt: {
          gte: start.toDate(),
          lt: end,
        },
      },
      include: ADMIN_BOOKING_INCLUDE,
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
    });
  }

  async function listTodayBookings(limit = 50) {
    return listBookingsCreatedOnDate(now().toDate(), limit);
  }

  async function findUserByTelegramId(telegramId) {
    const normalizedTelegramId = normalizeTelegramId(telegramId);

    return prisma.user.findUnique({
      where: {
        telegramId: normalizedTelegramId,
      },
      include: ADMIN_USER_INCLUDE,
    });
  }

  async function findUserByUsername(username) {
    const normalized = normalizeUsernameQuery(username);

    return prisma.user.findFirst({
      where: {
        OR: [
          {
            username: normalized.withoutAt,
          },
          {
            registration: {
              telegramUsername: normalized.withAt,
            },
          },
        ],
      },
      include: ADMIN_USER_INCLUDE,
    });
  }

  async function listUsersForAdmin({ blocked = null, limit = 10 } = {}) {
    const where = {};

    if (blocked === true) {
      where.isBlocked = true;
    }

    if (blocked === false) {
      where.isBlocked = false;
    }

    return prisma.user.findMany({
      where,
      include: ADMIN_USER_INCLUDE,
      orderBy: [{ lastSeenAt: 'desc' }, { createdAt: 'desc' }],
      take: limit,
    });
  }

  function getAvailableVisitDates(days = 14) {
    return getNextAvailableBookingDates(days);
  }

  async function listBoutiquesWithSlots() {
    return getUserVisibleBoutiques();
  }

  async function isSlotAvailable({ boutiqueId, slotId, visitDate, prismaClient = prisma }) {
    const normalizedDate = startOfDate(ensureFutureOrToday(visitDate, 'Р”Р°С‚Р° РІРёР·РёС‚Р°'));

    const [existingBooking, closedSlot] = await Promise.all([
      prismaClient.booking.findFirst({
        where: {
          visitMode: VisitMode.BOUTIQUE,
          boutiqueId,
          timeSlotId: slotId,
          visitDate: normalizedDate,
          status: {
            in: ACTIVE_BOOKING_STATUSES,
          },
        },
      }),
      prismaClient.slotClosure.findFirst({
        where: {
          boutiqueId,
          timeSlotId: slotId,
          date: normalizedDate,
          isActive: true,
        },
      }),
    ]);

    return !existingBooking && !closedSlot;
  }

  async function createBooking(data) {
    const user = await ensureCanCreateBooking(data.userId);
    const requestType = normalizeRequestType(data.requestType);
    const visitMode = normalizeVisitMode(data.visitMode);
    const wishText = normalizeOptionalText(data.wishText);
    const deliveryAddress = normalizeOptionalText(data.deliveryAddress);

    if (visitMode === VisitMode.DELIVERY && !deliveryAddress) {
      throw new ValidationError('РќР°РїРёС€Рё Р°РґСЂРµСЃ РґРѕСЃС‚Р°РІРєРё.');
    }

    try {
      const booking = await prisma.$transaction(async (tx) => {
        let createdBooking;
        if (visitMode === VisitMode.BOUTIQUE) {
          if (!data.boutiqueId || !data.slotId || !data.visitDate) {
            throw new ValidationError('Р’С‹Р±РµСЂРё Р±СѓС‚РёРє, РґРµРЅСЊ Рё РІСЂРµРјСЏ.');
          }

          const normalizedVisitDate = startOfDate(ensureFutureOrToday(data.visitDate, 'Р”Р°С‚Р° РІРёР·РёС‚Р°'));
          const boutique = await tx.boutique.findFirst({
            where: {
              id: data.boutiqueId,
              isActive: true,
            },
          });

          if (!boutique) {
            throw new NotFoundError('Р­С‚РѕС‚ Р±СѓС‚РёРє СЃРµР№С‡Р°СЃ РЅРµРґРѕСЃС‚СѓРїРµРЅ.');
          }

          const slot = await tx.timeSlot.findFirst({
            where: {
              id: data.slotId,
              boutiqueId: data.boutiqueId,
              isActive: true,
            },
          });

          if (!slot) {
            throw new NotFoundError('Р­С‚Рѕ РІСЂРµРјСЏ СЃРµР№С‡Р°СЃ РЅРµРґРѕСЃС‚СѓРїРЅРѕ.');
          }

          const available = await isSlotAvailable({
            boutiqueId: boutique.id,
            slotId: slot.id,
            visitDate: normalizedVisitDate,
            prismaClient: tx,
          });

          if (!available) {
            throw new ForbiddenError('Р­С‚Рѕ РІСЂРµРјСЏ СѓР¶Рµ Р·Р°РЅСЏС‚Рѕ. Р’С‹Р±РµСЂРё РґСЂСѓРіРѕРµ.');
          }

          const activeSlotKey = buildActiveSlotKey({
            boutiqueId: boutique.id,
            slotId: slot.id,
            visitDate: normalizedVisitDate,
          });

          createdBooking = await tx.booking.create({
            data: {
              publicId: uuidv4(),
              userId: user.id,
              registrationId: user.registration?.id ?? null,
              requestType,
              visitMode,
              status: BookingStatus.SUBMITTED,
              boutiqueId: boutique.id,
              timeSlotId: slot.id,
              activeSlotKey,
              boutiqueAddress: formatBoutiqueAddress(boutique),
              visitDate: normalizedVisitDate,
              slotLabel: slot.label,
              contactPhone: user.registration?.phone ?? user.phone ?? null,
              wishText,
              submittedAt: new Date(),
            },
            include: {
              boutique: true,
              timeSlot: true,
              user: {
                include: {
                  registration: true,
                },
              },
            },
          });
        } else {
          createdBooking = await tx.booking.create({
            data: {
              publicId: uuidv4(),
              userId: user.id,
              registrationId: user.registration?.id ?? null,
              requestType,
              visitMode,
              status: BookingStatus.SUBMITTED,
              deliveryAddress,
              contactPhone: user.registration?.phone ?? user.phone ?? null,
              wishText,
              submittedAt: new Date(),
            },
            include: {
              boutique: true,
              timeSlot: true,
              user: {
                include: {
                  registration: true,
                },
              },
            },
          });
        }

        await tx.auditLog.create({
          data: {
            action: 'user_booking_created',
            actorType: 'USER',
            entityType: 'Booking',
            entityId: createdBooking.id,
            message: buildBookingChangeComment(
              createdBooking,
              'created',
              createdBooking.visitMode === VisitMode.BOUTIQUE
                ? `slot: ${createdBooking.slotLabel ?? 'n/a'}`
                : 'delivery',
            ),
            userId: user.id,
          },
        });

        return createdBooking;
      });

      const sheetsResult = await googleSheets.logBooking({ booking });

      if (!sheetsResult?.ok) {
        serviceLogger.warn(
          {
            bookingId: booking.id,
            userId: booking.userId,
          },
          'Booking was saved locally, but Google Sheets logging failed',
        );
      }

      serviceLogger.info(
        {
          bookingId: booking.id,
          requestType: booking.requestType,
          visitMode: booking.visitMode,
        },
        'Booking created',
      );

      await notifyBoutiqueByEmail(booking);

      return booking;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      if (isUniqueConstraintError(error, 'activeSlotKey')) {
        throw new ForbiddenError('Р­С‚Рѕ РІСЂРµРјСЏ СѓР¶Рµ Р·Р°РЅСЏР»Рё. Р’С‹Р±РµСЂРё РґСЂСѓРіРѕРµ.');
      }

      throw error;
    }
  }

  async function cancelUserBoutiqueBooking(userId, bookingId) {
    const cancelledAt = new Date();

    const booking = await prisma.$transaction(async (tx) => {
      const activeBooking = await requireUserActiveBoutiqueBooking(userId, bookingId, {
        includeUser: true,
        prismaClient: tx,
      });

      const cancelledBooking = await tx.booking.update({
        where: {
          id: activeBooking.id,
        },
        data: {
          status: BookingStatus.CANCELLED,
          cancelledAt,
          activeSlotKey: null,
        },
        include: USER_BOOKING_WITH_USER_INCLUDE,
      });

      await tx.auditLog.create({
        data: {
          action: 'user_booking_cancelled',
          actorType: 'USER',
          entityType: 'Booking',
          entityId: activeBooking.id,
          userId,
          message: `РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ РѕС‚РјРµРЅРёР» Р·Р°РїРёСЃСЊ ${activeBooking.publicId}`,
        },
      });

      return cancelledBooking;
    });

    const sheetsResult = await googleSheets.logBooking({
      booking,
      comment: buildBookingChangeComment(booking, 'user_cancelled_manual'),
    });

    if (!sheetsResult?.ok) {
      serviceLogger.warn(
        {
          bookingId: booking.id,
          userId,
        },
        'Booking was cancelled locally, but Google Sheets logging failed',
      );
    }

    serviceLogger.info(
      {
        bookingId: booking.id,
        cancelledAt,
        userId,
      },
      'User booking cancelled',
    );

    return booking;
  }

  async function rescheduleBoutiqueBooking({ userId, bookingId, slotId, visitDate }) {
    if (!slotId || !visitDate) {
      throw new ValidationError('Р’С‹Р±РµСЂРё РЅРѕРІС‹Р№ РґРµРЅСЊ Рё РІСЂРµРјСЏ.');
    }

    const normalizedVisitDate = startOfDate(ensureFutureOrToday(visitDate, 'Р”Р°С‚Р° РІРёР·РёС‚Р°'));

    try {
      const result = await prisma.$transaction(async (tx) => {
        const activeBooking = await requireUserActiveBoutiqueBooking(userId, bookingId, {
          includeUser: true,
          prismaClient: tx,
        });

        if (!activeBooking.boutiqueId) {
          throw new ValidationError('Р­С‚Сѓ Р·Р°РїРёСЃСЊ РїРѕРєР° РЅРµР»СЊР·СЏ РїРµСЂРµРЅРµСЃС‚Рё.');
        }

        const boutique = await tx.boutique.findFirst({
          where: {
            id: activeBooking.boutiqueId,
            isActive: true,
          },
        });

        if (!boutique) {
          throw new NotFoundError('Р­С‚РѕС‚ Р±СѓС‚РёРє СЃРµР№С‡Р°СЃ РЅРµРґРѕСЃС‚СѓРїРµРЅ.');
        }

        const slot = await tx.timeSlot.findFirst({
          where: {
            id: slotId,
            boutiqueId: boutique.id,
            isActive: true,
          },
        });

        if (!slot) {
          throw new NotFoundError('Р­С‚Рѕ РІСЂРµРјСЏ СЃРµР№С‡Р°СЃ РЅРµРґРѕСЃС‚СѓРїРЅРѕ.');
        }

        const isSameSlot =
          activeBooking.timeSlotId === slot.id &&
          activeBooking.visitDate &&
          dayjs(activeBooking.visitDate).isSame(normalizedVisitDate, 'day');

        if (isSameSlot) {
          throw new ValidationError('Р­С‚Рѕ СѓР¶Рµ РІР°С€Р° С‚РµРєСѓС‰Р°СЏ Р·Р°РїРёСЃСЊ. Р’С‹Р±РµСЂРё РґСЂСѓРіРѕРµ РІСЂРµРјСЏ.');
        }

        const available = await isSlotAvailable({
          boutiqueId: boutique.id,
          slotId: slot.id,
          visitDate: normalizedVisitDate,
          prismaClient: tx,
        });

        if (!available) {
          throw new ForbiddenError('Р­С‚Рѕ РІСЂРµРјСЏ СѓР¶Рµ Р·Р°РЅСЏС‚Рѕ. Р’С‹Р±РµСЂРё РґСЂСѓРіРѕРµ.');
        }

        const submittedAt = new Date();
        const newBooking = await tx.booking.create({
          data: {
            publicId: uuidv4(),
            userId: activeBooking.userId,
            registrationId: activeBooking.registrationId ?? activeBooking.user?.registration?.id ?? null,
            requestType: activeBooking.requestType,
            visitMode: VisitMode.BOUTIQUE,
            status: BookingStatus.SUBMITTED,
            boutiqueId: boutique.id,
            timeSlotId: slot.id,
            activeSlotKey: buildActiveSlotKey({
              boutiqueId: boutique.id,
              slotId: slot.id,
              visitDate: normalizedVisitDate,
            }),
            boutiqueAddress: formatBoutiqueAddress(boutique),
            visitDate: normalizedVisitDate,
            slotLabel: slot.label,
            contactPhone: activeBooking.contactPhone ?? activeBooking.user?.registration?.phone ?? activeBooking.user?.phone ?? null,
            wishText: activeBooking.wishText,
            submittedAt,
          },
          include: USER_BOOKING_WITH_USER_INCLUDE,
        });

        const previousBooking = await tx.booking.update({
          where: {
            id: activeBooking.id,
          },
          data: {
            status: BookingStatus.CANCELLED,
            cancelledAt: submittedAt,
            activeSlotKey: null,
          },
          include: USER_BOOKING_WITH_USER_INCLUDE,
        });

        await tx.auditLog.create({
          data: {
            action: 'user_booking_rescheduled',
            actorType: 'USER',
            entityType: 'Booking',
            entityId: activeBooking.id,
            userId,
            message: `Р—Р°РїРёСЃСЊ ${activeBooking.publicId} Р·Р°РјРµРЅРµРЅР° РЅРѕРІРѕР№ Р·Р°РїРёСЃСЊСЋ ${newBooking.publicId}`,
          },
        });

        return {
          newBooking,
          previousBooking,
        };
      });

      const [previousSheetsResult, newSheetsResult] = await Promise.all([
        googleSheets.logBooking({
          booking: result.previousBooking,
          comment: buildBookingChangeComment(
            result.previousBooking,
            'user_rescheduled_previous',
            result.newBooking.publicId ? `replaced_by: ${result.newBooking.publicId}` : '',
          ),
        }),
        googleSheets.logBooking({
          booking: result.newBooking,
          comment: buildBookingChangeComment(
            result.newBooking,
            'user_rescheduled_new',
            result.previousBooking.publicId ? `replaced_from: ${result.previousBooking.publicId}` : '',
          ),
        }),
      ]);

      if (!previousSheetsResult?.ok || !newSheetsResult?.ok) {
        serviceLogger.warn(
          {
            newBookingId: result.newBooking.id,
            previousBookingId: result.previousBooking.id,
            userId,
          },
          'Booking was rescheduled locally, but Google Sheets logging failed',
        );
      }

      await notifyBoutiqueByEmail(result.newBooking);

      return result;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      if (isUniqueConstraintError(error, 'activeSlotKey')) {
        throw new ForbiddenError('Р­С‚Рѕ РІСЂРµРјСЏ СѓР¶Рµ Р·Р°РЅСЏР»Рё. Р’С‹Р±РµСЂРё РґСЂСѓРіРѕРµ.');
      }

      throw error;
    }
  }

  function normalizeRequestType(requestType) {
    if (!Object.values(BookingRequestType).includes(requestType)) {
      throw new ValidationError('Р’С‹Р±РµСЂРё С‚РёРї Р·Р°СЏРІРєРё.');
    }

    return requestType;
  }

  function normalizeVisitMode(visitMode) {
    if (!Object.values(VisitMode).includes(visitMode)) {
      throw new ValidationError('Р’С‹Р±РµСЂРё С„РѕСЂРјР°С‚.');
    }

    return visitMode;
  }

  async function requireBoutique(boutiqueId, { includeInactive = false } = {}) {
    const boutique = await prisma.boutique.findFirst({
      where: {
        id: boutiqueId,
        ...(includeInactive ? {} : { isActive: true }),
      },
    });

    if (!boutique) {
      throw new NotFoundError('Р‘СѓС‚РёРє РЅРµ РЅР°Р№РґРµРЅ');
    }

    return boutique;
  }

  async function requireTimeSlot(slotId, { includeInactive = false } = {}) {
    const slot = await prisma.timeSlot.findFirst({
      where: {
        id: slotId,
        ...(includeInactive ? {} : { isActive: true }),
      },
      include: {
        boutique: true,
      },
    });

    if (!slot) {
      throw new NotFoundError('РЎР»РѕС‚ РЅРµ РЅР°Р№РґРµРЅ');
    }

    return slot;
  }

  async function requireUser(userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundError('РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ РЅРµ РЅР°Р№РґРµРЅ');
    }

    return user;
  }

  return {
    blockUser,
    cancelUserBoutiqueBooking,
    closeSlot,
    createBooking,
    createBoutique,
    createTimeSlot,
    ensureCanCreateBooking,
    findUserByTelegramId,
    findUserByUsername,
    formatAvailableSlotsList,
    formatBoutiquesList,
    formatTimeSlotsList,
    getAvailableSlotsByDate,
    getAvailableVisitDates,
    getBoutiques,
    getUserVisibleBoutiques,
    getTimeSlots,
    getUserActiveBoutiqueBooking,
    getUserBookingById,
    isSlotAvailable,
    isUserBlocked,
    listBookingsCreatedOnDate,
    listBoutiquesWithSlots,
    listRecentBookings,
    listTodayBookings,
    listUserBookings,
    listUsersForAdmin,
    openSlot,
    removeBoutique,
    removeTimeSlot,
    rescheduleBoutiqueBooking,
    unblockUser,
  };
}

```

