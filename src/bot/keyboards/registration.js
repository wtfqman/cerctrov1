import { Markup } from 'telegraf';

export const REGISTRATION_BUTTONS = Object.freeze({
  BACK: 'Назад',
  CANCEL: 'Отмена',
  CONFIRM: 'Подтвердить',
  LATER: 'Позже',
  RESTART: 'Заполнить заново',
  UPLOAD_PDF: 'Загрузить PDF',
  USE_PROFILE_USERNAME: 'Мой @username',
});

export const REGISTRATION_EDIT_CALLBACKS = Object.freeze({
  OVERVIEW_EDIT: 'registration:edit:overview',
  OVERVIEW_BACK: 'registration:back',
  OVERVIEW_PDF: 'registration:pdf',
  FIELD_PREFIX: 'registration:edit:field:',
  FIELDS_BACK: 'registration:edit:fields:back',
  PDF_BACK: 'registration:pdf:back',
  PROMPT_BACK: 'registration:edit:prompt:back',
});

function buildKeyboard(rows) {
  return Markup.keyboard(rows).resize();
}

function buildInlineKeyboard(rows) {
  return Markup.inlineKeyboard(rows);
}

function callbackButton(text, callbackData) {
  return Markup.button.callback(text, callbackData);
}

export function getRegistrationStepKeyboard({ hasBack = true, hasProfileUsername = false } = {}) {
  const rows = [];

  if (hasProfileUsername) {
    rows.push([REGISTRATION_BUTTONS.USE_PROFILE_USERNAME]);
  }

  rows.push(
    hasBack
      ? [REGISTRATION_BUTTONS.BACK, REGISTRATION_BUTTONS.CANCEL]
      : [REGISTRATION_BUTTONS.CANCEL],
  );

  return buildKeyboard(rows);
}

export function getRegistrationCancelKeyboard() {
  return getRegistrationStepKeyboard({ hasBack: false });
}

export function getUsernameKeyboard(hasProfileUsername) {
  return getRegistrationStepKeyboard({
    hasBack: true,
    hasProfileUsername,
  });
}

export function getRegistrationConfirmKeyboard() {
  return buildKeyboard([
    [REGISTRATION_BUTTONS.CONFIRM],
    [REGISTRATION_BUTTONS.RESTART],
    [REGISTRATION_BUTTONS.BACK, REGISTRATION_BUTTONS.CANCEL],
  ]);
}

export function getRegistrationPdfChoiceKeyboard() {
  return buildKeyboard([
    [REGISTRATION_BUTTONS.UPLOAD_PDF],
    [REGISTRATION_BUTTONS.LATER],
  ]);
}

export function getRegistrationPdfUploadKeyboard() {
  return buildKeyboard([
    [REGISTRATION_BUTTONS.LATER],
  ]);
}

export function getRegistrationOverviewKeyboard({ hasUserPdf = false } = {}) {
  return buildInlineKeyboard([
    [callbackButton('Изменить данные', REGISTRATION_EDIT_CALLBACKS.OVERVIEW_EDIT)],
    [callbackButton(hasUserPdf ? 'Заменить PDF' : 'Загрузить PDF', REGISTRATION_EDIT_CALLBACKS.OVERVIEW_PDF)],
    [callbackButton('Назад', REGISTRATION_EDIT_CALLBACKS.OVERVIEW_BACK)],
  ]);
}

export function getRegistrationEditFieldsKeyboard(fields) {
  return buildInlineKeyboard([
    ...fields.map((field) => [callbackButton(field.label, `${REGISTRATION_EDIT_CALLBACKS.FIELD_PREFIX}${field.key}`)]),
    [callbackButton('Назад', REGISTRATION_EDIT_CALLBACKS.FIELDS_BACK)],
  ]);
}

export function getRegistrationEditPromptKeyboard() {
  return buildInlineKeyboard([
    [callbackButton('Назад', REGISTRATION_EDIT_CALLBACKS.PROMPT_BACK)],
  ]);
}

export function getRegistrationPdfPromptKeyboard() {
  return buildInlineKeyboard([
    [callbackButton('Назад', REGISTRATION_EDIT_CALLBACKS.PDF_BACK)],
  ]);
}
