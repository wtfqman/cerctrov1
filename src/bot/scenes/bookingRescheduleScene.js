import { BookingStatus, VisitMode } from '@prisma/client';
import { Scenes } from 'telegraf';

import { BOT_TEXTS } from '../../utils/constants.js';
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
    'Перезапись',
    `Бутик: ${getUserVisibleBoutiqueLabel(booking, 'Бутик')}`,
    `Сейчас: ${booking.visitDate ? formatDate(booking.visitDate, 'DD.MM.YYYY') : 'Не указано'} / ${formatSlotLabelForUser(booking.slotLabel) || 'Не указано'}`,
  ].join('\n');
}

function buildDateStepText(booking, notice = '') {
  return [
    notice,
    buildBookingReferenceText(booking),
    '',
    'Выбери новый день',
  ]
    .filter(Boolean)
    .join('\n');
}

function buildNoDatesText(booking, notice = '') {
  return [
    notice,
    buildBookingReferenceText(booking),
    '',
    BOT_TEXTS.BOOKING_NO_AVAILABLE_DAYS,
  ]
    .filter(Boolean)
    .join('\n');
}

function buildSlotStepText(booking, visitDate, notice = '') {
  return [
    notice,
    buildBookingReferenceText(booking),
    `Новый день: ${formatDate(visitDate, 'DD.MM.YYYY')}`,
    '',
    'Выбери новое время',
  ]
    .filter(Boolean)
    .join('\n');
}

function buildConfirmText(booking, state) {
  return [
    buildBookingReferenceText(booking),
    '',
    `Новый день: ${formatDate(state.visitDate, 'DD.MM.YYYY')}`,
    `Новое время: ${formatSlotLabelForUser(state.selectedSlot.label)}`,
    '',
    'Текущая запись будет заменена новой. Продолжить?',
  ].join('\n');
}

function buildSuccessText(booking) {
  return [
    'Готово, запись обновлена ✨',
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
  const availableDates = await ctx.state.services.bookingService.getAvailableVisitDatesForBoutique(
    state.booking.boutiqueId,
  );

  state.dateOptions = availableDates.map((value) => ({
    code: formatDate(value, 'YYYY-MM-DD'),
    kind: USER_UI_OPTION_KINDS.DATE,
    label: formatDate(value, 'DD.MM dd'),
    value,
  }));

  await renderSceneMessage(
    ctx,
    state.dateOptions.length === 0
      ? buildNoDatesText(state.booking, notice)
      : buildDateStepText(state.booking, notice),
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
    await promptDateStep(ctx, notice || 'На этот день свободных слотов нет.');
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
    await renderSceneMessage(ctx, notice || 'Запись больше не доступна.');
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
        await leaveToMainMenu(ctx, 'Запись не найдена.');
        return undefined;
      }

      const isBlocked = await ctx.state.services.bookingService.isUserBlocked(user.id);

      if (isBlocked) {
        await leaveToMainMenu(ctx, 'Сейчас доступ временно ограничен.');
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
        await answerBookingCallback(ctx, 'Выбери день ниже.');
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
        await answerBookingCallback(ctx, 'Выбери время ниже.');
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
        await answerBookingCallback(ctx, 'Выбери кнопку ниже.');
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
