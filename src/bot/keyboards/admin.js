import { Markup } from 'telegraf';

import { ADMIN_PERMISSIONS } from '../../utils/constants.js';

export const ADMIN_CALLBACKS = Object.freeze({
  MENU: 'admin:menu',
  REFRESH: 'admin:refresh',
  BOOKINGS_RECENT: 'admin:bookings:recent',
  BOOKINGS_TODAY: 'admin:bookings:today',
  BOOKING_VIEW_PREFIX: 'admin:booking:view:',
  BOOKING_PDF_PREFIX: 'admin:booking:pdf:',
  DEBTORS: 'admin:debtors',
  SLOT_CLOSE: 'admin:scene:slot:close',
  SLOT_OPEN: 'admin:scene:slot:open',
  USERS_MENU: 'admin:users:menu',
  USER_BLOCK: 'admin:scene:user:block',
  USER_UNBLOCK: 'admin:scene:user:unblock',
  ADMINS_MENU: 'admin:admins:menu',
  PDF_UPLOAD: 'admin:pdf:upload',
  EXPORT_DATA: 'admin:export:data',
  BOUTIQUES_MENU: 'admin:boutiques:menu',
  BOUTIQUE_ADD: 'admin:scene:boutique:add',
  BOUTIQUE_REMOVE: 'admin:scene:boutique:remove',
  TIME_SLOTS_MENU: 'admin:timeslots:menu',
  TIME_SLOT_ADD: 'admin:scene:timeslot:add',
  TIME_SLOT_REMOVE: 'admin:scene:timeslot:remove',
  SCENE_CANCEL: 'admin:scene:cancel',
  SCENE_SKIP: 'admin:scene:skip',
  SCENE_CONFIRM: 'admin:scene:confirm',
});

function chunkButtons(buttons, columns = 1) {
  const rows = [];

  for (let index = 0; index < buttons.length; index += columns) {
    rows.push(buttons.slice(index, index + columns));
  }

  return rows;
}

function menuButton(text, callbackData) {
  return Markup.button.callback(text, callbackData);
}

export function buildAdminBookingViewCallback(listType, bookingId) {
  return `${ADMIN_CALLBACKS.BOOKING_VIEW_PREFIX}${listType}:${bookingId}`;
}

export function buildAdminBookingPdfCallback(bookingId) {
  return `${ADMIN_CALLBACKS.BOOKING_PDF_PREFIX}${bookingId}`;
}

export function getAdminMenuKeyboard({ admin, hasPermission, isRootAdmin }) {
  const rows = [];

  if (hasPermission(admin, ADMIN_PERMISSIONS.VIEW_BOOKINGS)) {
    rows.push([
      menuButton('Последние заявки', ADMIN_CALLBACKS.BOOKINGS_RECENT),
      menuButton('Заявки за сегодня', ADMIN_CALLBACKS.BOOKINGS_TODAY),
    ]);
  }

  if (hasPermission(admin, ADMIN_PERMISSIONS.MANAGE_SLOTS)) {
    rows.push([
      menuButton('Закрыть слот', ADMIN_CALLBACKS.SLOT_CLOSE),
      menuButton('Открыть слот', ADMIN_CALLBACKS.SLOT_OPEN),
    ]);
  }

  if (hasPermission(admin, ADMIN_PERMISSIONS.VIEW_DEBTORS)) {
    rows.push([menuButton('Должники', ADMIN_CALLBACKS.DEBTORS)]);
  }

  if (hasPermission(admin, ADMIN_PERMISSIONS.EXPORT_DATA)) {
    rows.push([menuButton('Выгрузка', ADMIN_CALLBACKS.EXPORT_DATA)]);
  }

  if (hasPermission(admin, ADMIN_PERMISSIONS.MANAGE_PDFS)) {
    rows.push([menuButton('Шаблон PDF', ADMIN_CALLBACKS.PDF_UPLOAD)]);
  }

  if (hasPermission(admin, ADMIN_PERMISSIONS.MANAGE_USERS)) {
    rows.push([menuButton('Пользователи', ADMIN_CALLBACKS.USERS_MENU)]);
  }

  if (hasPermission(admin, ADMIN_PERMISSIONS.MANAGE_BOUTIQUES)) {
    rows.push([menuButton('Бутики', ADMIN_CALLBACKS.BOUTIQUES_MENU)]);
  }

  if (hasPermission(admin, ADMIN_PERMISSIONS.MANAGE_TIME_SLOTS)) {
    rows.push([menuButton('Слоты', ADMIN_CALLBACKS.TIME_SLOTS_MENU)]);
  }

  if (isRootAdmin?.(admin)) {
    rows.push([menuButton('Админы', ADMIN_CALLBACKS.ADMINS_MENU)]);
  }

  return Markup.inlineKeyboard(rows);
}

export function getAdminOptionKeyboard(
  options,
  { columns = 1, cancelCallbackData = ADMIN_CALLBACKS.SCENE_CANCEL, cancelText = 'Назад' } = {},
) {
  const buttons = options.map((option) => menuButton(option.text, option.callbackData));
  const rows = chunkButtons(buttons, columns);

  rows.push([menuButton(cancelText, cancelCallbackData)]);

  return Markup.inlineKeyboard(rows);
}

export function getAdminBackKeyboard(
  callbackData = ADMIN_CALLBACKS.MENU,
  buttonText = 'Назад',
) {
  return Markup.inlineKeyboard([[menuButton(buttonText, callbackData)]]);
}

export function getAdminBookingListKeyboard(
  options,
  { backCallbackData = ADMIN_CALLBACKS.MENU, backText = 'Назад' } = {},
) {
  const rows = options.map((option) => [menuButton(option.text, option.callbackData)]);
  rows.push([menuButton(backText, backCallbackData)]);
  return Markup.inlineKeyboard(rows);
}

export function getAdminBookingDetailKeyboard({
  backCallbackData = ADMIN_CALLBACKS.MENU,
  backText = 'Назад',
  pdfCallbackData = null,
  pdfText = 'Открыть PDF',
} = {}) {
  const rows = [];

  if (pdfCallbackData) {
    rows.push([menuButton(pdfText, pdfCallbackData)]);
  }

  rows.push([menuButton(backText, backCallbackData)]);

  return Markup.inlineKeyboard(rows);
}

export function getAdminCancelKeyboard(cancelText = 'Отмена') {
  return Markup.inlineKeyboard([[menuButton(cancelText, ADMIN_CALLBACKS.SCENE_CANCEL)]]);
}

export function getAdminSkipKeyboard(skipText = 'Пропустить') {
  return Markup.inlineKeyboard([
    [menuButton(skipText, ADMIN_CALLBACKS.SCENE_SKIP)],
    [menuButton('Назад', ADMIN_CALLBACKS.SCENE_CANCEL)],
  ]);
}

export function getAdminConfirmKeyboard(confirmText = 'Подтвердить') {
  return Markup.inlineKeyboard([
    [menuButton(confirmText, ADMIN_CALLBACKS.SCENE_CONFIRM)],
    [menuButton('Назад', ADMIN_CALLBACKS.SCENE_CANCEL)],
  ]);
}
