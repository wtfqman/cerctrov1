import { dayjs, now } from './date.js';
import { ValidationError } from './errors.js';

export function normalizeTelegramId(value) {
  if (value === undefined || value === null || value === '') {
    throw new ValidationError('Telegram ID обязателен');
  }

  const normalized = String(value).trim();

  if (!/^\d+$/.test(normalized)) {
    throw new ValidationError('Telegram ID должен содержать только цифры');
  }

  return normalized;
}

export function ensureTelegramUser(telegramUser) {
  if (!telegramUser?.id) {
    throw new ValidationError('Не удалось определить пользователя Telegram');
  }

  return telegramUser;
}

export function ensureFutureOrToday(value, fieldName = 'Дата') {
  const parsed = dayjs(value);

  if (!parsed.isValid()) {
    throw new ValidationError(`${fieldName} заполнена некорректно`);
  }

  if (parsed.startOf('day').isBefore(now().startOf('day'))) {
    throw new ValidationError(`${fieldName} не может быть в прошлом`);
  }

  return parsed.toDate();
}

export function ensureNonEmptyString(value, fieldName) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ValidationError(`Поле "${fieldName}" обязательно`);
  }

  return value.trim();
}