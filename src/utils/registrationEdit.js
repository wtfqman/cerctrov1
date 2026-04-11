const REGISTRATION_SIZES_EDIT_TEMPLATE = [
  'Напиши новые размеры по шаблону:',
  '',
  'Сорочка:',
  'Пиджак:',
  'Брюки:',
  'Трикотаж:',
  'Костюм классика:',
  'Костюм power suit:',
].join('\n');

export const REGISTRATION_EDITABLE_FIELDS = Object.freeze([
  {
    key: 'fullName',
    label: 'ФИО',
    prompt: 'Напиши новое ФИО',
    successMessage: 'ФИО обновлено.',
  },
  {
    key: 'phone',
    label: 'Телефон',
    prompt: 'Напиши новый номер телефона',
    successMessage: 'Телефон обновлён.',
  },
  {
    key: 'telegramUsername',
    label: 'Ник Telegram',
    prompt: 'Напиши новый ник в Telegram\nНапример: @username',
    successMessage: 'Ник обновлён.',
  },
  {
    key: 'homeAddress',
    label: 'Домашний адрес',
    prompt: 'Напиши новый домашний адрес',
    successMessage: 'Домашний адрес обновлён.',
  },
  {
    key: 'cdekAddress',
    label: 'Адрес СДЭК',
    prompt: 'Напиши новый адрес СДЭК',
    successMessage: 'Адрес СДЭК обновлён.',
  },
  {
    key: 'sizes',
    label: 'Размеры',
    prompt: REGISTRATION_SIZES_EDIT_TEMPLATE,
    successMessage: 'Размеры обновлены.',
  },
]);

const REGISTRATION_EDITABLE_FIELD_MAP = Object.freeze(
  Object.fromEntries(REGISTRATION_EDITABLE_FIELDS.map((field) => [field.key, field])),
);

export function getRegistrationEditableField(fieldKey) {
  return REGISTRATION_EDITABLE_FIELD_MAP[fieldKey] ?? null;
}
