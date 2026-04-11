# Inline Keyboard UX Fix

?????? ?????? ?????????? ??????.

[src/bot/utils/inlineKeyboard.js](/C:/Users/PC/OneDrive/Desktop/cerca trova bot/src/bot/utils/inlineKeyboard.js)
```js
const CLEARED_INLINE_KEYBOARD = Object.freeze({
  inline_keyboard: [],
});

function getTelegramErrorDescription(error) {
  return error?.description ?? error?.response?.description ?? '';
}

export function isMessageNotModifiedError(error) {
  return getTelegramErrorDescription(error) === 'Bad Request: message is not modified';
}

export function isUnavailableMessageError(error) {
  const description = getTelegramErrorDescription(error);

  return (
    description === 'Bad Request: message to edit not found' ||
    description === "Bad Request: message can't be edited"
  );
}

export function getClearedInlineKeyboard() {
  return CLEARED_INLINE_KEYBOARD;
}

export function normalizeInlineMarkup(markup = undefined) {
  const extra = markup ? { ...markup } : {};
  extra.reply_markup = markup?.reply_markup ?? getClearedInlineKeyboard();
  return extra;
}

export async function safelyRemoveInlineKeyboard(ctx) {
  if (!ctx.callbackQuery?.message) {
    return false;
  }

  try {
    await ctx.editMessageReplyMarkup(getClearedInlineKeyboard());
    return true;
  } catch (error) {
    if (isMessageNotModifiedError(error) || isUnavailableMessageError(error)) {
      return false;
    }

    throw error;
  }
}
```

[src/bot/scenes/bookingScene.js](/C:/Users/PC/OneDrive/Desktop/cerca trova bot/src/bot/scenes/bookingScene.js)
```js
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

[src/bot/scenes/bookingRescheduleScene.js](/C:/Users/PC/OneDrive/Desktop/cerca trova bot/src/bot/scenes/bookingRescheduleScene.js)
```js
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
  const latestBooking = await ctx.state.services.bookingService.getUserBookingById(
    state.userId,
    state.bookingId,
  );

  await renderSceneMessage(
    ctx,
    buildBookingCardText(latestBooking ?? state.booking, notice),
    getBookingKeyboard(latestBooking ?? state.booking),
  );
  await ctx.scene.leave();
}

export function createBookingRescheduleScene() {
  return new Scenes.WizardScene(
    BOOKING_RESCHEDULE_SCENE_ID,
    async (ctx) => {
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
          const latestBooking = await ctx.state.services.bookingService.getUserBookingById(
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

[src/bot/handlers/menuHandlers.js](/C:/Users/PC/OneDrive/Desktop/cerca trova bot/src/bot/handlers/menuHandlers.js)
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
import { isMessageNotModifiedError, normalizeInlineMarkup } from '../utils/inlineKeyboard.js';

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

[src/bot/scenes/adminShared.js](/C:/Users/PC/OneDrive/Desktop/cerca trova bot/src/bot/scenes/adminShared.js)
```js
import { BOT_TEXTS } from '../../utils/constants.js';
import { ForbiddenError } from '../../utils/errors.js';
import { formatAdminWelcome } from '../../utils/formatters.js';
import { ADMIN_CALLBACKS, getAdminMenuKeyboard } from '../keyboards/admin.js';
import {
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

function getAdminPanelTarget(ctx) {
  return getCallbackPanel(ctx) ?? getStoredPanel(ctx);
}

function clearStoredPanel(ctx) {
  if (!ctx.session?.adminPanel) {
    return;
  }

  delete ctx.session.adminPanel;
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

export async function renderAdminPanel(ctx, text, markup = undefined) {
  const target = getAdminPanelTarget(ctx);
  const extra = normalizeInlineMarkup(markup);

  if (target) {
    rememberAdminPanel(ctx, target);

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
        clearStoredPanel(ctx);
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
        } catch (replyMarkupError) {
          if (isUnavailableMessageError(replyMarkupError)) {
            clearStoredPanel(ctx);
          } else if (!isMessageNotModifiedError(replyMarkupError)) {
            throw replyMarkupError;
          }
        }

        if (ctx.session?.adminPanel) {
          return target;
        }
      }
    }
  }

  const sentMessage = await ctx.reply(text, extra);

  rememberAdminPanel(ctx, {
    chatId: sentMessage.chat.id,
    messageId: sentMessage.message_id,
  });

  return {
    chatId: sentMessage.chat.id,
    messageId: sentMessage.message_id,
  };
}

export async function showAdminMenu(ctx, admin, text = null) {
  await renderAdminPanel(
    ctx,
    text ?? formatAdminWelcome(admin),
    getAdminMenuKeyboard({
      admin,
      hasPermission: ctx.state.services.adminService.hasPermission,
    }),
  );
}

export async function leaveAdminScene(ctx, admin, message = 'Р”РµР№СЃС‚РІРёРµ РѕС‚РјРµРЅРµРЅРѕ.') {
  await ctx.scene.leave();
  await showAdminMenu(ctx, admin, message);
}

export async function maybeLeaveAdminScene(ctx, admin, message = 'Р”РµР№СЃС‚РІРёРµ РѕС‚РјРµРЅРµРЅРѕ.') {
  const text = getAdminText(ctx);
  const callbackData = getAdminCallbackData(ctx);

  if (
    text === ADMIN_TEXT_CANCEL ||
    text === ADMIN_TEXT_BACK ||
    text === '/cancel' ||
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


