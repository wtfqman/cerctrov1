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
import {
  isMessageNotModifiedError,
  isUnavailableMessageError,
  normalizeInlineMarkup,
} from '../utils/inlineKeyboard.js';

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

function buildStepText(text, notice = '') {
  return [notice, text]
    .filter(Boolean)
    .join('\n\n');
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

async function renderBookingPanel(ctx, text, markup = undefined) {
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

async function clearBookingPanelKeyboard(ctx) {
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
    if (isUnavailableMessageError(error)) {
      delete getSceneState(ctx).panel;
      return;
    }

    if (isMessageNotModifiedError(error)) {
      return;
    }

    throw error;
  }
}

function buildBlockedMessage(user, supportContact) {
  const lines = [BOT_TEXTS.BLOCKED];

  if (user.blockedReason) {
    lines.push(`Причина: ${user.blockedReason}`);
  }

  lines.push(`Если нужна помощь: ${supportContact}`);

  return lines.join('\n');
}

async function leaveWithMainMenu(ctx, message) {
  await clearBookingPanelKeyboard(ctx);
  await ctx.reply(message, getMainMenuKeyboard());
  await ctx.scene.leave();
}

async function cancelFlow(ctx) {
  await leaveWithMainMenu(ctx, 'Заявку можно оформить позже.');
}

function getRequestTypeLabel(requestType) {
  return {
    [BookingRequestType.RETURN]: 'Возврат',
    [BookingRequestType.PICKUP]: 'Забор',
    [BookingRequestType.RETURN_PICKUP]: 'Возврат + Забор',
  }[requestType] ?? 'Заявка';
}

function buildBoutiqueConfirmationMessage(state, notice = '') {
  return [
    notice,
    'Проверь запись:',
    '',
    `Тип: ${getRequestTypeLabel(state.requestType)}`,
    `Бутик: ${getUserVisibleBoutiqueLabel(state.boutique, 'Бутик')}`,
    `Дата: ${formatDate(state.visitDate, 'DD.MM.YYYY')}`,
    `Время: ${formatSlotLabelForUser(state.selectedSlot.label)}`,
    '',
    'Подтвердить?',
  ]
    .filter(Boolean)
    .join('\n');
}

function buildDeliveryConfirmationMessage(state, notice = '') {
  const lines = [
    notice,
    'Проверь заявку:',
    '',
    `Тип: ${getRequestTypeLabel(state.requestType)}`,
    'Формат: Доставка',
    `Адрес: ${state.deliveryAddress}`,
  ];

  if (state.wishText) {
    lines.push(`Пожелания: ${state.wishText}`);
  }

  lines.push('', 'Подтвердить?');

  return lines
    .filter(Boolean)
    .join('\n');
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
    await leaveWithMainMenu(ctx, 'Сначала нажми «Регистрация».');
    return null;
  }

  return user;
}

async function promptRequestTypeStep(ctx, notice = '') {
  await renderBookingPanel(
    ctx,
    buildStepText('Выбери вариант', notice),
    getRequestTypeKeyboard(),
  );
}

async function promptWishStep(ctx, notice = '') {
  await renderBookingPanel(
    ctx,
    buildStepText('Есть пожелания?\nМожно написать или пропустить.', notice),
    getWishKeyboard(),
  );
}

async function promptVisitModeStep(ctx, notice = '') {
  await renderBookingPanel(
    ctx,
    buildStepText('Выбери формат', notice),
    getVisitModeKeyboard(),
  );
}

async function promptBoutiqueStep(ctx, notice = '') {
  const boutiques = await ctx.state.services.bookingService.getUserVisibleBoutiques();

  if (boutiques.length === 0) {
    await leaveWithMainMenu(ctx, 'Сейчас запись в бутик недоступна.');
    return false;
  }

  const state = getSceneState(ctx);
  state.boutiqueOptions = boutiques.map((boutique) => ({
    boutique,
    id: boutique.id,
    kind: USER_UI_OPTION_KINDS.BOUTIQUE,
    label: getUserVisibleBoutiqueLabel(boutique, 'Бутик'),
  }));

  if (state.boutiqueOptions.length === 0) {
    await leaveWithMainMenu(ctx, 'Сейчас запись в бутик недоступна.');
    return false;
  }

  await renderBookingPanel(
    ctx,
    buildStepText('Выбери бутик', notice),
    getBoutiquesKeyboard(state.boutiqueOptions),
  );

  return true;
}

async function promptDateStep(ctx, notice = '') {
  const state = getSceneState(ctx);
  const dateOptions = ctx.state.services.bookingService.getAvailableVisitDates().map((value) => ({
    code: formatDate(value, 'YYYY-MM-DD'),
    kind: USER_UI_OPTION_KINDS.DATE,
    label: formatDate(value, 'DD.MM dd'),
    value,
  }));

  state.dateOptions = dateOptions;

  if (dateOptions.length === 0) {
    await leaveWithMainMenu(ctx, 'Сейчас нет доступных дат.');
    return false;
  }

  await renderBookingPanel(
    ctx,
    buildStepText('Выбери день', notice),
    getDateKeyboard(dateOptions),
  );

  return true;
}

async function promptSlotStep(ctx, notice = '') {
  const state = getSceneState(ctx);
  const slots = await ctx.state.services.bookingService.getAvailableSlotsByDate(state.boutique.id, state.visitDate);
  const availableSlots = slots.filter((item) => item.isAvailable);

  if (availableSlots.length === 0) {
    await promptDateStep(ctx, notice || 'На этот день свободных слотов нет.');
    ctx.wizard.selectStep(5);
    return false;
  }

  state.slotOptions = availableSlots.map((item) => ({
    id: item.slot.id,
    kind: USER_UI_OPTION_KINDS.SLOT,
    label: formatSlotLabelForUser(item.slot.label),
    slot: item.slot,
  }));

  await renderBookingPanel(
    ctx,
    buildStepText('Выбери время', notice),
    getSlotKeyboard(state.slotOptions),
  );

  return true;
}

async function promptDeliveryAddressStep(ctx, notice = '') {
  await clearBookingPanelKeyboard(ctx);
  await ctx.reply(
    buildStepText('Напиши адрес СДЭК', notice),
    getBookingTextStepKeyboard(),
  );
}

async function finalizeBooking(ctx, payload) {
  await ctx.state.services.bookingService.createBooking(payload);
  await leaveWithMainMenu(
    ctx,
    payload.visitMode === VisitMode.BOUTIQUE
      ? 'Готово, ты записан(а) ✨'
      : 'Готово, заявка отправлена ✨',
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

      await promptRequestTypeStep(ctx);
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
        await answerBookingCallback(ctx, 'Выбери вариант ниже.');
        await promptRequestTypeStep(ctx);
        return undefined;
      }

      const state = getSceneState(ctx);
      state.requestType = requestType;

      await answerBookingCallback(ctx);
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
        await promptRequestTypeStep(ctx);
        ctx.wizard.selectStep(1);
        return undefined;
      }

      const callbackData = getCallbackData(ctx);

      if (callbackData === BOOKING_CALLBACKS.SKIP_WISH) {
        await answerBookingCallback(ctx);
        getSceneState(ctx).wishText = null;
        await promptVisitModeStep(ctx);
        return ctx.wizard.next();
      }

      const wishText = getMessageText(ctx);

      if (!wishText) {
        await answerBookingCallback(ctx);
        await promptWishStep(ctx, 'Можно написать пожелание или нажать «Пропустить».');
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
        await promptWishStep(ctx);
        ctx.wizard.selectStep(2);
        return undefined;
      }

      const visitMode = VISIT_MODE_BY_CALLBACK[getCallbackData(ctx)];

      if (!visitMode) {
        await answerBookingCallback(ctx, 'Выбери формат ниже.');
        await promptVisitModeStep(ctx);
        return undefined;
      }

      const state = getSceneState(ctx);
      state.visitMode = visitMode;

      await answerBookingCallback(ctx);

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
        await promptVisitModeStep(ctx);
        ctx.wizard.selectStep(3);
        return undefined;
      }

      const state = getSceneState(ctx);
      const boutiqueId = extractCallbackValue(ctx, BOOKING_CALLBACKS.BOUTIQUE_PREFIX);
      const selected = state.boutiqueOptions?.find((item) => item.id === boutiqueId);

      if (!selected) {
        await answerBookingCallback(ctx, 'Выбери бутик ниже.');
        await promptBoutiqueStep(ctx);
        return undefined;
      }

      state.boutique = selected.boutique;

      await answerBookingCallback(ctx);
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
        await answerBookingCallback(ctx, 'Выбери день ниже.');
        await promptDateStep(ctx);
        return undefined;
      }

      state.visitDate = selectedDate.value;

      await answerBookingCallback(ctx);
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
        await answerBookingCallback(ctx, 'Выбери время ниже.');
        await promptSlotStep(ctx);
        return undefined;
      }

      state.selectedSlot = selectedSlot.slot;

      await answerBookingCallback(ctx);
      await renderBookingPanel(
        ctx,
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
        const prompted = await promptSlotStep(ctx);

        if (prompted) {
          ctx.wizard.selectStep(6);
        }

        return undefined;
      }

      if (getCallbackData(ctx) !== BOOKING_CALLBACKS.CONFIRM) {
        await answerBookingCallback(ctx, 'Выбери кнопку ниже.');
        await renderBookingPanel(
          ctx,
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
          const prompted = await promptSlotStep(ctx, error.message);

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

      await renderBookingPanel(
        ctx,
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
        await promptDeliveryAddressStep(ctx);
        ctx.wizard.selectStep(8);
        return undefined;
      }

      if (getCallbackData(ctx) !== BOOKING_CALLBACKS.CONFIRM) {
        await answerBookingCallback(ctx, 'Выбери кнопку ниже.');
        await renderBookingPanel(
          ctx,
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
          await renderBookingPanel(
            ctx,
            buildDeliveryConfirmationMessage(state, error.message),
            getBookingConfirmKeyboard(),
          );
          return undefined;
        }

        throw error;
      }

      return undefined;
    },
  );
}
