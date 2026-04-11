import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat.js';
import timezone from 'dayjs/plugin/timezone.js';
import utc from 'dayjs/plugin/utc.js';
import 'dayjs/locale/ru.js';

import { env } from '../config/env.js';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);
dayjs.locale('ru');

const BOOKING_NON_WORKING_WEEKDAYS = new Set([0, 6]);
const BOOKING_DATE_EXCLUSIONS = Object.freeze([
  // Future holidays / manual blackout dates can be added here in YYYY-MM-DD format.
]);
export const DEFAULT_BOOKING_WORKING_DAYS_WINDOW = 7;

export function now() {
  return dayjs().tz(env.DEFAULT_TIMEZONE);
}

export function startOfDate(value) {
  return dayjs(value).tz(env.DEFAULT_TIMEZONE).startOf('day').toDate();
}

export function addDays(value, days) {
  return dayjs(value).tz(env.DEFAULT_TIMEZONE).add(days, 'day').toDate();
}

export function formatDate(value, format = 'DD.MM.YYYY HH:mm') {
  return dayjs(value).tz(env.DEFAULT_TIMEZONE).format(format);
}

export function isBookingExcludedDate(value) {
  const normalizedDate = dayjs(value).tz(env.DEFAULT_TIMEZONE).format('YYYY-MM-DD');
  return BOOKING_DATE_EXCLUSIONS.includes(normalizedDate);
}

export function isBookingWorkingDay(value) {
  const normalizedDate = dayjs(value).tz(env.DEFAULT_TIMEZONE).startOf('day');

  if (!normalizedDate.isValid()) {
    return false;
  }

  return !BOOKING_NON_WORKING_WEEKDAYS.has(normalizedDate.day()) && !isBookingExcludedDate(normalizedDate);
}

export function getNextAvailableBookingDates(count = DEFAULT_BOOKING_WORKING_DAYS_WINDOW, fromValue = null) {
  const safeCount = Number.isInteger(count) && count > 0
    ? count
    : DEFAULT_BOOKING_WORKING_DAYS_WINDOW;
  const dates = [];
  let cursor = (fromValue ? dayjs(fromValue) : now()).tz(env.DEFAULT_TIMEZONE).startOf('day');
  let attemptsLeft = 366;

  while (dates.length < safeCount && attemptsLeft > 0) {
    if (isBookingWorkingDay(cursor)) {
      dates.push(cursor.toDate());
    }

    cursor = cursor.add(1, 'day');
    attemptsLeft -= 1;
  }

  return dates;
}

export { dayjs };
