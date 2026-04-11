import { ValidationError } from './errors.js';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const EMAIL_LIST_SEPARATOR = /[,\n;]+/;
const OPTIONAL_SKIP_MARKERS = new Set(['-', 'нет', 'none', 'no', 'пропустить']);

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function isValidEmailAddress(value) {
  return EMAIL_REGEX.test(normalizeString(value));
}

export function normalizeEmail(value, fieldName = 'Email') {
  const normalized = normalizeString(value);

  if (!normalized) {
    throw new ValidationError(`Поле "${fieldName}" обязательно`);
  }

  if (!isValidEmailAddress(normalized)) {
    throw new ValidationError(`Поле "${fieldName}" заполнено некорректно`);
  }

  return normalized.toLowerCase();
}

export function normalizeOptionalEmail(value, fieldName = 'Email') {
  const normalized = normalizeString(value);

  if (!normalized || OPTIONAL_SKIP_MARKERS.has(normalized.toLowerCase())) {
    return null;
  }

  return normalizeEmail(normalized, fieldName);
}

export function normalizeEmailList(value, { allowEmpty = true, fieldName = 'Email' } = {}) {
  const normalized = normalizeString(value);

  if (!normalized || OPTIONAL_SKIP_MARKERS.has(normalized.toLowerCase())) {
    if (allowEmpty) {
      return [];
    }

    throw new ValidationError(`Поле "${fieldName}" обязательно`);
  }

  const items = normalized
    .split(EMAIL_LIST_SEPARATOR)
    .map((item) => item.trim())
    .filter(Boolean);

  if (items.length === 0) {
    if (allowEmpty) {
      return [];
    }

    throw new ValidationError(`Поле "${fieldName}" обязательно`);
  }

  return [...new Set(items.map((item) => normalizeEmail(item, fieldName)))];
}

export function formatEmailList(value) {
  if (Array.isArray(value)) {
    return value.join(', ');
  }

  return normalizeString(value);
}
