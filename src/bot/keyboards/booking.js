import { Markup } from 'telegraf';
import { isDisallowedUserBoutiqueLabel } from '../../utils/boutiques.js';

export const BOOKING_WIZARD_BUTTONS = Object.freeze({
  BACK: 'Назад',
  CANCEL: 'Отмена',
  CONFIRM: 'Подтвердить',
});

export const BOOKING_CALLBACKS = Object.freeze({
  BACK: 'booking:back',
  CANCEL: 'booking:cancel',
  CONFIRM: 'booking:confirm',
  PDF_REQUIRED_BACK: 'booking:pdf_required:back',
  PDF_REQUIRED_UPLOAD: 'booking:pdf_required:upload',
  MODE_BOUTIQUE: 'booking:mode:boutique',
  MODE_DELIVERY: 'booking:mode:delivery',
  REQUEST_PICKUP: 'booking:request:pickup',
  REQUEST_RETURN: 'booking:request:return',
  REQUEST_RETURN_PICKUP: 'booking:request:return_pickup',
  SKIP_WISH: 'booking:wish:skip',
  BOUTIQUE_PREFIX: 'booking:boutique:',
  DATE_PREFIX: 'booking:date:',
  SLOT_PREFIX: 'booking:slot:',
  USER_CANCEL_PREFIX: 'booking:user:cancel:',
  USER_CANCEL_CONFIRM_PREFIX: 'booking:user:cancel:confirm:',
  USER_CANCEL_BACK_PREFIX: 'booking:user:cancel:back:',
  USER_RESCHEDULE_PREFIX: 'booking:user:reschedule:',
  USER_RESCHEDULE_CONTINUE_PREFIX: 'booking:user:reschedule:continue:',
  USER_RESCHEDULE_BACK_PREFIX: 'booking:user:reschedule:back:',
  RESCHEDULE_DATE_PREFIX: 'booking:reschedule:date:',
  RESCHEDULE_SLOT_PREFIX: 'booking:reschedule:slot:',
  RESCHEDULE_CONFIRM: 'booking:reschedule:confirm',
  RESCHEDULE_BACK: 'booking:reschedule:back',
  RESCHEDULE_CANCEL: 'booking:reschedule:cancel',
});

export const USER_UI_OPTION_KINDS = Object.freeze({
  BOUTIQUE: 'boutique',
  DATE: 'date',
  SLOT: 'slot',
});

function buildReplyKeyboard(rows) {
  return Markup.keyboard(rows).resize();
}

function buildInlineKeyboard(rows) {
  return Markup.inlineKeyboard(rows);
}

function callbackButton(text, callbackData) {
  return Markup.button.callback(text, callbackData);
}

function hasText(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function sanitizeUserUiOptions(options, kind) {
  const normalizedOptions = Array.isArray(options) ? options : [];

  return normalizedOptions.filter((option) => {
    if (option?.kind !== kind || !hasText(option.label)) {
      return false;
    }

    if (kind === USER_UI_OPTION_KINDS.BOUTIQUE) {
      return hasText(option.id) && !isDisallowedUserBoutiqueLabel(option.label);
    }

    if (kind === USER_UI_OPTION_KINDS.DATE) {
      return hasText(option.code);
    }

    if (kind === USER_UI_OPTION_KINDS.SLOT) {
      return hasText(option.id);
    }

    return false;
  });
}

export function getBookingTextStepKeyboard({ includeBack = true } = {}) {
  const rows = [];
  const actions = [];

  if (includeBack) {
    actions.push(BOOKING_WIZARD_BUTTONS.BACK);
  }

  actions.push(BOOKING_WIZARD_BUTTONS.CANCEL);
  rows.push(actions);

  return buildReplyKeyboard(rows);
}

export function getRequestTypeKeyboard() {
  return buildInlineKeyboard([
    [callbackButton('Возврат', BOOKING_CALLBACKS.REQUEST_RETURN)],
    [callbackButton('Забор', BOOKING_CALLBACKS.REQUEST_PICKUP)],
    [callbackButton('Возврат + Забор', BOOKING_CALLBACKS.REQUEST_RETURN_PICKUP)],
    [callbackButton('Отмена', BOOKING_CALLBACKS.CANCEL)],
  ]);
}

export function getWishKeyboard() {
  return buildInlineKeyboard([
    [callbackButton('Пропустить', BOOKING_CALLBACKS.SKIP_WISH)],
    [
      callbackButton(BOOKING_WIZARD_BUTTONS.BACK, BOOKING_CALLBACKS.BACK),
      callbackButton(BOOKING_WIZARD_BUTTONS.CANCEL, BOOKING_CALLBACKS.CANCEL),
    ],
  ]);
}

export function getVisitModeKeyboard() {
  return buildInlineKeyboard([
    [callbackButton('🏬 Бутик', BOOKING_CALLBACKS.MODE_BOUTIQUE)],
    [callbackButton('🚚 Доставка', BOOKING_CALLBACKS.MODE_DELIVERY)],
    [
      callbackButton(BOOKING_WIZARD_BUTTONS.BACK, BOOKING_CALLBACKS.BACK),
      callbackButton(BOOKING_WIZARD_BUTTONS.CANCEL, BOOKING_CALLBACKS.CANCEL),
    ],
  ]);
}

export function getBoutiquesKeyboard(options) {
  const sanitizedOptions = sanitizeUserUiOptions(options, USER_UI_OPTION_KINDS.BOUTIQUE);

  return buildInlineKeyboard([
    ...sanitizedOptions.map((option) => [callbackButton(option.label, `${BOOKING_CALLBACKS.BOUTIQUE_PREFIX}${option.id}`)]),
    [
      callbackButton(BOOKING_WIZARD_BUTTONS.BACK, BOOKING_CALLBACKS.BACK),
      callbackButton(BOOKING_WIZARD_BUTTONS.CANCEL, BOOKING_CALLBACKS.CANCEL),
    ],
  ]);
}

export function getDateKeyboard(options) {
  const sanitizedOptions = sanitizeUserUiOptions(options, USER_UI_OPTION_KINDS.DATE);
  const rows = [];

  for (let index = 0; index < sanitizedOptions.length; index += 2) {
    rows.push(
      sanitizedOptions.slice(index, index + 2).map((option) => (
        callbackButton(option.label, `${BOOKING_CALLBACKS.DATE_PREFIX}${option.code}`)
      )),
    );
  }

  rows.push([
    callbackButton(BOOKING_WIZARD_BUTTONS.BACK, BOOKING_CALLBACKS.BACK),
    callbackButton(BOOKING_WIZARD_BUTTONS.CANCEL, BOOKING_CALLBACKS.CANCEL),
  ]);

  return buildInlineKeyboard(rows);
}

export function getSlotKeyboard(options) {
  const sanitizedOptions = sanitizeUserUiOptions(options, USER_UI_OPTION_KINDS.SLOT);

  return buildInlineKeyboard([
    ...sanitizedOptions.map((option) => [callbackButton(option.label, `${BOOKING_CALLBACKS.SLOT_PREFIX}${option.id}`)]),
    [
      callbackButton(BOOKING_WIZARD_BUTTONS.BACK, BOOKING_CALLBACKS.BACK),
      callbackButton(BOOKING_WIZARD_BUTTONS.CANCEL, BOOKING_CALLBACKS.CANCEL),
    ],
  ]);
}

export function getBookingConfirmKeyboard() {
  return buildInlineKeyboard([
    [callbackButton(BOOKING_WIZARD_BUTTONS.CONFIRM, BOOKING_CALLBACKS.CONFIRM)],
    [
      callbackButton(BOOKING_WIZARD_BUTTONS.BACK, BOOKING_CALLBACKS.BACK),
      callbackButton(BOOKING_WIZARD_BUTTONS.CANCEL, BOOKING_CALLBACKS.CANCEL),
    ],
  ]);
}

export function getBookingPdfRequiredKeyboard() {
  return buildInlineKeyboard([
    [callbackButton('Загрузить PDF', BOOKING_CALLBACKS.PDF_REQUIRED_UPLOAD)],
    [callbackButton('Назад', BOOKING_CALLBACKS.PDF_REQUIRED_BACK)],
  ]);
}

export function getUserBoutiqueBookingActionsKeyboard(bookingId) {
  return buildInlineKeyboard([
    [callbackButton('Перезаписаться', `${BOOKING_CALLBACKS.USER_RESCHEDULE_PREFIX}${bookingId}`)],
    [callbackButton('Отменить', `${BOOKING_CALLBACKS.USER_CANCEL_PREFIX}${bookingId}`)],
  ]);
}

export function getUserBookingCancelConfirmKeyboard(bookingId) {
  return buildInlineKeyboard([
    [callbackButton('Да, отменить', `${BOOKING_CALLBACKS.USER_CANCEL_CONFIRM_PREFIX}${bookingId}`)],
    [callbackButton('Назад', `${BOOKING_CALLBACKS.USER_CANCEL_BACK_PREFIX}${bookingId}`)],
  ]);
}

export function getUserBookingReschedulePromptKeyboard(bookingId) {
  return buildInlineKeyboard([
    [callbackButton('Продолжить', `${BOOKING_CALLBACKS.USER_RESCHEDULE_CONTINUE_PREFIX}${bookingId}`)],
    [callbackButton('Назад', `${BOOKING_CALLBACKS.USER_RESCHEDULE_BACK_PREFIX}${bookingId}`)],
  ]);
}

export function getBookingRescheduleDateKeyboard(options) {
  const sanitizedOptions = sanitizeUserUiOptions(options, USER_UI_OPTION_KINDS.DATE);
  const rows = [];

  for (let index = 0; index < sanitizedOptions.length; index += 2) {
    rows.push(
      sanitizedOptions.slice(index, index + 2).map((option) => (
        callbackButton(option.label, `${BOOKING_CALLBACKS.RESCHEDULE_DATE_PREFIX}${option.code}`)
      )),
    );
  }

  rows.push([
    callbackButton('Назад', BOOKING_CALLBACKS.RESCHEDULE_BACK),
    callbackButton('Отмена', BOOKING_CALLBACKS.RESCHEDULE_CANCEL),
  ]);

  return buildInlineKeyboard(rows);
}

export function getBookingRescheduleSlotKeyboard(options) {
  const sanitizedOptions = sanitizeUserUiOptions(options, USER_UI_OPTION_KINDS.SLOT);

  return buildInlineKeyboard([
    ...sanitizedOptions.map((option) => [callbackButton(option.label, `${BOOKING_CALLBACKS.RESCHEDULE_SLOT_PREFIX}${option.id}`)]),
    [
      callbackButton('Назад', BOOKING_CALLBACKS.RESCHEDULE_BACK),
      callbackButton('Отмена', BOOKING_CALLBACKS.RESCHEDULE_CANCEL),
    ],
  ]);
}

export function getBookingRescheduleConfirmKeyboard() {
  return buildInlineKeyboard([
    [callbackButton('Подтвердить', BOOKING_CALLBACKS.RESCHEDULE_CONFIRM)],
    [
      callbackButton('Назад', BOOKING_CALLBACKS.RESCHEDULE_BACK),
      callbackButton('Отмена', BOOKING_CALLBACKS.RESCHEDULE_CANCEL),
    ],
  ]);
}
