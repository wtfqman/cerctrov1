import { google } from 'googleapis';

import {
  BOOKING_REQUEST_TYPE_LABELS,
  BOOKING_STATUS_LABELS,
  REGISTRATION_STATUS_LABELS,
  TIMER_STATUS_LABELS,
  VISIT_MODE_LABELS,
} from '../utils/constants.js';
import { formatDate } from '../utils/date.js';
import {
  getRegistrationCdekAddress,
  getRegistrationHomeAddress,
  normalizeRegistrationSizes,
} from '../utils/registration.js';
import { formatSlotLabelForUser } from '../utils/slots.js';

const GOOGLE_SHEETS_SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

const SHEET_COLUMN_DEFINITIONS = Object.freeze([
  { key: 'created_at', header: 'Когда' },
  { key: 'record_type', header: 'Событие' },
  { key: 'status', header: 'Статус' },
  { key: 'booking_public_id', header: 'ID заявки' },
  { key: 'full_name', header: 'ФИО' },
  { key: 'username', header: 'Telegram' },
  { key: 'telegram_id', header: 'Telegram ID' },
  { key: 'phone', header: 'Телефон' },
  { key: 'booking_kind', header: 'Тип заявки' },
  { key: 'visit_mode', header: 'Формат' },
  { key: 'boutique_name', header: 'Бутик' },
  { key: 'boutique_address', header: 'Адрес бутика' },
  { key: 'visit_date', header: 'Дата визита' },
  { key: 'time_slot', header: 'Время' },
  { key: 'delivery_address', header: 'Адрес доставки' },
  { key: 'home_address', header: 'Домашний адрес' },
  { key: 'cdek_address', header: 'Адрес СДЭК' },
  { key: 'sizes', header: 'Размеры' },
  { key: 'wish_text', header: 'Пожелания' },
  { key: 'taken_at', header: 'Выдача образов' },
  { key: 'returned_at', header: 'Возврат образов' },
  { key: 'reminder_5d_sent_at', header: 'Напоминание 5 дней' },
  { key: 'overdue_8d_sent_at', header: 'Уведомление 8 дней' },
  { key: 'admin_action', header: 'Действие админа' },
  { key: 'admin_id', header: 'Admin ID' },
  { key: 'comment', header: 'Комментарий' },
  { key: 'pdf_file_id', header: 'PDF' },
  { key: 'user_id', header: 'User ID' },
]);

const SHEET_COLUMNS = Object.freeze(SHEET_COLUMN_DEFINITIONS.map((column) => column.key));
const SHEET_HEADERS = Object.freeze(SHEET_COLUMN_DEFINITIONS.map((column) => column.header));

const RECORD_TYPE_LABELS = Object.freeze({
  admin_action: 'Действие администратора',
  boutique_booking: 'Заявка в бутик',
  delivery_booking: 'Заявка на доставку',
  registration: 'Регистрация',
  registration_update: 'Обновление регистрации',
  timer_event: 'Событие таймера',
});

const TIMER_EVENT_LABELS = Object.freeze({
  overdue_8d_sent: 'Отправлено уведомление 8 дней',
  reminder_5d_sent: 'Отправлено напоминание 5 дней',
  timer_returned: 'Возврат отмечен',
  timer_started: 'Таймер запущен',
});

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

function formatSheetDateTime(value) {
  if (!value) {
    return '';
  }

  return formatDate(value, 'DD.MM.YYYY HH:mm');
}

function formatSheetDate(value) {
  if (!value) {
    return '';
  }

  return formatDate(value, 'DD.MM.YYYY');
}

function normalizeCellValue(value) {
  if (value === null || value === undefined) {
    return '';
  }

  if (value instanceof Date) {
    return formatSheetDateTime(value);
  }

  if (Array.isArray(value)) {
    return value.filter(Boolean).join(', ');
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value);
}

function formatCommentValue(value) {
  return normalizeCellValue(value)
    .replace(/\r?\n/g, ' / ')
    .trim();
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

function humanizeCode(value) {
  const normalizedValue = String(value ?? '').trim();

  if (!normalizedValue) {
    return '';
  }

  const text = normalizedValue.replace(/_/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function normalizeEnumKey(value) {
  return String(value ?? '').trim().toUpperCase();
}

function formatRecordType(value) {
  const normalizedValue = String(value ?? '').trim();
  return RECORD_TYPE_LABELS[normalizedValue] ?? humanizeCode(normalizedValue);
}

function formatBookingKind(value) {
  const normalizedValue = normalizeEnumKey(value);
  return BOOKING_REQUEST_TYPE_LABELS[normalizedValue] ?? humanizeCode(value);
}

function formatVisitMode(value) {
  const normalizedValue = normalizeEnumKey(value);
  return VISIT_MODE_LABELS[normalizedValue] ?? humanizeCode(value);
}

function formatStatus(value) {
  const normalizedValue = normalizeEnumKey(value);

  return (
    BOOKING_STATUS_LABELS[normalizedValue] ??
    REGISTRATION_STATUS_LABELS[normalizedValue] ??
    TIMER_STATUS_LABELS[normalizedValue] ??
    humanizeCode(value)
  );
}

function formatTimerEvent(event, fallbackStatus = '') {
  if (event) {
    return TIMER_EVENT_LABELS[event] ?? humanizeCode(event);
  }

  return fallbackStatus ? formatStatus(fallbackStatus) : '';
}

export function createGoogleSheetsService({ env, logger }) {
  const serviceLogger = logger.child({ service: 'googleSheets' });
  const isConfigured = Boolean(env.GOOGLE_SHEETS_ENABLED);
  const lastColumnLetter = toColumnLetter(SHEET_COLUMNS.length - 1);
  const headerRange = formatSheetRange(env.GOOGLE_SHEET_NAME, `A1:${lastColumnLetter}1`);
  const valuesRange = formatSheetRange(env.GOOGLE_SHEET_NAME, `A:${lastColumnLetter}`);

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
        currentHeader.length === SHEET_HEADERS.length &&
        SHEET_HEADERS.every((column, index) => currentHeader[index] === column);

      if (!matches) {
        if (currentHeader.length === 0) {
          serviceLogger.info({ sheetName: env.GOOGLE_SHEET_NAME }, 'Google Sheets header is empty, creating it');
        } else {
          serviceLogger.warn(
            {
              currentHeader,
              expectedHeader: SHEET_HEADERS,
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
            values: [SHEET_HEADERS],
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

  async function clearSheetData() {
    if (!isConfigured) {
      return {
        clearedRows: 0,
        message: 'Google Sheets integration is disabled',
        ok: true,
        skipped: true,
      };
    }

    const ready = await init();

    if (!ready) {
      return {
        clearedRows: 0,
        message: 'Google Sheets is not initialized',
        ok: false,
      };
    }

    const sheets = await getSheetsClient();

    try {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: env.GOOGLE_SHEETS_SPREADSHEET_ID,
        range: valuesRange,
      });

      const values = response.data.values ?? [];
      const clearedRows = values.slice(1).filter(hasAnyValue).length;

      await sheets.spreadsheets.values.clear({
        spreadsheetId: env.GOOGLE_SHEETS_SPREADSHEET_ID,
        range: valuesRange,
      });

      await ensureHeader();

      return {
        clearedRows,
        ok: true,
      };
    } catch (error) {
      state.initialized = false;

      serviceLogger.error(
        {
          err: error,
          errorMessage: extractGoogleError(error),
          sheetName: env.GOOGLE_SHEET_NAME,
        },
        'Failed to clear Google Sheets data',
      );

      return {
        clearedRows: 0,
        message: extractGoogleError(error),
        ok: false,
      };
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
      created_at: formatSheetDateTime(registration?.updatedAt ?? registration?.createdAt ?? new Date()),
      record_type: formatRecordType('registration'),
      status: formatStatus(registration?.status ?? ''),
      full_name: registration?.fullName ?? buildFullName(user),
      username: registration?.telegramUsername ?? user?.username ?? '',
      telegram_id: user?.telegramId ?? '',
      phone: registration?.phone ?? user?.phone ?? '',
      home_address: homeAddress,
      cdek_address: cdekAddress,
      sizes: normalizeRegistrationSizes(registration?.sizes ?? ''),
      comment: formatCommentValue(comment),
      pdf_file_id: pdfFileId,
      user_id: user?.id ?? registration?.userId ?? '',
    };

    return appendRow(row);
  }

  async function logRegistrationUpdate({
    registration,
    user,
    field,
    fieldLabel = '',
    oldValue = '',
    newValue = '',
    comment = '',
  }) {
    const homeAddress = getRegistrationHomeAddress(registration);
    const cdekAddress = getRegistrationCdekAddress(registration);

    const row = {
      created_at: formatSheetDateTime(new Date()),
      record_type: formatRecordType('registration_update'),
      status: formatStatus(registration?.status ?? ''),
      full_name: registration?.fullName ?? buildFullName(user),
      username: registration?.telegramUsername ?? user?.username ?? '',
      telegram_id: user?.telegramId ?? '',
      phone: registration?.phone ?? user?.phone ?? '',
      home_address: homeAddress,
      cdek_address: cdekAddress,
      sizes: normalizeRegistrationSizes(registration?.sizes ?? ''),
      comment: buildComment(
        field ? `Поле: ${fieldLabel || field}` : '',
        `Было: ${formatCommentValue(oldValue) || 'пусто'}`,
        `Стало: ${formatCommentValue(newValue) || 'пусто'}`,
        comment,
      ),
      user_id: user?.id ?? registration?.userId ?? '',
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
      created_at: formatSheetDateTime(booking?.createdAt ?? new Date()),
      record_type: formatRecordType(bookingType),
      status: formatStatus(booking?.status ?? ''),
      booking_public_id: booking?.publicId ?? '',
      full_name: buildFullName(booking?.user),
      username: booking?.user?.registration?.telegramUsername ?? booking?.user?.username ?? '',
      telegram_id: booking?.user?.telegramId ?? '',
      phone: booking?.contactPhone ?? booking?.user?.registration?.phone ?? booking?.user?.phone ?? '',
      booking_kind: formatBookingKind(booking?.requestType),
      visit_mode: formatVisitMode(visitMode || booking?.visitMode),
      boutique_name: booking?.boutique?.name ?? '',
      boutique_address: boutiqueAddress,
      visit_date: formatSheetDate(booking?.visitDate),
      time_slot: formatSlotLabelForUser(booking?.slotLabel ?? booking?.timeSlot?.label),
      delivery_address: booking?.deliveryAddress ?? '',
      wish_text: formatCommentValue(booking?.wishText ?? ''),
      comment: formatCommentValue(comment),
      pdf_file_id: pdfFileId,
      user_id: booking?.user?.id ?? booking?.userId ?? '',
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
      created_at: formatSheetDateTime(new Date()),
      record_type: formatRecordType('timer_event'),
      status: formatTimerEvent(event, timer?.status),
      booking_public_id: timer?.booking?.publicId ?? '',
      full_name: buildFullName(resolvedUser),
      username: resolvedUser?.registration?.telegramUsername ?? resolvedUser?.username ?? '',
      telegram_id: resolvedUser?.telegramId ?? '',
      phone: resolvedUser?.registration?.phone ?? resolvedUser?.phone ?? '',
      booking_kind: formatBookingKind(timer?.booking?.requestType),
      visit_mode: formatVisitMode(timer?.booking?.visitMode),
      boutique_name: timer?.booking?.boutique?.name ?? '',
      boutique_address: bookingBoutiqueAddress,
      visit_date: formatSheetDate(timer?.booking?.visitDate),
      time_slot: formatSlotLabelForUser(timer?.booking?.slotLabel ?? timer?.booking?.timeSlot?.label),
      delivery_address: timer?.booking?.deliveryAddress ?? '',
      taken_at: formatSheetDateTime(timer?.takenAt),
      returned_at: formatSheetDateTime(timer?.returnedAt),
      reminder_5d_sent_at: formatSheetDateTime(timer?.reminderSentAt),
      overdue_8d_sent_at: formatSheetDateTime(timer?.adminAlertSentAt),
      admin_id: adminId,
      comment: buildComment(timer?.note ? `Примечание: ${formatCommentValue(timer.note)}` : '', comment),
      pdf_file_id: pdfFileId,
      user_id: resolvedUser?.id ?? timer?.userId ?? '',
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
      created_at: formatSheetDateTime(new Date()),
      record_type: formatRecordType('admin_action'),
      status: formatStatus(status),
      full_name: buildFullName(targetUser),
      username: targetUser?.registration?.telegramUsername ?? targetUser?.username ?? '',
      telegram_id: targetUser?.telegramId ?? '',
      phone: targetUser?.registration?.phone ?? targetUser?.phone ?? '',
      admin_action: humanizeCode(action),
      admin_id: adminId,
      comment: formatCommentValue(comment),
      pdf_file_id: pdfFileId,
      user_id: targetUser?.id ?? '',
    };

    return appendRow(row);
  }

  return {
    SHEET_COLUMNS,
    SHEET_HEADERS,
    appendRow,
    appendRows,
    clearSheetData,
    ensureSheetExists,
    ensureHeader,
    findRowsByTelegramId,
    getAllRows,
    init,
    isConfigured,
    logAdminAction,
    logBooking,
    logRegistration,
    logRegistrationUpdate,
    logTimerEvent,
  };
}
