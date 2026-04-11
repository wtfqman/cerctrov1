# Slot Display Changes

## src/utils/slots.js
```js
function normalizeSlotLabel(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function extractSlotStartLabel(slotLabel) {
  const normalized = normalizeSlotLabel(slotLabel);

  if (!normalized) {
    return '';
  }

  const [startPart = normalized] = normalized.split(/\s*-\s*/u);
  const rawStart = startPart.trim();
  const hourMatch = rawStart.match(/^(\d{1,2})(?::\d{2})?$/u);

  if (hourMatch) {
    return hourMatch[1];
  }

  return rawStart || normalized;
}

export function formatSlotLabelForUser(slotLabel) {
  return extractSlotStartLabel(slotLabel);
}

export function formatSlotLabelForEmail(slotLabel) {
  return extractSlotStartLabel(slotLabel);
}

```

## src/utils/formatters.js
```js
import {
  BOOKING_REQUEST_TYPE_LABELS,
  BOOKING_STATUS_LABELS,
  VISIT_MODE_LABELS,
} from './constants.js';
import { formatDate } from './date.js';
import {
  formatRegistrationSizes,
  getRegistrationCdekAddress,
  getRegistrationHomeAddress,
} from './registration.js';
import { formatSlotLabelForUser } from './slots.js';

function getInlineUsername(user) {
  const username = user?.registration?.telegramUsername ?? (user?.username ? `@${user.username}` : null);
  return username || 'без username';
}

export function formatUserDisplayName(user) {
  const fullName =
    user?.registration?.fullName ||
    [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim();

  if (fullName) {
    return fullName;
  }

  if (user?.username) {
    return `@${user.username}`;
  }

  return `Пользователь ${user?.telegramId ?? 'без имени'}`;
}

export function formatBoutiqueAddress(boutique) {
  return [boutique?.addressLine1, boutique?.addressLine2, boutique?.city].filter(Boolean).join(', ');
}

export function formatBoutiquesList(boutiques) {
  if (!Array.isArray(boutiques) || boutiques.length === 0) {
    return 'Бутики пока не добавлены.';
  }

  return boutiques
    .map((boutique, index) => {
      const timeSlotsCount = Array.isArray(boutique.timeSlots) ? boutique.timeSlots.length : 0;

      return [
        `${index + 1}. ${boutique.name}`,
        `Адрес: ${formatBoutiqueAddress(boutique) || 'Не указан'}`,
        `Слотов: ${timeSlotsCount}`,
      ].join('\n');
    })
    .join('\n\n');
}

export function formatTimeSlotsList(timeSlots) {
  if (!Array.isArray(timeSlots) || timeSlots.length === 0) {
    return 'Временные слоты пока не добавлены.';
  }

  return timeSlots
    .map((slot, index) => {
      const status = slot.isActive === false ? 'неактивен' : 'активен';

      return `${index + 1}. ${formatSlotLabelForUser(slot.label)} (${status})`;
    })
    .join('\n');
}

export function formatAvailableSlotsList(slots, date = null) {
  if (!Array.isArray(slots) || slots.length === 0) {
    return 'На эту дату пока нет свободных слотов.';
  }

  const header = date ? `Свободные слоты на ${formatDate(date, 'DD.MM.YYYY')}:` : 'Свободные слоты:';
  const lines = slots.map((entry, index) => {
    const slot = entry.slot ?? entry;
    const statusText =
      entry.statusText ??
      (entry.isAvailable ? 'Свободно' : entry.isClosedByAdmin ? 'Закрыто' : 'Недоступно');

    return `${index + 1}. ${formatSlotLabelForUser(slot.label)} - ${statusText}`;
  });

  return [header, ...lines].join('\n');
}

export function formatBookingSummary(booking, { includeStatus = true } = {}) {
  const requestTypeLabel = BOOKING_REQUEST_TYPE_LABELS[booking.requestType] ?? booking.requestType;
  const visitModeLabel = VISIT_MODE_LABELS[booking.visitMode] ?? booking.visitMode;
  const statusLabel = BOOKING_STATUS_LABELS[booking.status] ?? booking.status;

  const lines = [`${requestTypeLabel} / ${visitModeLabel}`];

  if (includeStatus) {
    lines.push(`Статус: ${statusLabel}`);
  }

  if (booking.visitMode === 'BOUTIQUE') {
    lines.push(`Бутик: ${booking.boutique?.name ?? booking.boutiqueAddress ?? 'Не выбран'}`);

    if (booking.visitDate) {
      lines.push(`День: ${formatDate(booking.visitDate, 'DD.MM.YYYY')}`);
    }

    if (booking.slotLabel) {
      lines.push(`Время: ${formatSlotLabelForUser(booking.slotLabel)}`);
    }
  }

  if (booking.visitMode === 'DELIVERY') {
    lines.push(`Адрес: ${booking.deliveryAddress ?? 'Не указан'}`);
  }

  if (booking.wishText) {
    lines.push(`Пожелания: ${booking.wishText}`);
  }

  return lines.join('\n');
}

function buildUserBookingDateTimeLine(booking) {
  if (!booking.visitDate && !booking.slotLabel) {
    return '';
  }

  const parts = [];

  if (booking.visitDate) {
    parts.push(formatDate(booking.visitDate, 'DD.MM.YYYY'));
  }

  if (booking.slotLabel) {
    parts.push(formatSlotLabelForUser(booking.slotLabel));
  }

  return parts.join(' • ');
}

function getCompactUserBookingStatus(booking) {
  if (booking.status === 'CANCELLED') {
    return 'Отменена';
  }

  if (booking.status === 'COMPLETED') {
    return 'Завершена';
  }

  return BOOKING_STATUS_LABELS[booking.status] ?? '';
}

export function formatUserBookingCard(booking, { includeStatus = true, title = null } = {}) {
  const lines = [];
  const requestTypeLabel = BOOKING_REQUEST_TYPE_LABELS[booking.requestType] ?? booking.requestType;
  const visitModeLabel = VISIT_MODE_LABELS[booking.visitMode] ?? booking.visitMode;

  if (title) {
    lines.push(title);
  }

  lines.push(`${requestTypeLabel} / ${visitModeLabel}`);

  if (booking.visitMode === 'BOUTIQUE') {
    lines.push(booking.boutique?.name ?? booking.boutiqueAddress ?? 'Бутик не указан');

    const dateTimeLine = buildUserBookingDateTimeLine(booking);

    if (dateTimeLine) {
      lines.push(dateTimeLine);
    }
  }

  if (booking.visitMode === 'DELIVERY') {
    lines.push(booking.deliveryAddress ?? 'Адрес доставки не указан');
  }

  if (booking.wishText) {
    lines.push(`Пожелания: ${booking.wishText}`);
  }

  if (includeStatus) {
    const statusLine = getCompactUserBookingStatus(booking);

    if (statusLine) {
      lines.push(statusLine);
    }
  }

  return lines.join('\n');
}

export function formatUserBookingArchive(bookings, title = 'Прошлые заявки') {
  if (!Array.isArray(bookings) || bookings.length === 0) {
    return '';
  }

  return [
    title,
    ...bookings.map((booking, index) => (
      formatUserBookingCard(booking, {
        includeStatus: true,
        title: `${index + 1}.`,
      })
    )),
  ].join('\n\n');
}

export function formatBookingResult(booking) {
  const requestTypeLabel = BOOKING_REQUEST_TYPE_LABELS[booking.requestType] ?? booking.requestType;
  const visitModeLabel = VISIT_MODE_LABELS[booking.visitMode] ?? booking.visitMode;

  const lines = [
    'Готово 💫',
    'Заявка сохранена.',
    '',
    `${requestTypeLabel} / ${visitModeLabel}`,
  ];

  if (booking.visitMode === 'BOUTIQUE') {
    lines.push(`Бутик: ${booking.boutique?.name ?? booking.boutiqueAddress ?? 'Не указан'}`);
    lines.push(`День: ${booking.visitDate ? formatDate(booking.visitDate, 'DD.MM.YYYY') : 'Не указан'}`);
    lines.push(`Время: ${formatSlotLabelForUser(booking.slotLabel) || 'Не указано'}`);
  }

  if (booking.visitMode === 'DELIVERY') {
    lines.push(`Адрес: ${booking.deliveryAddress ?? 'Не указан'}`);
  }

  if (booking.wishText) {
    lines.push(`Пожелания: ${booking.wishText}`);
  }

  return lines.join('\n');
}

export function formatRegistrationSummary(registration) {
  return `Регистрация сохранена 💫\n${registration.fullName}`;
}

export function formatRegistrationDetails(registration) {
  const homeAddress = getRegistrationHomeAddress(registration);
  const cdekAddress = getRegistrationCdekAddress(registration);
  const lines = [
    'Данные:',
    `ФИО: ${registration.fullName}`,
    `Телефон: ${registration.phone}`,
    `Ник: ${registration.telegramUsername}`,
    `Домашний адрес: ${homeAddress || 'не указан'}`,
    `Адрес СДЭК: ${cdekAddress || 'не указан'}`,
    '',
    formatRegistrationSizes(registration.sizes),
  ];

  return lines.join('\n');
}

export function formatRegistrationConfirmation(data) {
  const homeAddress = getRegistrationHomeAddress(data);
  const cdekAddress = getRegistrationCdekAddress(data);
  const lines = [
    'Проверь данные:',
    '',
    `ФИО: ${data.fullName}`,
    `Телефон: ${data.phone}`,
    `Ник: ${data.telegramUsername}`,
    `Домашний адрес: ${homeAddress || 'не указан'}`,
    `Адрес СДЭК: ${cdekAddress || 'не указан'}`,
    '',
    formatRegistrationSizes(data.sizes),
    '',
    'Если всё верно, нажми «Подтвердить».',
  ];

  return lines.join('\n');
}

export function formatTimerStatusSummary(timerStatus) {
  if (!timerStatus?.hasActiveTimer || !timerStatus.timer) {
    return 'Сейчас у тебя нет активной выдачи образов.';
  }

  const { daysPassed, timer } = timerStatus;
  const statusLabel =
    {
      ACTIVE: 'образы у вас',
      RETURNED: 'образы возвращены',
      OVERDUE: 'пора оформить возврат',
    }[timer.status] ?? 'образы у вас';

  return [
    'По вещам:',
    `Сейчас: ${statusLabel}`,
    `Взято: ${formatDate(timer.takenAt, 'DD.MM.YYYY HH:mm')}`,
    `Прошло дней: ${daysPassed}`,
  ].join('\n');
}

export function formatAdminWelcome() {
  return [
    'Админ-меню',
    'Выбери действие:',
  ].join('\n');
}

export function formatAdminUserSummary(user) {
  const homeAddress = getRegistrationHomeAddress(user.registration);
  const cdekAddress = getRegistrationCdekAddress(user.registration);
  const lines = [
    `${formatUserDisplayName(user)}`,
    `Username: ${getInlineUsername(user)}`,
    `Telegram ID: ${user.telegramId}`,
    `Статус: ${user.isBlocked ? 'заблокирован' : 'активен'}`,
  ];

  if (user.registration?.phone) {
    lines.push(`Телефон: ${user.registration.phone}`);
  }

  if (homeAddress) {
    lines.push(`Домашний адрес: ${homeAddress}`);
  }

  if (cdekAddress) {
    lines.push(`Адрес СДЭК: ${cdekAddress}`);
  }

  return lines.join('\n');
}

export function formatAdminBookingList(bookings, title, emptyMessage = 'Пока заявок нет.') {
  if (!Array.isArray(bookings) || bookings.length === 0) {
    return emptyMessage;
  }

  const items = bookings.map((booking, index) => {
    const userLine = `${formatUserDisplayName(booking.user)} | ${getInlineUsername(booking.user)} | ${booking.user?.telegramId ?? 'без id'}`;
    const lines = [
      `${index + 1}. ${userLine}`,
      formatBookingSummary(booking),
      `Создана: ${formatDate(booking.createdAt, 'DD.MM.YYYY HH:mm')}`,
    ];

    if (booking.publicId) {
      lines.push(`ID заявки: ${booking.publicId}`);
    }

    return lines.join('\n');
  });

  return [title, '', ...items].join('\n\n');
}

export function formatAdminDebtorsList(timers, daysThreshold) {
  if (!Array.isArray(timers) || timers.length === 0) {
    return 'Сейчас должников нет.';
  }

  const items = timers.map((timer, index) => {
    const daysPassed = Math.max(
      Math.floor((Date.now() - new Date(timer.takenAt).getTime()) / (24 * 60 * 60 * 1000)),
      0,
    );

    const lines = [
      `${index + 1}. ${formatUserDisplayName(timer.user)}`,
      `Username: ${getInlineUsername(timer.user)}`,
      `Telegram ID: ${timer.user.telegramId}`,
      `Взял образы: ${formatDate(timer.takenAt, 'DD.MM.YYYY HH:mm')}`,
      `Прошло дней: ${daysPassed}`,
      `Порог просрочки: ${daysThreshold} дней`,
    ];

    if (timer.booking) {
      lines.push(`Связь с заявкой: ${formatBookingSummary(timer.booking)}`);
    }

    return lines.join('\n');
  });

  return ['Должники по вещам', '', ...items].join('\n\n');
}

export function formatAdminSlotStateList(entries, date, mode = 'close') {
  if (!Array.isArray(entries) || entries.length === 0) {
    return mode === 'open'
      ? 'На выбранную дату нет закрытых слотов.'
      : 'На выбранную дату нет слотов.';
  }

  const header =
    mode === 'open'
      ? `Закрытые слоты на ${formatDate(date, 'DD.MM.YYYY')}:`
      : `Слоты на ${formatDate(date, 'DD.MM.YYYY')}:`;

  const lines = entries.map((entry, index) => {
    const status = entry.closure
      ? `закрыт${entry.closure.reason ? `: ${entry.closure.reason}` : ''}`
      : entry.booking
        ? 'занят пользователем'
        : 'свободен';

    return `${index + 1}. ${formatSlotLabelForUser(entry.slot.label)} - ${status}`;
  });

  return [header, ...lines].join('\n');
}

```

## src/services/email.js
```js
import nodemailer from 'nodemailer';

import { BOOKING_REQUEST_TYPE_LABELS } from '../utils/constants.js';
import { formatDate } from '../utils/date.js';
import { normalizeEmailList } from '../utils/mail.js';
import { getRegistrationCdekAddress, getRegistrationHomeAddress } from '../utils/registration.js';
import { formatSlotLabelForEmail } from '../utils/slots.js';

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatTelegramHandle(booking) {
  const registrationUsername = booking?.user?.registration?.telegramUsername;

  if (registrationUsername) {
    return registrationUsername;
  }

  if (booking?.user?.username) {
    return `@${booking.user.username}`;
  }

  if (booking?.user?.telegramId) {
    return booking.user.telegramId;
  }

  return 'не указан';
}

function buildMailFrom(env) {
  if (env.MAIL_FROM_NAME) {
    return {
      address: env.MAIL_FROM,
      name: env.MAIL_FROM_NAME,
    };
  }

  return env.MAIL_FROM;
}

function buildBookingMailRows(booking) {
  const registration = booking?.user?.registration;
  const boutiqueName = booking?.boutique?.name ?? booking?.boutiqueAddress ?? 'Не указан';
  const homeAddress = getRegistrationHomeAddress(registration) || 'не указан';
  const cdekAddress = getRegistrationCdekAddress(registration) || 'не указан';
  const requestTypeLabel = BOOKING_REQUEST_TYPE_LABELS[booking?.requestType] ?? booking?.requestType ?? 'Не указан';
  const fullName =
    registration?.fullName ??
    [booking?.user?.firstName, booking?.user?.lastName].filter(Boolean).join(' ').trim() ??
    'Не указано';

  return [
    ['ФИО', fullName || 'Не указано'],
    ['Телефон', registration?.phone ?? booking?.contactPhone ?? booking?.user?.phone ?? 'Не указан'],
    ['Telegram', formatTelegramHandle(booking)],
    ['Домашний адрес', homeAddress],
    ['Адрес СДЭК', cdekAddress],
    ['Тип заявки', requestTypeLabel],
    ['Бутик', boutiqueName],
    ['Дата', booking?.visitDate ? formatDate(booking.visitDate, 'DD.MM.YYYY') : 'Не указана'],
    ['Время', formatSlotLabelForEmail(booking?.slotLabel ?? booking?.timeSlot?.label) || 'Не указано'],
    ['Пожелание', booking?.wishText?.trim() || 'не указано'],
  ];
}

function buildTextBody(rows) {
  return [
    'Здравствуйте!',
    '',
    'Появилась новая запись в бутик.',
    '',
    ...rows.map(([label, value]) => `${label}: ${value}`),
  ].join('\n');
}

function buildHtmlBody(rows) {
  const tableRows = rows
    .map(
      ([label, value]) => `
        <tr>
          <td style="padding:8px 12px;border:1px solid #d9d9d9;font-weight:600;background:#f7f7f7;">${escapeHtml(label)}</td>
          <td style="padding:8px 12px;border:1px solid #d9d9d9;">${escapeHtml(value)}</td>
        </tr>`,
    )
    .join('');

  return `
    <div style="font-family:Arial,sans-serif;color:#1f1f1f;line-height:1.5;">
      <p>Здравствуйте!</p>
      <p>Появилась новая запись в бутик.</p>
      <table style="border-collapse:collapse;border-spacing:0;">
        <tbody>${tableRows}</tbody>
      </table>
    </div>
  `.trim();
}

function buildBoutiqueBookingMessage(booking) {
  const boutiqueName = booking?.boutique?.name ?? booking?.boutiqueAddress ?? 'Бутик';
  const rows = buildBookingMailRows(booking);

  return {
    html: buildHtmlBody(rows),
    subject: `Новая запись в бутик — ${boutiqueName}`,
    text: buildTextBody(rows),
  };
}

export function createEmailService({ env, logger }) {
  const serviceLogger = logger.child({ service: 'email' });
  const isConfigured = Boolean(env.MAIL_ENABLED);
  const state = {
    initPromise: null,
    initialized: false,
    transporter: null,
  };

  function getTransporter() {
    if (state.transporter) {
      return state.transporter;
    }

    state.transporter = nodemailer.createTransport({
      auth: {
        pass: env.SMTP_PASS,
        user: env.SMTP_USER,
      },
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
    });

    return state.transporter;
  }

  async function runInit() {
    try {
      const transporter = getTransporter();
      await transporter.verify();
      state.initialized = true;

      serviceLogger.info(
        {
          host: env.SMTP_HOST,
          mailFrom: env.MAIL_FROM,
          port: env.SMTP_PORT,
          secure: env.SMTP_SECURE,
          user: env.SMTP_USER,
        },
        'Email service initialized successfully',
      );

      return true;
    } catch (error) {
      state.initialized = false;

      serviceLogger.error(
        {
          err: error,
          host: env.SMTP_HOST,
          mailFrom: env.MAIL_FROM,
          port: env.SMTP_PORT,
          secure: env.SMTP_SECURE,
          user: env.SMTP_USER,
        },
        'Failed to initialize email service',
      );

      return false;
    }
  }

  async function init() {
    if (!isConfigured) {
      serviceLogger.info('Email notifications are disabled');
      return false;
    }

    if (state.initialized) {
      return true;
    }

    if (!state.initPromise) {
      state.initPromise = runInit().finally(() => {
        state.initPromise = null;
      });
    }

    return state.initPromise;
  }

  async function sendMail({ attachments = [], cc = [], html = '', subject, text, to }) {
    if (!isConfigured) {
      return {
        message: 'Email service is disabled',
        ok: false,
        reason: 'mail_disabled',
        skipped: true,
      };
    }

    const transporter = getTransporter();

    try {
      const info = await transporter.sendMail({
        attachments: attachments.length > 0 ? attachments : undefined,
        cc: cc.length > 0 ? cc : undefined,
        from: buildMailFrom(env),
        html: html || undefined,
        subject,
        text,
        to,
      });

      state.initialized = true;

      return {
        accepted: info.accepted,
        messageId: info.messageId,
        ok: true,
        rejected: info.rejected,
      };
    } catch (error) {
      state.initialized = false;

      serviceLogger.error(
        {
          err: error,
          subject,
          to,
        },
        'Failed to send email',
      );

      return {
        message: error?.message ?? 'Failed to send email',
        ok: false,
      };
    }
  }

  async function sendBoutiqueBookingNotification({ attachments = [], booking }) {
    if (!booking || booking.visitMode !== 'BOUTIQUE') {
      return {
        message: 'Only boutique bookings can trigger boutique email notifications',
        ok: false,
        reason: 'not_boutique_booking',
        skipped: true,
      };
    }

    const recipient = booking?.boutique?.email?.trim();

    if (!recipient) {
      serviceLogger.warn(
        {
          bookingId: booking.id,
          boutiqueId: booking.boutiqueId,
          boutiqueName: booking?.boutique?.name ?? booking?.boutiqueAddress,
        },
        'Boutique booking email skipped because boutique email is missing',
      );

      return {
        message: 'Boutique email is missing',
        ok: false,
        reason: 'missing_boutique_email',
        skipped: true,
      };
    }

    let ccRecipients = [];

    try {
      ccRecipients = normalizeEmailList(booking?.boutique?.ccEmails ?? '', {
        allowEmpty: true,
        fieldName: 'ccEmails',
      });
    } catch (error) {
      serviceLogger.warn(
        {
          boutiqueId: booking.boutiqueId,
          ccEmails: booking?.boutique?.ccEmails,
          errorMessage: error?.message,
        },
        'Boutique ccEmails are invalid and will be ignored',
      );
    }

    const message = buildBoutiqueBookingMessage(booking);

    return sendMail({
      attachments,
      cc: ccRecipients,
      html: message.html,
      subject: message.subject,
      text: message.text,
      to: recipient,
    });
  }

  return {
    init,
    isConfigured,
    sendBoutiqueBookingNotification,
    sendMail,
  };
}

```

## src/services/googleSheets.js
```js
import { google } from 'googleapis';
import {
  getRegistrationCdekAddress,
  getRegistrationHomeAddress,
  normalizeRegistrationSizes,
} from '../utils/registration.js';
import { formatSlotLabelForUser } from '../utils/slots.js';

const GOOGLE_SHEETS_SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

const SHEET_COLUMNS = Object.freeze([
  'created_at',
  'type',
  'user_id',
  'telegram_id',
  'username',
  'full_name',
  'phone',
  'address',
  'sizes',
  'booking_kind',
  'visit_mode',
  'boutique_name',
  'boutique_address',
  'visit_date',
  'time_slot',
  'delivery_address',
  'wish_text',
  'status',
  'taken_at',
  'returned_at',
  'reminder_5d_sent_at',
  'overdue_8d_sent_at',
  'admin_action',
  'admin_id',
  'comment',
  'pdf_file_id',
]);

function toColumnLetter(index) {
  let current = index + 1;
  let result = '';

  while (current > 0) {
    const remainder = (current - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    current = Math.floor((current - 1) / 26);
  }

  return result;
}

function escapeSheetName(sheetName) {
  return `'${sheetName.replace(/'/g, "''")}'`;
}

function formatSheetRange(sheetName, a1Range) {
  return `${escapeSheetName(sheetName)}!${a1Range}`;
}

function formatDateTime(value) {
  if (!value) {
    return '';
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return String(value);
}

function normalizeCellValue(value) {
  if (value === null || value === undefined) {
    return '';
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.filter(Boolean).join(', ');
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value);
}

function createEmptyRow() {
  return Object.fromEntries(SHEET_COLUMNS.map((column) => [column, '']));
}

function buildRowArray(row) {
  if (Array.isArray(row)) {
    return SHEET_COLUMNS.map((_, index) => normalizeCellValue(row[index] ?? ''));
  }

  const baseRow = createEmptyRow();
  const mergedRow = {
    ...baseRow,
    ...row,
  };

  return SHEET_COLUMNS.map((column) => normalizeCellValue(mergedRow[column]));
}

function mapRowToObject(row) {
  return Object.fromEntries(SHEET_COLUMNS.map((column, index) => [column, row[index] ?? '']));
}

function hasAnyValue(row) {
  return row.some((cell) => String(cell ?? '').trim() !== '');
}

function buildFullName(entity) {
  const fullName =
    entity?.registration?.fullName ??
    [entity?.firstName, entity?.lastName].filter(Boolean).join(' ').trim();
  return fullName || '';
}

function joinAddress(...parts) {
  return parts.filter(Boolean).join(', ');
}

function buildComment(...parts) {
  return parts
    .flat()
    .filter(Boolean)
    .map((part) => String(part).trim())
    .filter(Boolean)
    .join(' | ');
}

function extractGoogleError(error) {
  return (
    error?.response?.data?.error?.message ??
    error?.response?.data?.error_description ??
    error?.message ??
    'Unknown Google Sheets error'
  );
}

export function createGoogleSheetsService({ env, logger }) {
  const serviceLogger = logger.child({ service: 'googleSheets' });
  const isConfigured = Boolean(env.GOOGLE_SHEETS_ENABLED);
  const headerRange = formatSheetRange(env.GOOGLE_SHEET_NAME, `A1:${toColumnLetter(SHEET_COLUMNS.length - 1)}1`);
  const valuesRange = formatSheetRange(env.GOOGLE_SHEET_NAME, 'A:Z');

  const state = {
    auth: null,
    initialized: false,
    initPromise: null,
    sheetsClient: null,
  };

  async function getSheetsClient() {
    if (state.sheetsClient) {
      return state.sheetsClient;
    }

    state.auth =
      state.auth ??
      new google.auth.GoogleAuth({
        keyFile: env.GOOGLE_SERVICE_ACCOUNT_JSON_PATH,
        scopes: GOOGLE_SHEETS_SCOPES,
      });

    state.sheetsClient = google.sheets({
      version: 'v4',
      auth: state.auth,
    });

    return state.sheetsClient;
  }

  async function ensureSheetExists() {
    const sheets = await getSheetsClient();

    const response = await sheets.spreadsheets.get({
      spreadsheetId: env.GOOGLE_SHEETS_SPREADSHEET_ID,
      fields: 'sheets.properties.title',
    });

    const exists = response.data.sheets?.some(
      (sheet) => sheet.properties?.title === env.GOOGLE_SHEET_NAME,
    );

    if (exists) {
      return false;
    }

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: env.GOOGLE_SHEETS_SPREADSHEET_ID,
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: {
                title: env.GOOGLE_SHEET_NAME,
              },
            },
          },
        ],
      },
    });

    serviceLogger.info({ sheetName: env.GOOGLE_SHEET_NAME }, 'Google Sheets worksheet created');

    return true;
  }

  async function ensureHeader() {
    const sheets = await getSheetsClient();

    try {
      await ensureSheetExists();

      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: env.GOOGLE_SHEETS_SPREADSHEET_ID,
        range: formatSheetRange(env.GOOGLE_SHEET_NAME, '1:1'),
      });

      const currentHeader = response.data.values?.[0] ?? [];
      const matches =
        currentHeader.length === SHEET_COLUMNS.length &&
        SHEET_COLUMNS.every((column, index) => currentHeader[index] === column);

      if (!matches) {
        if (currentHeader.length === 0) {
          serviceLogger.info({ sheetName: env.GOOGLE_SHEET_NAME }, 'Google Sheets header is empty, creating it');
        } else {
          serviceLogger.warn(
            {
              currentHeader,
              expectedHeader: SHEET_COLUMNS,
              sheetName: env.GOOGLE_SHEET_NAME,
            },
            'Google Sheets header mismatch detected, rewriting the first row',
          );
        }

        await sheets.spreadsheets.values.update({
          spreadsheetId: env.GOOGLE_SHEETS_SPREADSHEET_ID,
          range: headerRange,
          valueInputOption: 'RAW',
          requestBody: {
            values: [SHEET_COLUMNS],
          },
        });
      }

      return true;
    } catch (error) {
      serviceLogger.error(
        {
          err: error,
          errorMessage: extractGoogleError(error),
          sheetName: env.GOOGLE_SHEET_NAME,
        },
        'Failed to ensure Google Sheets header',
      );
      throw error;
    }
  }

  async function runInit() {
    try {
      await getSheetsClient();
      await ensureSheetExists();
      await ensureHeader();

      state.initialized = true;

      serviceLogger.info(
        {
          credentialsPath: env.GOOGLE_SERVICE_ACCOUNT_JSON_PATH,
          sheetName: env.GOOGLE_SHEET_NAME,
          spreadsheetId: env.GOOGLE_SHEETS_SPREADSHEET_ID,
        },
        'Google Sheets initialized successfully',
      );

      return true;
    } catch (error) {
      state.initialized = false;

      serviceLogger.error(
        {
          err: error,
          credentialsPath: env.GOOGLE_SERVICE_ACCOUNT_JSON_PATH,
          errorMessage: extractGoogleError(error),
          sheetName: env.GOOGLE_SHEET_NAME,
          spreadsheetId: env.GOOGLE_SHEETS_SPREADSHEET_ID,
        },
        'Failed to initialize Google Sheets integration',
      );

      return false;
    }
  }

  async function init() {
    if (!isConfigured) {
      serviceLogger.info('Google Sheets integration is disabled');
      return false;
    }

    if (state.initialized) {
      return true;
    }

    if (!state.initPromise) {
      state.initPromise = runInit().finally(() => {
        state.initPromise = null;
      });
    }

    return state.initPromise;
  }

  async function appendRows(rows) {
    if (!Array.isArray(rows) || rows.length === 0) {
      return {
        appendedCount: 0,
        ok: true,
      };
    }

    if (!isConfigured) {
      return {
        appendedCount: 0,
        message: 'Google Sheets integration is disabled',
        ok: true,
        skipped: true,
      };
    }

    const ready = await init();

    if (!ready) {
      return {
        appendedCount: 0,
        message: 'Google Sheets is not initialized',
        ok: false,
      };
    }

    const sheets = await getSheetsClient();
    const values = rows.map(buildRowArray);

    try {
      await sheets.spreadsheets.values.append({
        spreadsheetId: env.GOOGLE_SHEETS_SPREADSHEET_ID,
        range: valuesRange,
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: {
          values,
        },
      });

      return {
        appendedCount: rows.length,
        ok: true,
      };
    } catch (error) {
      state.initialized = false;

      serviceLogger.error(
        {
          err: error,
          errorMessage: extractGoogleError(error),
          rowsCount: rows.length,
          sheetName: env.GOOGLE_SHEET_NAME,
        },
        'Failed to append rows to Google Sheets',
      );

      return {
        appendedCount: 0,
        message: extractGoogleError(error),
        ok: false,
      };
    }
  }

  async function appendRow(row) {
    return appendRows([row]);
  }

  async function getAllRows() {
    const ready = await init();

    if (!ready) {
      return [];
    }

    const sheets = await getSheetsClient();

    try {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: env.GOOGLE_SHEETS_SPREADSHEET_ID,
        range: valuesRange,
      });

      const values = response.data.values ?? [];

      if (values.length <= 1) {
        return [];
      }

      return values
        .slice(1)
        .filter(hasAnyValue)
        .map(mapRowToObject);
    } catch (error) {
      state.initialized = false;

      serviceLogger.error(
        {
          err: error,
          errorMessage: extractGoogleError(error),
          sheetName: env.GOOGLE_SHEET_NAME,
        },
        'Failed to read rows from Google Sheets',
      );

      return [];
    }
  }

  async function findRowsByTelegramId(telegramId) {
    const normalizedTelegramId = String(telegramId).trim();
    const rows = await getAllRows();

    return rows.filter((row) => row.telegram_id === normalizedTelegramId);
  }

  async function logRegistration({ registration, user, comment = '', pdfFileId = '' }) {
    const homeAddress = getRegistrationHomeAddress(registration);
    const cdekAddress = getRegistrationCdekAddress(registration);
    const row = {
      created_at: registration?.updatedAt ?? registration?.createdAt ?? new Date(),
      type: 'registration',
      user_id: user?.id ?? registration?.userId ?? '',
      telegram_id: user?.telegramId ?? '',
      username: registration?.telegramUsername ?? user?.username ?? '',
      full_name: registration?.fullName ?? buildFullName(user),
      phone: registration?.phone ?? user?.phone ?? '',
      address: homeAddress,
      sizes: normalizeRegistrationSizes(registration?.sizes ?? ''),
      status: registration?.status ?? '',
      comment: buildComment(comment, cdekAddress ? `cdek_address: ${cdekAddress}` : ''),
      pdf_file_id: pdfFileId,
    };

    return appendRow(row);
  }

  async function logBooking({ booking, comment = '', pdfFileId = '', visitMode = '' }) {
    const bookingType = booking?.visitMode === 'BOUTIQUE' ? 'boutique_booking' : 'delivery_booking';
    const boutiqueAddress =
      booking?.boutiqueAddress ??
      joinAddress(
        booking?.boutique?.addressLine1,
        booking?.boutique?.addressLine2,
        booking?.boutique?.city,
      );

    const row = {
      created_at: booking?.createdAt ?? new Date(),
      type: bookingType,
      user_id: booking?.user?.id ?? booking?.userId ?? '',
      telegram_id: booking?.user?.telegramId ?? '',
      username: booking?.user?.registration?.telegramUsername ?? booking?.user?.username ?? '',
      full_name: buildFullName(booking?.user),
      phone: booking?.contactPhone ?? booking?.user?.registration?.phone ?? booking?.user?.phone ?? '',
      booking_kind: booking?.requestType?.toLowerCase?.() ?? '',
      visit_mode: visitMode || booking?.visitMode?.toLowerCase?.() || '',
      boutique_name: booking?.boutique?.name ?? '',
      boutique_address: boutiqueAddress,
      visit_date: formatDateTime(booking?.visitDate),
      time_slot: formatSlotLabelForUser(booking?.slotLabel ?? booking?.timeSlot?.label),
      delivery_address: booking?.deliveryAddress ?? '',
      wish_text: booking?.wishText ?? '',
      status: booking?.status ?? '',
      comment: buildComment(comment, booking?.publicId ? `public_id: ${booking.publicId}` : ''),
      pdf_file_id: pdfFileId,
    };

    return appendRow(row);
  }

  async function logTimerEvent({ timer, user = null, event = '', adminId = '', comment = '', pdfFileId = '' }) {
    const resolvedUser = user ?? timer?.user ?? null;
    const bookingBoutiqueAddress =
      timer?.booking?.boutiqueAddress ??
      joinAddress(
        timer?.booking?.boutique?.addressLine1,
        timer?.booking?.boutique?.addressLine2,
        timer?.booking?.boutique?.city,
      );

    const row = {
      created_at: new Date(),
      type: 'timer_event',
      user_id: resolvedUser?.id ?? timer?.userId ?? '',
      telegram_id: resolvedUser?.telegramId ?? '',
      username: resolvedUser?.registration?.telegramUsername ?? resolvedUser?.username ?? '',
      full_name: buildFullName(resolvedUser),
      phone: resolvedUser?.registration?.phone ?? resolvedUser?.phone ?? '',
      booking_kind: timer?.booking?.requestType?.toLowerCase?.() ?? '',
      visit_mode: timer?.booking?.visitMode?.toLowerCase?.() ?? '',
      boutique_name: timer?.booking?.boutique?.name ?? '',
      boutique_address: bookingBoutiqueAddress,
      visit_date: formatDateTime(timer?.booking?.visitDate),
      time_slot: formatSlotLabelForUser(timer?.booking?.slotLabel ?? timer?.booking?.timeSlot?.label),
      delivery_address: timer?.booking?.deliveryAddress ?? '',
      status: event || timer?.status || '',
      taken_at: formatDateTime(timer?.takenAt),
      returned_at: formatDateTime(timer?.returnedAt),
      reminder_5d_sent_at: formatDateTime(timer?.reminderSentAt),
      overdue_8d_sent_at: formatDateTime(timer?.adminAlertSentAt),
      admin_id: adminId,
      comment: buildComment(timer?.note ? `note: ${timer.note}` : '', comment),
      pdf_file_id: pdfFileId,
    };

    return appendRow(row);
  }

  async function logAdminAction({
    action,
    adminId = '',
    targetUser = null,
    comment = '',
    pdfFileId = '',
    status = '',
  }) {
    const row = {
      created_at: new Date(),
      type: 'admin_action',
      user_id: targetUser?.id ?? '',
      telegram_id: targetUser?.telegramId ?? '',
      username: targetUser?.registration?.telegramUsername ?? targetUser?.username ?? '',
      full_name: buildFullName(targetUser),
      phone: targetUser?.registration?.phone ?? targetUser?.phone ?? '',
      status,
      admin_action: action,
      admin_id: adminId,
      comment,
      pdf_file_id: pdfFileId,
    };

    return appendRow(row);
  }

  return {
    SHEET_COLUMNS,
    appendRow,
    appendRows,
    ensureSheetExists,
    ensureHeader,
    findRowsByTelegramId,
    getAllRows,
    init,
    isConfigured,
    logAdminAction,
    logBooking,
    logRegistration,
    logTimerEvent,
  };
}

```

## src/services/adminService.js
```js
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { AdminRole } from '@prisma/client';

import {
  ADMIN_PERMISSIONS,
  ADMIN_ROLE_PERMISSIONS,
  BUILTIN_ADMINS,
} from '../utils/constants.js';
import { ForbiddenError, ValidationError } from '../utils/errors.js';
import { getRegistrationCdekAddress, getRegistrationHomeAddress, normalizeRegistrationSizes } from '../utils/registration.js';
import { formatSlotLabelForUser } from '../utils/slots.js';
import { normalizeTelegramId } from '../utils/validators.js';

function normalizeAdminRole(role) {
  const normalizedRole = String(role ?? '').trim().toUpperCase();

  if (!Object.values(AdminRole).includes(normalizedRole)) {
    throw new ValidationError(
      `Роль администратора должна быть одной из: ${Object.values(AdminRole).join(', ')}`,
    );
  }

  return normalizedRole;
}

function getRolePermissions(role) {
  return ADMIN_ROLE_PERMISSIONS[role] ?? [];
}

function csvEscape(value) {
  const normalized = value === null || value === undefined ? '' : String(value);
  return `"${normalized.replace(/"/g, '""')}"`;
}

function buildCsv(rows) {
  return `\uFEFF${rows.map((row) => row.map(csvEscape).join(',')).join('\n')}`;
}

export function createAdminService({ prisma, logger, env }) {
  const serviceLogger = logger.child({ service: 'admin' });

  async function getAdminById(adminId) {
    if (!adminId) {
      return null;
    }

    return prisma.admin.findFirst({
      where: {
        id: String(adminId),
        isActive: true,
      },
      include: {
        user: true,
      },
    });
  }

  async function getAdminByTelegramId(telegramId) {
    const normalizedTelegramId = normalizeTelegramId(telegramId);

    return prisma.admin.findFirst({
      where: {
        isActive: true,
        user: {
          telegramId: normalizedTelegramId,
        },
      },
      include: {
        user: true,
      },
    });
  }

  async function getAdminByActorId(actorId) {
    if (actorId === undefined || actorId === null || actorId === '') {
      return null;
    }

    const rawValue = String(actorId).trim();

    return prisma.admin.findFirst({
      where: {
        isActive: true,
        OR: [
          {
            id: rawValue,
          },
          {
            user: {
              telegramId: rawValue,
            },
          },
        ],
      },
      include: {
        user: true,
      },
    });
  }

  function hasPermission(adminOrRole, permission) {
    const role =
      typeof adminOrRole === 'string' ? normalizeAdminRole(adminOrRole) : normalizeAdminRole(adminOrRole?.role);

    return getRolePermissions(role).includes(permission);
  }

  async function assertPermission(actorId, permission) {
    const admin = await getAdminByActorId(actorId);

    if (!admin) {
      throw new ForbiddenError('Админское меню доступно только администраторам');
    }

    if (!hasPermission(admin, permission)) {
      serviceLogger.warn(
        {
          actorId: String(actorId),
          permission,
          role: admin.role,
        },
        'Admin permission denied',
      );

      throw new ForbiddenError('Недостаточно прав для этого действия');
    }

    return admin;
  }

  async function isAdminByTelegramId(telegramId) {
    const admin = await getAdminByTelegramId(telegramId);
    return Boolean(admin);
  }

  async function getPrimaryAlertAdmin() {
    return prisma.admin.findFirst({
      where: {
        isActive: true,
        receivesOverdueAlerts: true,
      },
      include: {
        user: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });
  }

  async function listAdmins() {
    return prisma.admin.findMany({
      where: {
        isActive: true,
      },
      include: {
        user: true,
      },
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async function createOrUpdateAdmin({
    telegramId,
    displayName = 'Администратор',
    role = env.DEFAULT_ADMIN_ROLE,
    receivesOverdueAlerts = false,
    notificationChatId = null,
  }) {
    const normalizedTelegramId = normalizeTelegramId(telegramId);
    const normalizedRole = normalizeAdminRole(role);

    const user = await prisma.user.upsert({
      where: {
        telegramId: normalizedTelegramId,
      },
      create: {
        telegramId: normalizedTelegramId,
        firstName: displayName,
        lastSeenAt: new Date(),
      },
      update: {
        firstName: displayName,
        lastSeenAt: new Date(),
      },
    });

    return prisma.admin.upsert({
      where: {
        userId: user.id,
      },
      create: {
        userId: user.id,
        displayName,
        role: normalizedRole,
        receivesOverdueAlerts,
        notificationChatId,
      },
      update: {
        displayName,
        isActive: true,
        role: normalizedRole,
        receivesOverdueAlerts,
        notificationChatId,
      },
      include: {
        user: true,
      },
    });
  }

  async function ensureConfiguredAdmins() {
    for (const adminConfig of BUILTIN_ADMINS) {
      await createOrUpdateAdmin({
        telegramId: adminConfig.telegramId,
        displayName: adminConfig.displayName,
        role: adminConfig.role,
        receivesOverdueAlerts: adminConfig.receivesOverdueAlerts,
        notificationChatId: adminConfig.telegramId,
      });
    }

    const admins = await listAdmins();

    serviceLogger.info(
      {
        admins: admins.map((admin) => ({
          id: admin.id,
          role: admin.role,
          telegramId: admin.user.telegramId,
        })),
      },
      'Configured admins ensured',
    );

    return admins;
  }

  async function exportDataToCsv(actorId) {
    await assertPermission(actorId, ADMIN_PERMISSIONS.EXPORT_DATA);

    const exportDir = path.resolve(process.cwd(), 'storage', 'exports');
    const users = await prisma.user.findMany({
      include: {
        registration: true,
        bookings: {
          orderBy: {
            createdAt: 'desc',
          },
          take: 1,
        },
        timers: {
          orderBy: {
            takenAt: 'desc',
          },
          take: 1,
        },
        _count: {
          select: {
            bookings: true,
            timers: true,
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    const rows = [
      [
        'user_id',
        'telegram_id',
        'username',
        'first_name',
        'last_name',
        'is_blocked',
        'blocked_reason',
        'user_created_at',
        'registration_status',
        'registration_full_name',
        'registration_phone',
        'registration_address',
        'registration_home_address',
        'registration_cdek_address',
        'registration_sizes',
        'bookings_count',
        'latest_booking_public_id',
        'latest_booking_request_type',
        'latest_booking_visit_mode',
        'latest_booking_status',
        'latest_booking_created_at',
        'latest_booking_visit_date',
        'latest_booking_slot_label',
        'latest_booking_delivery_address',
        'timers_count',
        'latest_timer_status',
        'latest_timer_taken_at',
        'latest_timer_returned_at',
        'latest_timer_reminder_sent_at',
        'latest_timer_admin_alert_sent_at',
      ],
      ...users.map((user) => {
        const latestBooking = user.bookings[0] ?? null;
        const latestTimer = user.timers[0] ?? null;

        return [
          user.id,
          user.telegramId,
          user.username ?? '',
          user.firstName ?? '',
          user.lastName ?? '',
          user.isBlocked ? 'true' : 'false',
          user.blockedReason ?? '',
          user.createdAt.toISOString(),
          user.registration?.status ?? '',
          user.registration?.fullName ?? '',
          user.registration?.phone ?? '',
          user.registration?.address ?? getRegistrationHomeAddress(user.registration),
          getRegistrationHomeAddress(user.registration),
          getRegistrationCdekAddress(user.registration),
          normalizeRegistrationSizes(user.registration?.sizes ?? ''),
          String(user._count.bookings),
          latestBooking?.publicId ?? '',
          latestBooking?.requestType ?? '',
          latestBooking?.visitMode ?? '',
          latestBooking?.status ?? '',
          latestBooking?.createdAt?.toISOString?.() ?? '',
          latestBooking?.visitDate?.toISOString?.() ?? '',
          formatSlotLabelForUser(latestBooking?.slotLabel ?? ''),
          latestBooking?.deliveryAddress ?? '',
          String(user._count.timers),
          latestTimer?.status ?? '',
          latestTimer?.takenAt?.toISOString?.() ?? '',
          latestTimer?.returnedAt?.toISOString?.() ?? '',
          latestTimer?.reminderSentAt?.toISOString?.() ?? '',
          latestTimer?.adminAlertSentAt?.toISOString?.() ?? '',
        ];
      }),
    ];

    await mkdir(exportDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `cerca-trova-export-${timestamp}.csv`;
    const filePath = path.join(exportDir, fileName);

    await writeFile(filePath, buildCsv(rows), 'utf8');

    return {
      fileName,
      filePath,
      rowsCount: users.length,
    };
  }

  return {
    assertPermission,
    createOrUpdateAdmin,
    ensureConfiguredAdmins,
    exportDataToCsv,
    getAdminByActorId,
    getAdminById,
    getAdminByTelegramId,
    getPrimaryAlertAdmin,
    hasPermission,
    isAdminByTelegramId,
    listAdmins,
  };
}

```

## src/bot/scenes/bookingScene.js
```js
import { BookingRequestType, VisitMode } from '@prisma/client';
import { Scenes } from 'telegraf';

import { BOT_TEXTS } from '../../utils/constants.js';
import { formatDate } from '../../utils/date.js';
import { AppError } from '../../utils/errors.js';
import { formatSlotLabelForUser } from '../../utils/slots.js';
import {
  BOOKING_CALLBACKS,
  BOOKING_WIZARD_BUTTONS,
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
    lines.push(`Причина: ${user.blockedReason}`);
  }

  lines.push(`Если нужна помощь: ${supportContact}`);

  return lines.join('\n');
}

async function leaveWithMainMenu(ctx, message) {
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

function buildBoutiqueConfirmationMessage(state) {
  return [
    'Проверь запись:',
    '',
    `Тип: ${getRequestTypeLabel(state.requestType)}`,
    `Бутик: ${state.boutique.name}`,
    `Дата: ${formatDate(state.visitDate, 'DD.MM.YYYY')}`,
    `Время: ${formatSlotLabelForUser(state.selectedSlot.label)}`,
    '',
    'Подтвердить?',
  ].join('\n');
}

function buildDeliveryConfirmationMessage(state) {
  const lines = [
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
    await leaveWithMainMenu(ctx, 'Сначала нажми «Регистрация».');
    return null;
  }

  return user;
}

async function promptWishStep(ctx) {
  await ctx.reply(
    'Есть пожелания?\nМожно написать или пропустить.',
    getWishKeyboard(),
  );
}

async function promptVisitModeStep(ctx) {
  await ctx.reply('Выбери формат', getVisitModeKeyboard());
}

async function promptBoutiqueStep(ctx) {
  const boutiques = await ctx.state.services.bookingService.getBoutiques();

  if (boutiques.length === 0) {
    await leaveWithMainMenu(ctx, 'Сейчас запись в бутик недоступна.');
    return false;
  }

  const state = getSceneState(ctx);
  state.boutiqueOptions = boutiques.map((boutique) => ({
    boutique,
    id: boutique.id,
    label: boutique.name,
  }));

  await ctx.reply(
    'Выбери бутик',
    getBoutiquesKeyboard(state.boutiqueOptions),
  );

  return true;
}

async function promptDateStep(ctx) {
  const state = getSceneState(ctx);
  const dateOptions = ctx.state.services.bookingService.getAvailableVisitDates(14).map((value) => ({
    code: formatDate(value, 'YYYY-MM-DD'),
    label: formatDate(value, 'DD.MM dd'),
    value,
  }));

  state.dateOptions = dateOptions;

  if (dateOptions.length === 0) {
    await leaveWithMainMenu(ctx, 'Сейчас нет доступных дат.');
    return false;
  }

  await ctx.reply(
    'Выбери день',
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
      'На этот день свободных слотов нет.',
      getDateKeyboard(state.dateOptions),
    );
    ctx.wizard.selectStep(5);
    return false;
  }

  state.slotOptions = availableSlots.map((item) => ({
    id: item.slot.id,
    label: formatSlotLabelForUser(item.slot.label),
    slot: item.slot,
  }));

  await ctx.reply(
    'Выбери время',
    getSlotKeyboard(state.slotOptions),
  );

  return true;
}

async function promptDeliveryAddressStep(ctx) {
  await ctx.reply(
    'Напиши адрес СДЭК',
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
      const user = await ensureBookingAccess(ctx);

      if (!user) {
        return undefined;
      }

      ctx.wizard.state.bookingDraft = {
        userId: user.id,
      };

      await ctx.reply('Выбери вариант', getRequestTypeKeyboard());
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
        await answerBookingCallback(ctx, 'Выбери вариант ниже.');
        await ctx.reply('Выбери вариант', getRequestTypeKeyboard());
        return undefined;
      }

      const state = getSceneState(ctx);
      state.requestType = requestType;

      await answerBookingCallback(ctx);
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
        await ctx.reply('Выбери вариант', getRequestTypeKeyboard());
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
        await ctx.reply('Можно написать пожелание или нажать «Пропустить».', getWishKeyboard());
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
        await ctx.reply('Выбери бутик', getBoutiquesKeyboard(state.boutiqueOptions ?? []));
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
        await ctx.reply('Выбери день', getDateKeyboard(state.dateOptions ?? []));
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
        await ctx.reply('Выбери время', getSlotKeyboard(state.slotOptions ?? []));
        return undefined;
      }

      state.selectedSlot = selectedSlot.slot;

      await answerBookingCallback(ctx);
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
        const prompted = await promptSlotStep(ctx);

        if (prompted) {
          ctx.wizard.selectStep(6);
        }

        return undefined;
      }

      if (getCallbackData(ctx) !== BOOKING_CALLBACKS.CONFIRM) {
        await answerBookingCallback(ctx, 'Выбери кнопку ниже.');
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
        await promptDeliveryAddressStep(ctx);
        ctx.wizard.selectStep(8);
        return undefined;
      }

      if (getCallbackData(ctx) !== BOOKING_CALLBACKS.CONFIRM) {
        await answerBookingCallback(ctx, 'Выбери кнопку ниже.');
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

## src/bot/scenes/bookingRescheduleScene.js
```js
import { BookingStatus, VisitMode } from '@prisma/client';
import { Scenes } from 'telegraf';

import { formatDate } from '../../utils/date.js';
import { AppError } from '../../utils/errors.js';
import { formatUserBookingCard } from '../../utils/formatters.js';
import { formatSlotLabelForUser } from '../../utils/slots.js';
import {
  BOOKING_CALLBACKS,
  getBookingRescheduleConfirmKeyboard,
  getBookingRescheduleDateKeyboard,
  getBookingRescheduleSlotKeyboard,
  getUserBoutiqueBookingActionsKeyboard,
} from '../keyboards/booking.js';
import { getMainMenuKeyboard } from '../keyboards/mainMenu.js';

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

function isMessageNotModifiedError(error) {
  return error?.description === 'Bad Request: message is not modified' || error?.response?.description === 'Bad Request: message is not modified';
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
  const extra = markup ?? {};

  try {
    await ctx.editMessageText(text, extra);
  } catch (error) {
    if (!isMessageNotModifiedError(error)) {
      throw error;
    }

    if (extra.reply_markup) {
      await ctx.editMessageReplyMarkup(extra.reply_markup).catch(() => undefined);
    }
  }
}

function buildBookingReferenceText(booking) {
  return [
    'Перезапись',
    `Бутик: ${booking.boutique?.name ?? booking.boutiqueAddress ?? 'Не указан'}`,
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
  await ctx.scene.leave();
  await ctx.reply(message, getMainMenuKeyboard());
}

async function promptDateStep(ctx, notice = '') {
  const state = getSceneState(ctx);
  state.dateOptions = ctx.state.services.bookingService.getAvailableVisitDates(14).map((value) => ({
    code: formatDate(value, 'YYYY-MM-DD'),
    label: formatDate(value, 'DD.MM dd'),
    value,
  }));

  if (state.dateOptions.length === 0) {
    await leaveBackToCurrentCard(ctx, notice || 'Сейчас нет доступных дат.');
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
    await promptDateStep(ctx, notice || 'На этот день свободных слотов нет.');
    ctx.wizard.selectStep(1);
    return false;
  }

  state.slotOptions = availableSlots.map((item) => ({
    id: item.slot.id,
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

## src/bot/scenes/adminSlotScene.js
```js
import { Scenes } from 'telegraf';

import { ADMIN_PERMISSIONS } from '../../utils/constants.js';
import { formatDate } from '../../utils/date.js';
import { formatAdminSlotStateList } from '../../utils/formatters.js';
import { formatSlotLabelForUser } from '../../utils/slots.js';
import {
  ADMIN_CALLBACKS,
  getAdminOptionKeyboard,
  getAdminSkipKeyboard,
} from '../keyboards/admin.js';
import {
  answerAdminCallback,
  ensureAdminSceneAccess,
  extractCallbackValue,
  getAdminText,
  leaveAdminScene,
  maybeLeaveAdminScene,
  renderAdminPanel,
} from './adminShared.js';

export const ADMIN_SLOT_SCENE_ID = 'admin-slot-scene';

const SLOT_BOUTIQUE_PREFIX = 'admin-slot:boutique:';
const SLOT_DATE_PREFIX = 'admin-slot:date:';
const SLOT_OPTION_PREFIX = 'admin-slot:slot:';

function getSceneState(ctx) {
  ctx.wizard.state.adminSlot ??= {};
  return ctx.wizard.state.adminSlot;
}

function buildDateOptions(services) {
  return services.bookingService.getAvailableVisitDates(14).map((date) => ({
    code: formatDate(date, 'YYYY-MM-DD'),
    label: formatDate(date, 'DD.MM ddd'),
    value: date,
  }));
}

function buildBoutiquePrompt(boutiques) {
  return getAdminOptionKeyboard(
    boutiques.map((boutique) => ({
      text: boutique.name,
      callbackData: `${SLOT_BOUTIQUE_PREFIX}${boutique.id}`,
    })),
  );
}

function buildDatePrompt(options) {
  return getAdminOptionKeyboard(
    options.map((option) => ({
      text: option.label,
      callbackData: `${SLOT_DATE_PREFIX}${option.code}`,
    })),
    {
      columns: 2,
    },
  );
}

function buildSlotPrompt(options) {
  return getAdminOptionKeyboard(
    options.map((option) => ({
      text: formatSlotLabelForUser(option.slot.label),
      callbackData: `${SLOT_OPTION_PREFIX}${option.slot.id}`,
    })),
  );
}

export function createAdminSlotScene() {
  return new Scenes.WizardScene(
    ADMIN_SLOT_SCENE_ID,
    async (ctx) => {
      const state = getSceneState(ctx);
      const admin = await ensureAdminSceneAccess(ctx, ADMIN_PERMISSIONS.MANAGE_SLOTS);
      const mode = ctx.scene.state?.mode === 'open' ? 'open' : 'close';
      const boutiques = await ctx.state.services.bookingService.getBoutiques();

      if (boutiques.length === 0) {
        await leaveAdminScene(ctx, admin, 'Сначала добавьте хотя бы один бутик.');
        return undefined;
      }

      state.admin = admin;
      state.mode = mode;
      state.boutiques = boutiques;

      await renderAdminPanel(
        ctx,
        mode === 'open' ? 'Выберите бутик, в котором нужно открыть слот.' : 'Выберите бутик, в котором нужно закрыть слот.',
        buildBoutiquePrompt(boutiques),
      );

      return ctx.wizard.next();
    },
    async (ctx) => {
      const state = getSceneState(ctx);

      if (await maybeLeaveAdminScene(ctx, state.admin)) {
        return undefined;
      }

      const boutiqueId = extractCallbackValue(ctx, SLOT_BOUTIQUE_PREFIX);

      if (!boutiqueId) {
        await answerAdminCallback(ctx, 'Выберите бутик кнопкой ниже.', true);
        return undefined;
      }

      const boutique = state.boutiques.find((item) => item.id === boutiqueId);

      if (!boutique) {
        await answerAdminCallback(ctx, 'Бутик не найден. Попробуйте еще раз.', true);
        return undefined;
      }

      state.boutique = boutique;
      state.dateOptions = buildDateOptions(ctx.state.services);

      await answerAdminCallback(ctx);
      await renderAdminPanel(
        ctx,
        `Бутик: ${boutique.name}\n\nВыберите дату.`,
        buildDatePrompt(state.dateOptions),
      );

      return ctx.wizard.next();
    },
    async (ctx) => {
      const state = getSceneState(ctx);

      if (await maybeLeaveAdminScene(ctx, state.admin)) {
        return undefined;
      }

      const dateCode = extractCallbackValue(ctx, SLOT_DATE_PREFIX);

      if (!dateCode) {
        await answerAdminCallback(ctx, 'Выберите дату кнопкой ниже.', true);
        return undefined;
      }

      const selectedDate = state.dateOptions.find((item) => item.code === dateCode);

      if (!selectedDate) {
        await answerAdminCallback(ctx, 'Дата не найдена. Попробуйте еще раз.', true);
        return undefined;
      }

      const allEntries = await ctx.state.services.bookingService.getAvailableSlotsByDate(
        state.boutique.id,
        selectedDate.value,
      );

      const slotEntries =
        state.mode === 'open'
          ? allEntries.filter((entry) => entry.closure)
          : allEntries;

      state.date = selectedDate.value;
      state.slotEntries = slotEntries;

      if (slotEntries.length === 0) {
        await answerAdminCallback(ctx);
        await renderAdminPanel(
          ctx,
          state.mode === 'open'
            ? 'На эту дату нет вручную закрытых слотов. Выберите другую дату.'
            : 'На эту дату нет доступных слотов для управления. Выберите другую дату.',
          buildDatePrompt(state.dateOptions),
        );
        return undefined;
      }

      await answerAdminCallback(ctx);
      await renderAdminPanel(
        ctx,
        formatAdminSlotStateList(slotEntries, selectedDate.value, state.mode),
        buildSlotPrompt(slotEntries),
      );

      return ctx.wizard.next();
    },
    async (ctx) => {
      const state = getSceneState(ctx);

      if (await maybeLeaveAdminScene(ctx, state.admin)) {
        return undefined;
      }

      const slotId = extractCallbackValue(ctx, SLOT_OPTION_PREFIX);

      if (!slotId) {
        await answerAdminCallback(ctx, 'Выберите слот кнопкой ниже.', true);
        return undefined;
      }

      const selectedEntry = state.slotEntries.find((entry) => entry.slot.id === slotId);

      if (!selectedEntry) {
        await answerAdminCallback(ctx, 'Слот не найден. Попробуйте еще раз.', true);
        return undefined;
      }

      state.selectedSlot = selectedEntry.slot;

      if (state.mode === 'open') {
        await answerAdminCallback(ctx);

        const result = await ctx.state.services.bookingService.openSlot(
          state.boutique.id,
          state.date,
          selectedEntry.slot.id,
          ctx.from.id,
        );

        if (!result) {
          await leaveAdminScene(ctx, state.admin, 'Этот слот уже открыт. Выберите другой слот или дату.');
          return undefined;
        }

        await leaveAdminScene(
          ctx,
          state.admin,
          'Слот снова доступен.',
        );
        return undefined;
      }

      await answerAdminCallback(ctx);
      await renderAdminPanel(
        ctx,
        [
          `Бутик: ${state.boutique.name}`,
          `Дата: ${formatDate(state.date, 'DD.MM.YYYY')}`,
          `Слот: ${formatSlotLabelForUser(selectedEntry.slot.label)}`,
          '',
          'Если хотите, отправьте причину закрытия одним сообщением.',
        ].join('\n'),
        getAdminSkipKeyboard('Без причины'),
      );

      return ctx.wizard.next();
    },
    async (ctx) => {
      const state = getSceneState(ctx);

      if (await maybeLeaveAdminScene(ctx, state.admin)) {
        return undefined;
      }

      let reason = null;

      if (ctx.callbackQuery?.data === ADMIN_CALLBACKS.SCENE_SKIP) {
        await answerAdminCallback(ctx);
      } else {
        reason = getAdminText(ctx);

        if (!reason) {
          await renderAdminPanel(
            ctx,
            'Отправьте причину одним сообщением или нажмите "Без причины".',
            getAdminSkipKeyboard('Без причины'),
          );
          return undefined;
        }
      }

      await ctx.state.services.bookingService.closeSlot(
        state.boutique.id,
        state.date,
        state.selectedSlot.id,
        ctx.from.id,
        reason,
      );

      await leaveAdminScene(
        ctx,
        state.admin,
        'Слот закрыт.',
      );

      return undefined;
    },
  );
}

```

## src/bot/scenes/adminTimeSlotScene.js
```js
import { Scenes } from 'telegraf';

import { ADMIN_PERMISSIONS } from '../../utils/constants.js';
import { formatSlotLabelForUser } from '../../utils/slots.js';
import {
  ADMIN_CALLBACKS,
  getAdminCancelKeyboard,
  getAdminConfirmKeyboard,
  getAdminOptionKeyboard,
} from '../keyboards/admin.js';
import {
  answerAdminCallback,
  ensureAdminSceneAccess,
  extractCallbackValue,
  getAdminText,
  leaveAdminScene,
  maybeLeaveAdminScene,
  renderAdminPanel,
} from './adminShared.js';

export const ADMIN_TIME_SLOT_SCENE_ID = 'admin-time-slot-scene';

const TIME_SLOT_BOUTIQUE_PREFIX = 'admin-time-slot:boutique:';
const TIME_SLOT_SELECT_PREFIX = 'admin-time-slot:select:';

function getSceneState(ctx) {
  ctx.wizard.state.adminTimeSlot ??= {};
  return ctx.wizard.state.adminTimeSlot;
}

function isValidTimeValue(value) {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);
}

function toMinutes(value) {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

function buildSlotLabel(startTime, endTime) {
  const compact = (value) => (value.endsWith(':00') ? value.slice(0, 2) : value);
  return `${compact(startTime)}-${compact(endTime)}`;
}

function buildSortOrder(startTime) {
  const [hours, minutes] = startTime.split(':').map(Number);
  return hours * 100 + minutes;
}

function buildBoutiquesKeyboard(boutiques) {
  return getAdminOptionKeyboard(
    boutiques.map((boutique) => ({
      text: boutique.name,
      callbackData: `${TIME_SLOT_BOUTIQUE_PREFIX}${boutique.id}`,
    })),
  );
}

function buildSlotsKeyboard(slots) {
  return getAdminOptionKeyboard(
    slots.map((slot) => ({
      text: formatSlotLabelForUser(slot.label),
      callbackData: `${TIME_SLOT_SELECT_PREFIX}${slot.id}`,
    })),
  );
}

export function createAdminTimeSlotScene() {
  return new Scenes.WizardScene(
    ADMIN_TIME_SLOT_SCENE_ID,
    async (ctx) => {
      const state = getSceneState(ctx);
      const admin = await ensureAdminSceneAccess(ctx, ADMIN_PERMISSIONS.MANAGE_TIME_SLOTS);
      const mode = ctx.scene.state?.mode === 'remove' ? 'remove' : 'add';
      const boutiques = await ctx.state.services.bookingService.getBoutiques();

      if (boutiques.length === 0) {
        await leaveAdminScene(ctx, admin, 'Сначала добавьте хотя бы один бутик.');
        return undefined;
      }

      state.admin = admin;
      state.mode = mode;
      state.boutiques = boutiques;

      await renderAdminPanel(
        ctx,
        mode === 'remove'
          ? 'Выберите бутик, из которого нужно удалить слот.'
          : 'Выберите бутик, в который нужно добавить слот.',
        buildBoutiquesKeyboard(boutiques),
      );

      return ctx.wizard.next();
    },
    async (ctx) => {
      const state = getSceneState(ctx);

      if (await maybeLeaveAdminScene(ctx, state.admin)) {
        return undefined;
      }

      const boutiqueId = extractCallbackValue(ctx, TIME_SLOT_BOUTIQUE_PREFIX);

      if (!boutiqueId) {
        await answerAdminCallback(ctx, 'Выберите бутик кнопкой ниже.', true);
        return undefined;
      }

      const boutique = state.boutiques.find((item) => item.id === boutiqueId);

      if (!boutique) {
        await answerAdminCallback(ctx, 'Бутик не найден. Попробуйте еще раз.', true);
        return undefined;
      }

      state.boutique = boutique;
      await answerAdminCallback(ctx);

      if (state.mode === 'remove') {
        const slots = await ctx.state.services.bookingService.getTimeSlots(boutique.id);

        if (slots.length === 0) {
          await leaveAdminScene(ctx, state.admin, 'В этом бутике нет активных слотов.');
          return undefined;
        }

        state.slots = slots;

        await renderAdminPanel(
          ctx,
          `Бутик: ${boutique.name}\n\nВыберите слот для удаления.`,
          buildSlotsKeyboard(slots),
        );
        ctx.wizard.selectStep(4);
        return undefined;
      }

      await renderAdminPanel(ctx, 'Отправьте время начала в формате HH:mm. Например: 11:00', getAdminCancelKeyboard());
      return ctx.wizard.next();
    },
    async (ctx) => {
      const state = getSceneState(ctx);

      if (await maybeLeaveAdminScene(ctx, state.admin)) {
        return undefined;
      }

      const startTime = getAdminText(ctx);

      if (!isValidTimeValue(startTime)) {
        await renderAdminPanel(ctx, 'Нужен формат времени HH:mm. Например: 11:00', getAdminCancelKeyboard());
        return undefined;
      }

      state.startTime = startTime;

      await renderAdminPanel(ctx, 'Теперь отправьте время окончания в формате HH:mm. Например: 12:00', getAdminCancelKeyboard());
      return ctx.wizard.next();
    },
    async (ctx) => {
      const state = getSceneState(ctx);

      if (await maybeLeaveAdminScene(ctx, state.admin)) {
        return undefined;
      }

      const endTime = getAdminText(ctx);

      if (!isValidTimeValue(endTime)) {
        await renderAdminPanel(ctx, 'Нужен формат времени HH:mm. Например: 12:00', getAdminCancelKeyboard());
        return undefined;
      }

      if (toMinutes(endTime) <= toMinutes(state.startTime)) {
        await renderAdminPanel(ctx, 'Время окончания должно быть позже времени начала.', getAdminCancelKeyboard());
        return undefined;
      }

      const slot = await ctx.state.services.bookingService.createTimeSlot(
        state.boutique.id,
        {
          label: buildSlotLabel(state.startTime, endTime),
          startTime: state.startTime,
          endTime,
          sortOrder: buildSortOrder(state.startTime),
        },
        ctx.from.id,
      );

      await leaveAdminScene(
        ctx,
        state.admin,
        `Слот успешно добавлен.\n\nБутик: ${state.boutique.name}\nСлот: ${formatSlotLabelForUser(slot.label)}`,
      );

      return undefined;
    },
    async (ctx) => {
      const state = getSceneState(ctx);

      if (await maybeLeaveAdminScene(ctx, state.admin)) {
        return undefined;
      }

      const slotId = extractCallbackValue(ctx, TIME_SLOT_SELECT_PREFIX);

      if (!slotId) {
        await answerAdminCallback(ctx, 'Выберите слот кнопкой ниже.', true);
        return undefined;
      }

      const slot = state.slots.find((item) => item.id === slotId);

      if (!slot) {
        await answerAdminCallback(ctx, 'Слот не найден. Попробуйте снова.', true);
        return undefined;
      }

      state.selectedSlot = slot;

      await answerAdminCallback(ctx);
      await renderAdminPanel(
        ctx,
        `Подтвердите удаление слота.\n\nБутик: ${state.boutique.name}\nСлот: ${formatSlotLabelForUser(slot.label)}`,
        getAdminConfirmKeyboard('Удалить слот'),
      );

      return ctx.wizard.next();
    },
    async (ctx) => {
      const state = getSceneState(ctx);

      if (await maybeLeaveAdminScene(ctx, state.admin)) {
        return undefined;
      }

      if (ctx.callbackQuery?.data !== ADMIN_CALLBACKS.SCENE_CONFIRM) {
        await answerAdminCallback(ctx, 'Подтвердите удаление кнопкой ниже.', true);
        return undefined;
      }

      await answerAdminCallback(ctx);
      await ctx.state.services.bookingService.removeTimeSlot(state.selectedSlot.id, ctx.from.id);

      await leaveAdminScene(
        ctx,
        state.admin,
        `Слот "${formatSlotLabelForUser(state.selectedSlot.label)}" деактивирован.`,
      );

      return undefined;
    },
  );
}

```
