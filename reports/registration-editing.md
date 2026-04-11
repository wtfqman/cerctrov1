# Registration Editing Changes

src/utils/constants.js
```js
export const MENU_BUTTONS = Object.freeze({
  REGISTRATION: 'Регистрация',
  MY_DATA: 'Мои данные',
  BOOKING: 'Записаться',
  MY_BOOKINGS: 'Мои заявки',
  TAKE_ITEMS: 'Взял образы',
  RETURN_ITEMS: 'Сдал образы',
  MAIN_MENU: 'Главное меню',
});

export const MAIN_MENU_LAYOUT = [
  [MENU_BUTTONS.REGISTRATION],
  [MENU_BUTTONS.BOOKING],
  [MENU_BUTTONS.TAKE_ITEMS],
  [MENU_BUTTONS.RETURN_ITEMS],
  [MENU_BUTTONS.MY_BOOKINGS],
];

export const BOT_TEXTS = Object.freeze({
  START_NEW_USER:
    'Привет! 👋\nЭто бот Cerca Trova.\n\nСначала нужно заполнить регистрацию.\nНажми «Регистрация».',
  START_REGISTERED:
    'Привет! 👋\n\nВыбери нужный раздел ниже.',
  MENU_HINT: 'Выбери нужный раздел ниже.',
  BLOCKED:
    'Сейчас доступ временно ограничен.',
  FEATURE_IN_PROGRESS:
    'Скоро будет.',
  REGISTRATION_SIZE_TEMPLATE:
    'Теперь размеры.\nОтправь их одним сообщением по шаблону:\n\nСорочка:\nПиджак:\nБрюки:\nТрикотаж:\nКостюм классика:\nКостюм power suit:',
  REGISTRATION_DONE:
    'Готово 💫\nРегистрация сохранена.',
  PDF_MISSING:
    'Бланк пока не загружен.\nЕсли он нужен срочно, напиши администратору.',
  ADMIN_ONLY: 'Админское меню доступно только администраторам.',
});

export const REGISTRATION_STATUS_LABELS = Object.freeze({
  PENDING: 'Ожидает проверки',
  APPROVED: 'Подтверждена',
  REJECTED: 'Отклонена',
  ARCHIVED: 'В архиве',
});

export const BOOKING_REQUEST_TYPE_LABELS = Object.freeze({
  RETURN: 'Возврат',
  PICKUP: 'Забор',
  RETURN_PICKUP: 'Возврат + Забор',
});

export const VISIT_MODE_LABELS = Object.freeze({
  BOUTIQUE: 'Бутик',
  DELIVERY: 'Доставка',
});

export const BOOKING_STATUS_LABELS = Object.freeze({
  CREATED: 'Создана',
  SUBMITTED: 'Отправлена',
  CANCELLED: 'Отменена',
  COMPLETED: 'Завершена',
});

export const TIMER_STATUS_LABELS = Object.freeze({
  ACTIVE: 'Активен',
  RETURNED: 'Возвращен',
  OVERDUE: 'Просрочен',
});

export const ADMIN_ROLES = Object.freeze({
  FULL: 'FULL',
  LIMITED: 'LIMITED',
});

export const ADMIN_ROLE_LABELS = Object.freeze({
  [ADMIN_ROLES.FULL]: 'super_admin',
  [ADMIN_ROLES.LIMITED]: 'operator_admin',
});

export const ROOT_ADMIN_TELEGRAM_ID = '1731711996';

export const ADMIN_PERMISSIONS = Object.freeze({
  VIEW_BOOKINGS: 'view_bookings',
  VIEW_DEBTORS: 'view_debtors',
  MANAGE_SLOTS: 'manage_slots',
  MANAGE_USERS: 'manage_users',
  EXPORT_DATA: 'export_data',
  MANAGE_BOUTIQUES: 'manage_boutiques',
  MANAGE_TIME_SLOTS: 'manage_time_slots',
  MANAGE_PDFS: 'manage_pdfs',
});

export const ADMIN_ROLE_PERMISSIONS = Object.freeze({
  [ADMIN_ROLES.FULL]: [
    ADMIN_PERMISSIONS.VIEW_BOOKINGS,
    ADMIN_PERMISSIONS.VIEW_DEBTORS,
    ADMIN_PERMISSIONS.MANAGE_SLOTS,
    ADMIN_PERMISSIONS.MANAGE_USERS,
    ADMIN_PERMISSIONS.EXPORT_DATA,
    ADMIN_PERMISSIONS.MANAGE_BOUTIQUES,
    ADMIN_PERMISSIONS.MANAGE_TIME_SLOTS,
    ADMIN_PERMISSIONS.MANAGE_PDFS,
  ],
  [ADMIN_ROLES.LIMITED]: [
    ADMIN_PERMISSIONS.VIEW_BOOKINGS,
    ADMIN_PERMISSIONS.MANAGE_SLOTS,
  ],
});

export const PDF_TEMPLATE_KEYS = Object.freeze({
  REGISTRATION_WELCOME: 'registration_welcome_pdf',
});

export const BUILTIN_ADMINS = Object.freeze([
  {
    telegramId: ROOT_ADMIN_TELEGRAM_ID,
    displayName: 'Root Admin',
    role: ADMIN_ROLES.FULL,
    receivesOverdueAlerts: true,
  },
]);

export const AUDIT_ACTIONS = Object.freeze({
  USER_BLOCKED: 'user_blocked',
  USER_UNBLOCKED: 'user_unblocked',
  REGISTRATION_UPDATED: 'registration_updated',
  BOUTIQUE_CREATED: 'boutique_created',
  BOUTIQUE_REMOVED: 'boutique_removed',
  BOUTIQUE_BOOKING_EMAIL_FAILED: 'boutique_booking_email_failed',
  TIME_SLOT_CREATED: 'time_slot_created',
  TIME_SLOT_REMOVED: 'time_slot_removed',
  SLOT_CLOSED: 'slot_closed',
  SLOT_OPENED: 'slot_opened',
  VIEW_RECENT_BOOKINGS: 'view_recent_bookings',
  VIEW_TODAY_BOOKINGS: 'view_today_bookings',
  VIEW_DEBTORS: 'view_debtors',
  PDF_UPLOADED: 'pdf_uploaded',
  DATA_EXPORTED: 'data_exported',
  ADMIN_CREATED: 'admin_created',
  ADMIN_ROLE_UPDATED: 'admin_role_updated',
  ADMIN_DEACTIVATED: 'admin_deactivated',
});

export const DEFAULT_BOUTIQUES = Object.freeze([
  {
    city: 'Москва',
    code: 'YAKIMANKA_19',
    name: 'Большая Якиманка, 19 МСК',
    addressLine1: 'Большая Якиманка, 19',
    ccEmails: null,
    email: null,
  },
  {
    city: 'Москва',
    code: 'KRASNAYA_PRESNYA_21',
    name: 'Красная Пресня, 21 МСК',
    addressLine1: 'Красная Пресня, 21',
    ccEmails: null,
    email: null,
  },
  {
    city: 'Москва',
    code: 'LYALIN_24_26',
    name: 'Лялин Переулок 24-26с2а МСК',
    addressLine1: 'Лялин Переулок 24-26с2а',
    ccEmails: null,
    email: null,
  },
  {
    city: 'Санкт-Петербург',
    code: 'MOISEENKO_22',
    name: 'Моисеенко 22лит3 СПБ',
    addressLine1: 'Моисеенко 22лит3',
    ccEmails: null,
    email: null,
  },
]);

export const DEFAULT_TIME_SLOTS = Object.freeze([
  {
    label: '11-12',
    startTime: '11:00',
    endTime: '12:00',
    sortOrder: 10,
  },
  {
    label: '12-13',
    startTime: '12:00',
    endTime: '13:00',
    sortOrder: 20,
  },
  {
    label: '13-14',
    startTime: '13:00',
    endTime: '14:00',
    sortOrder: 30,
  },
  {
    label: '14-15',
    startTime: '14:00',
    endTime: '15:00',
    sortOrder: 40,
  },
  {
    label: '15-16',
    startTime: '15:00',
    endTime: '16:00',
    sortOrder: 50,
  },
]);
```

src/utils/registrationEdit.js
```js
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
```

src/services/registrationService.js
```js
import { DocumentKind, Prisma, RegistrationStatus } from '@prisma/client';

import { AUDIT_ACTIONS, BOT_TEXTS } from '../utils/constants.js';
import { ValidationError } from '../utils/errors.js';
import { formatRegistrationDetails } from '../utils/formatters.js';
import {
  getRegistrationCdekAddress,
  getRegistrationHomeAddress,
  normalizeRegistrationSizes,
  parseRegistrationSizes,
} from '../utils/registration.js';
import { getRegistrationEditableField } from '../utils/registrationEdit.js';
import { ensureNonEmptyString, ensureTelegramUser as ensureTelegramUserPayload } from '../utils/validators.js';

function normalizeTelegramUsername(value, fallbackUsername = null) {
  const rawValue = typeof value === 'string' ? value.trim() : '';
  const resolved = rawValue || (fallbackUsername ? String(fallbackUsername).trim() : '');

  if (!resolved) {
    throw new ValidationError('Напиши ник в Telegram.', { field: 'telegramUsername' });
  }

  return resolved.startsWith('@') ? resolved : `@${resolved}`;
}

function normalizePhone(value) {
  return ensureNonEmptyString(value, 'Телефон');
}

function getRegistrationFieldValue(registration, fieldKey) {
  if (!registration) {
    return '';
  }

  if (fieldKey === 'homeAddress') {
    return getRegistrationHomeAddress(registration);
  }

  if (fieldKey === 'cdekAddress') {
    return getRegistrationCdekAddress(registration);
  }

  if (fieldKey === 'sizes') {
    return normalizeRegistrationSizes(registration.sizes);
  }

  return typeof registration[fieldKey] === 'string' ? registration[fieldKey].trim() : '';
}

function normalizeUpdatedRegistrationValue(fieldKey, value) {
  if (fieldKey === 'fullName') {
    return ensureNonEmptyString(value, 'ФИО');
  }

  if (fieldKey === 'phone') {
    return normalizePhone(value);
  }

  if (fieldKey === 'telegramUsername') {
    return normalizeTelegramUsername(value);
  }

  if (fieldKey === 'homeAddress') {
    return ensureNonEmptyString(value, 'Домашний адрес');
  }

  if (fieldKey === 'cdekAddress') {
    return ensureNonEmptyString(value, 'Адрес СДЭК');
  }

  if (fieldKey === 'sizes') {
    const rawSizes = ensureNonEmptyString(value, 'Размеры');
    const parsedSizes = parseRegistrationSizes(rawSizes);

    if (!parsedSizes.hasStructuredData) {
      throw new ValidationError(
        'Заполни размеры по шаблону ниже, чтобы я показал их аккуратно по полям.',
        { field: 'sizes' },
      );
    }

    return parsedSizes.normalizedText || parsedSizes.rawText;
  }

  throw new ValidationError('Это поле нельзя изменить.', { field: fieldKey });
}

function buildRegistrationUpdateData(fieldKey, value) {
  if (fieldKey === 'homeAddress') {
    return {
      address: value,
      homeAddress: value,
    };
  }

  return {
    [fieldKey]: value,
  };
}

function buildUserUpdateData(fieldKey, value) {
  if (fieldKey === 'phone') {
    return {
      phone: value,
    };
  }

  if (fieldKey === 'telegramUsername') {
    return {
      username: value.replace(/^@/, ''),
    };
  }

  return {};
}

function isUniqueConstraintError(error, fieldName) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002' &&
    Array.isArray(error.meta?.target) &&
    error.meta.target.includes(fieldName)
  );
}

export function createRegistrationService({ prisma, logger, googleSheets, pdfStorage }) {
  const serviceLogger = logger.child({ service: 'registration' });

  async function ensureTelegramUser(telegramUser) {
    const payload = ensureTelegramUserPayload(telegramUser);

    return prisma.user.upsert({
      where: {
        telegramId: String(payload.id),
      },
      create: {
        telegramId: String(payload.id),
        username: payload.username ?? null,
        firstName: payload.first_name ?? null,
        lastName: payload.last_name ?? null,
        languageCode: payload.language_code ?? null,
        isBot: payload.is_bot ?? false,
        lastSeenAt: new Date(),
      },
      update: {
        username: payload.username ?? null,
        firstName: payload.first_name ?? null,
        lastName: payload.last_name ?? null,
        languageCode: payload.language_code ?? null,
        isBot: payload.is_bot ?? false,
        lastSeenAt: new Date(),
      },
    });
  }

  async function getRegistrationByUserId(userId) {
    return prisma.registration.findUnique({
      where: { userId },
    });
  }

  async function isRegistered(userId) {
    const registration = await getRegistrationByUserId(userId);
    return Boolean(registration);
  }

  async function getRegistrationSummary(userId) {
    const registration = await getRegistrationByUserId(userId);

    if (!registration) {
      return {
        exists: false,
        message: 'Регистрация не заполнена.',
        registration: null,
        status: null,
      };
    }

    return {
      exists: true,
      message: 'Данные уже сохранены.',
      registration,
      status: registration.status,
    };
  }

  async function getRegistrationDetails(userId) {
    const registration = await getRegistrationByUserId(userId);

    if (!registration) {
      return {
        exists: false,
        message: 'Регистрация не заполнена.',
        registration: null,
      };
    }

    return {
      exists: true,
      message: formatRegistrationDetails(registration),
      registration,
    };
  }

  async function registerUser({
    userId,
    fullName,
    phone,
    telegramUsername,
    homeAddress,
    cdekAddress,
    address,
    sizes,
    telegramProfileUsername = null,
  }) {
    const resolvedHomeAddress = ensureNonEmptyString(homeAddress ?? address, 'Домашний адрес');
    const resolvedCdekAddress = ensureNonEmptyString(cdekAddress ?? address, 'Адрес СДЭК');

    const normalizedData = {
      address: resolvedHomeAddress,
      cdekAddress: resolvedCdekAddress,
      fullName: ensureNonEmptyString(fullName, 'ФИО'),
      homeAddress: resolvedHomeAddress,
      phone: normalizePhone(phone),
      sizes: normalizeRegistrationSizes(ensureNonEmptyString(sizes, 'Размеры')),
      telegramUsername: normalizeTelegramUsername(telegramUsername, telegramProfileUsername),
    };

    const existingRegistration = await prisma.registration.findUnique({
      where: { userId },
    });

    if (existingRegistration) {
      throw new ValidationError('Твои данные уже сохранены.', {
        field: 'registration',
      });
    }

    try {
      const registration = await prisma.$transaction(async (tx) => {
        const duplicatePhone = await tx.registration.findFirst({
          where: {
            phone: normalizedData.phone,
            NOT: {
              userId,
            },
          },
        });

        if (duplicatePhone) {
          throw new ValidationError('Этот номер уже есть в другой регистрации.', { field: 'phone' });
        }

        const registrationRecord = await tx.registration.create({
          data: {
            userId,
            status: RegistrationStatus.APPROVED,
            fullName: normalizedData.fullName,
            phone: normalizedData.phone,
            telegramUsername: normalizedData.telegramUsername,
            address: normalizedData.address,
            homeAddress: normalizedData.homeAddress,
            cdekAddress: normalizedData.cdekAddress,
            sizes: normalizedData.sizes,
            approvedAt: new Date(),
          },
        });

        await tx.user.update({
          where: { id: userId },
          data: {
            phone: normalizedData.phone,
            username: normalizedData.telegramUsername.replace(/^@/, ''),
          },
        });

        return registrationRecord;
      });

      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          registration: true,
        },
      });

      if (user) {
        const sheetsResult = await googleSheets.logRegistration({
          registration: {
            ...registration,
            cdekAddress: getRegistrationCdekAddress(registration),
            homeAddress: getRegistrationHomeAddress(registration),
            sizes: normalizeRegistrationSizes(registration.sizes),
          },
          user,
        });

        if (!sheetsResult?.ok) {
          serviceLogger.warn(
            {
              registrationId: registration.id,
              userId,
            },
            'Registration was saved locally, but Google Sheets logging failed',
          );
        }
      }

      serviceLogger.info({ registrationId: registration.id, userId }, 'Registration created');

      return registration;
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }

      if (isUniqueConstraintError(error, 'phone')) {
        throw new ValidationError('Этот номер уже есть в другой регистрации.', { field: 'phone' });
      }

      throw error;
    }
  }

  async function updateRegistrationField({ userId, field, value }) {
    const fieldConfig = getRegistrationEditableField(field);

    if (!fieldConfig) {
      throw new ValidationError('Это поле нельзя изменить.', { field });
    }

    const [registration, user] = await Promise.all([
      prisma.registration.findUnique({
        where: { userId },
      }),
      prisma.user.findUnique({
        where: { id: userId },
      }),
    ]);

    if (!registration) {
      throw new ValidationError('Сначала заполни регистрацию.', {
        field: 'registration',
      });
    }

    if (!user) {
      throw new ValidationError('Пользователь не найден.', {
        field: 'user',
      });
    }

    const oldValue = getRegistrationFieldValue(registration, fieldConfig.key);
    const normalizedValue = normalizeUpdatedRegistrationValue(fieldConfig.key, value);

    if (oldValue === normalizedValue) {
      return {
        changed: false,
        field: fieldConfig.key,
        fieldLabel: fieldConfig.label,
        newValue: normalizedValue,
        oldValue,
        registration,
      };
    }

    try {
      const updatedRegistration = await prisma.$transaction(async (tx) => {
        if (fieldConfig.key === 'phone') {
          const duplicatePhone = await tx.registration.findFirst({
            where: {
              phone: normalizedValue,
              NOT: {
                userId,
              },
            },
          });

          if (duplicatePhone) {
            throw new ValidationError('Этот номер уже есть в другой регистрации.', { field: 'phone' });
          }
        }

        await tx.registration.update({
          where: { userId },
          data: buildRegistrationUpdateData(fieldConfig.key, normalizedValue),
        });

        const userUpdateData = buildUserUpdateData(fieldConfig.key, normalizedValue);

        if (Object.keys(userUpdateData).length > 0) {
          await tx.user.update({
            where: { id: userId },
            data: userUpdateData,
          });
        }

        await tx.auditLog.create({
          data: {
            action: AUDIT_ACTIONS.REGISTRATION_UPDATED,
            actorType: 'USER',
            entityType: 'Registration',
            entityId: registration.id,
            message: `Пользователь обновил поле "${fieldConfig.label}"`,
            metadata: JSON.stringify({
              changedAt: new Date().toISOString(),
              field: fieldConfig.key,
              fieldLabel: fieldConfig.label,
              newValue: normalizedValue,
              oldValue,
              telegramId: user.telegramId,
            }),
            userId,
          },
        });

        return tx.registration.findUnique({
          where: { userId },
        });
      });

      const updatedUser = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          registration: true,
        },
      });

      if (updatedRegistration && updatedUser) {
        const sheetsResult = await googleSheets.logRegistrationUpdate({
          field: fieldConfig.key,
          fieldLabel: fieldConfig.label,
          newValue: normalizedValue,
          oldValue,
          registration: updatedRegistration,
          user: updatedUser,
        });

        if (!sheetsResult?.ok) {
          serviceLogger.warn(
            {
              field: fieldConfig.key,
              registrationId: updatedRegistration.id,
              userId,
            },
            'Registration update was saved locally, but Google Sheets logging failed',
          );
        }
      }

      if (updatedRegistration) {
        serviceLogger.info(
          {
            field: fieldConfig.key,
            registrationId: updatedRegistration.id,
            userId,
          },
          'Registration updated',
        );
      }

      return {
        changed: true,
        field: fieldConfig.key,
        fieldLabel: fieldConfig.label,
        newValue: normalizedValue,
        oldValue,
        registration: updatedRegistration,
      };
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }

      if (isUniqueConstraintError(error, 'phone')) {
        throw new ValidationError('Этот номер уже есть в другой регистрации.', { field: 'phone' });
      }

      throw error;
    }
  }

  async function sendRegistrationPdf({ userId, chatId, telegram }) {
    const template = await pdfStorage.getActiveRegistrationTemplate();

    if (!template?.telegramFileId) {
      return {
        message: BOT_TEXTS.PDF_MISSING,
        sent: false,
      };
    }

    try {
      await telegram.sendDocument(chatId, template.telegramFileId);
    } catch (error) {
      serviceLogger.error(
        {
          err: error,
          templateId: template.id,
          userId,
        },
        'Failed to send registration PDF',
      );

      return {
        message: BOT_TEXTS.PDF_MISSING,
        sent: false,
      };
    }

    await pdfStorage.saveUserPdf({
      userId,
      templateId: template.id,
      documentKind: DocumentKind.REGISTRATION_FORM,
      fileName: template.fileName ?? 'registration.pdf',
      storagePath: template.storagePath,
      telegramFileId: template.telegramFileId,
      externalUrl: template.telegramFileId,
    });

    await prisma.registration.update({
      where: { userId },
      data: {
        pdfSentAt: new Date(),
      },
    });

    return {
      message: 'PDF отправлен.',
      sent: true,
    };
  }

  return {
    ensureTelegramUser,
    getRegistrationByUserId,
    getRegistrationDetails,
    getRegistrationSummary,
    isRegistered,
    registerUser,
    sendRegistrationPdf,
    updateRegistrationField,
  };
}
```

src/services/googleSheets.js
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
      created_at: new Date(),
      type: 'registration_update',
      user_id: user?.id ?? registration?.userId ?? '',
      telegram_id: user?.telegramId ?? '',
      username: registration?.telegramUsername ?? user?.username ?? '',
      full_name: registration?.fullName ?? buildFullName(user),
      phone: registration?.phone ?? user?.phone ?? '',
      address: homeAddress,
      sizes: normalizeRegistrationSizes(registration?.sizes ?? ''),
      status: registration?.status ?? '',
      comment: buildComment(
        field ? `field: ${fieldLabel || field}` : '',
        `old_value: ${formatCommentValue(oldValue) || 'пусто'}`,
        `new_value: ${formatCommentValue(newValue) || 'пусто'}`,
        cdekAddress ? `cdek_address: ${cdekAddress}` : '',
        comment,
      ),
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
    logRegistrationUpdate,
    logTimerEvent,
  };
}
```

src/bot/keyboards/registration.js
```js
import { Markup } from 'telegraf';

export const REGISTRATION_BUTTONS = Object.freeze({
  BACK: 'Назад',
  CANCEL: 'Отмена',
  CONFIRM: 'Подтвердить',
  RESTART: 'Заполнить заново',
  USE_PROFILE_USERNAME: 'Мой @username',
});

export const REGISTRATION_EDIT_CALLBACKS = Object.freeze({
  OVERVIEW_EDIT: 'registration:edit:overview',
  OVERVIEW_BACK: 'registration:back',
  FIELD_PREFIX: 'registration:edit:field:',
  FIELDS_BACK: 'registration:edit:fields:back',
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

export function getRegistrationOverviewKeyboard() {
  return buildInlineKeyboard([
    [callbackButton('Изменить данные', REGISTRATION_EDIT_CALLBACKS.OVERVIEW_EDIT)],
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
```

src/bot/scenes/sceneIds.js
```js
export const REGISTRATION_SCENE_ID = 'registration-scene';
export const REGISTRATION_EDIT_SCENE_ID = 'registration-edit-scene';
```

src/bot/scenes/registrationEditScene.js
```js
import { Scenes } from 'telegraf';

import { BOT_TEXTS } from '../../utils/constants.js';
import { ValidationError } from '../../utils/errors.js';
import { formatRegistrationSizes, getRegistrationCdekAddress, getRegistrationHomeAddress } from '../../utils/registration.js';
import { REGISTRATION_EDITABLE_FIELDS, getRegistrationEditableField } from '../../utils/registrationEdit.js';
import {
  isMessageNotModifiedError,
  isUnavailableMessageError,
  normalizeInlineMarkup,
} from '../utils/inlineKeyboard.js';
import {
  getRegistrationEditFieldsKeyboard,
  getRegistrationEditPromptKeyboard,
  getRegistrationOverviewKeyboard,
  REGISTRATION_EDIT_CALLBACKS,
} from '../keyboards/registration.js';
import { getMainMenuKeyboard } from '../keyboards/mainMenu.js';
import { REGISTRATION_EDIT_SCENE_ID, REGISTRATION_SCENE_ID } from './sceneIds.js';

export { REGISTRATION_EDIT_SCENE_ID };

function getSceneState(ctx) {
  ctx.wizard.state.registrationEdit ??= {};
  return ctx.wizard.state.registrationEdit;
}

function getMessageText(ctx) {
  return ctx.message?.text?.trim() ?? '';
}

function getCallbackData(ctx) {
  return ctx.callbackQuery?.data ?? '';
}

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

function rememberPanel(ctx, target) {
  if (!target?.chatId || !target?.messageId) {
    return;
  }

  getSceneState(ctx).panel = target;
}

function getStoredPanel(ctx) {
  return getSceneState(ctx).panel ?? null;
}

function getPanelTarget(ctx) {
  return getCallbackPanel(ctx) ?? getStoredPanel(ctx);
}

function extractCallbackValue(ctx, prefix) {
  const callbackData = getCallbackData(ctx);
  return callbackData.startsWith(prefix) ? callbackData.slice(prefix.length) : null;
}

function isCancelAction(ctx) {
  return getMessageText(ctx) === '/cancel';
}

function buildBlockedMessage(user, supportContact) {
  const lines = [BOT_TEXTS.BLOCKED];

  if (user.blockedReason) {
    lines.push(`Причина: ${user.blockedReason}`);
  }

  lines.push(`Если нужна помощь: ${supportContact}`);

  return lines.join('\n');
}

function buildRegistrationOverviewText(registration, notice = '') {
  const homeAddress = getRegistrationHomeAddress(registration);
  const cdekAddress = getRegistrationCdekAddress(registration);

  return [
    notice,
    'Твои данные уже сохранены 💫',
    '',
    `ФИО: ${registration.fullName}`,
    `Телефон: ${registration.phone}`,
    `Ник: ${registration.telegramUsername}`,
    `Домашний адрес: ${homeAddress || 'не указан'}`,
    `Адрес СДЭК: ${cdekAddress || 'не указан'}`,
    '',
    formatRegistrationSizes(registration.sizes),
  ]
    .filter(Boolean)
    .join('\n');
}

function buildFieldSelectionText(notice = '') {
  return [notice, 'Что хочешь изменить?']
    .filter(Boolean)
    .join('\n\n');
}

function buildPromptText(fieldConfig, notice = '') {
  return [notice, fieldConfig.prompt]
    .filter(Boolean)
    .join('\n\n');
}

async function answerRegistrationCallback(ctx, text = undefined) {
  if (!ctx.callbackQuery) {
    return;
  }

  try {
    await ctx.answerCbQuery(text);
  } catch {
    // Ignore callback acknowledgement errors.
  }
}

async function renderRegistrationPanel(ctx, text, markup = undefined) {
  const target = getPanelTarget(ctx);
  const extra = normalizeInlineMarkup(markup);

  if (target) {
    rememberPanel(ctx, target);

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
        delete getSceneState(ctx).panel;
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

          return target;
        } catch (replyMarkupError) {
          if (isUnavailableMessageError(replyMarkupError)) {
            delete getSceneState(ctx).panel;
          } else if (!isMessageNotModifiedError(replyMarkupError)) {
            throw replyMarkupError;
          }
        }
      }
    }
  }

  const sentMessage = await ctx.reply(text, extra);
  const newTarget = {
    chatId: sentMessage.chat.id,
    messageId: sentMessage.message_id,
  };

  rememberPanel(ctx, newTarget);
  return newTarget;
}

async function clearRegistrationPanelKeyboard(ctx) {
  const target = getPanelTarget(ctx);

  if (!target) {
    return;
  }

  try {
    await ctx.telegram.editMessageReplyMarkup(
      target.chatId,
      target.messageId,
      undefined,
      {
        inline_keyboard: [],
      },
    );
  } catch (error) {
    if (isMessageNotModifiedError(error) || isUnavailableMessageError(error)) {
      return;
    }

    throw error;
  }
}

async function leaveToMainMenu(ctx, message = BOT_TEXTS.MENU_HINT) {
  await clearRegistrationPanelKeyboard(ctx);
  await ctx.scene.leave();
  await ctx.reply(message, getMainMenuKeyboard());
}

async function ensureRegistrationEditAccess(ctx) {
  const user = await ctx.state.services.registrationService.ensureTelegramUser(ctx.from);
  const isBlocked = await ctx.state.services.bookingService.isUserBlocked(user.id);

  if (isBlocked) {
    await leaveToMainMenu(ctx, buildBlockedMessage(user, ctx.state.env.SUPPORT_CONTACT));
    return null;
  }

  const registration = await ctx.state.services.registrationService.getRegistrationByUserId(user.id);

  if (!registration) {
    await ctx.scene.enter(REGISTRATION_SCENE_ID);
    return null;
  }

  return {
    registration,
    user,
  };
}

export function createRegistrationEditScene() {
  return new Scenes.WizardScene(
    REGISTRATION_EDIT_SCENE_ID,
    async (ctx) => {
      const access = await ensureRegistrationEditAccess(ctx);

      if (!access) {
        return undefined;
      }

      const state = getSceneState(ctx);
      state.registration = access.registration;
      state.userId = access.user.id;

      await renderRegistrationPanel(
        ctx,
        buildRegistrationOverviewText(access.registration),
        getRegistrationOverviewKeyboard(),
      );

      return ctx.wizard.next();
    },
    async (ctx) => {
      if (isCancelAction(ctx)) {
        await leaveToMainMenu(ctx, 'Изменение данных можно продолжить позже.');
        return undefined;
      }

      const callbackData = getCallbackData(ctx);
      const state = getSceneState(ctx);

      if (callbackData === REGISTRATION_EDIT_CALLBACKS.OVERVIEW_BACK) {
        await answerRegistrationCallback(ctx);
        await leaveToMainMenu(ctx);
        return undefined;
      }

      if (callbackData === REGISTRATION_EDIT_CALLBACKS.OVERVIEW_EDIT) {
        await answerRegistrationCallback(ctx);
        await renderRegistrationPanel(
          ctx,
          buildFieldSelectionText(),
          getRegistrationEditFieldsKeyboard(REGISTRATION_EDITABLE_FIELDS),
        );
        return ctx.wizard.next();
      }

      if (getMessageText(ctx)) {
        await renderRegistrationPanel(
          ctx,
          buildRegistrationOverviewText(
            state.registration,
            'Нажми «Изменить данные», чтобы обновить нужное поле.',
          ),
          getRegistrationOverviewKeyboard(),
        );
      }

      return undefined;
    },
    async (ctx) => {
      if (isCancelAction(ctx)) {
        await leaveToMainMenu(ctx, 'Изменение данных можно продолжить позже.');
        return undefined;
      }

      const callbackData = getCallbackData(ctx);

      if (callbackData === REGISTRATION_EDIT_CALLBACKS.FIELDS_BACK) {
        await answerRegistrationCallback(ctx);
        await renderRegistrationPanel(
          ctx,
          buildRegistrationOverviewText(getSceneState(ctx).registration),
          getRegistrationOverviewKeyboard(),
        );
        ctx.wizard.selectStep(1);
        return undefined;
      }

      const fieldKey = extractCallbackValue(ctx, REGISTRATION_EDIT_CALLBACKS.FIELD_PREFIX);
      const fieldConfig = getRegistrationEditableField(fieldKey);

      if (!fieldConfig) {
        if (ctx.callbackQuery) {
          await answerRegistrationCallback(ctx, 'Выбери поле ниже.');
        }

        if (getMessageText(ctx)) {
          await renderRegistrationPanel(
            ctx,
            buildFieldSelectionText('Сначала выбери поле ниже.'),
            getRegistrationEditFieldsKeyboard(REGISTRATION_EDITABLE_FIELDS),
          );
        }

        return undefined;
      }

      const state = getSceneState(ctx);
      state.selectedField = fieldConfig.key;

      await answerRegistrationCallback(ctx);
      await renderRegistrationPanel(
        ctx,
        buildPromptText(fieldConfig),
        getRegistrationEditPromptKeyboard(),
      );

      return ctx.wizard.next();
    },
    async (ctx) => {
      if (isCancelAction(ctx)) {
        await leaveToMainMenu(ctx, 'Изменение данных можно продолжить позже.');
        return undefined;
      }

      if (getCallbackData(ctx) === REGISTRATION_EDIT_CALLBACKS.PROMPT_BACK) {
        await answerRegistrationCallback(ctx);
        await renderRegistrationPanel(
          ctx,
          buildFieldSelectionText(),
          getRegistrationEditFieldsKeyboard(REGISTRATION_EDITABLE_FIELDS),
        );
        ctx.wizard.selectStep(2);
        return undefined;
      }

      const state = getSceneState(ctx);
      const fieldConfig = getRegistrationEditableField(state.selectedField);
      const value = getMessageText(ctx);

      if (!fieldConfig) {
        await renderRegistrationPanel(
          ctx,
          buildFieldSelectionText(),
          getRegistrationEditFieldsKeyboard(REGISTRATION_EDITABLE_FIELDS),
        );
        ctx.wizard.selectStep(2);
        return undefined;
      }

      if (!value) {
        await renderRegistrationPanel(
          ctx,
          buildPromptText(fieldConfig, 'Напиши новое значение или нажми «Назад».'),
          getRegistrationEditPromptKeyboard(),
        );
        return undefined;
      }

      try {
        const result = await ctx.state.services.registrationService.updateRegistrationField({
          field: fieldConfig.key,
          userId: state.userId,
          value,
        });

        state.registration = result.registration;
        state.selectedField = null;

        await renderRegistrationPanel(
          ctx,
          buildRegistrationOverviewText(
            result.registration,
            result.changed ? fieldConfig.successMessage : 'У тебя уже указано это значение.',
          ),
          getRegistrationOverviewKeyboard(),
        );
        ctx.wizard.selectStep(1);
        return undefined;
      } catch (error) {
        if (error instanceof ValidationError) {
          await renderRegistrationPanel(
            ctx,
            buildPromptText(fieldConfig, error.message),
            getRegistrationEditPromptKeyboard(),
          );
          return undefined;
        }

        throw error;
      }
    },
  );
}
```

src/bot/scenes/registrationScene.js
```js
import { Scenes } from 'telegraf';

import { BOT_TEXTS } from '../../utils/constants.js';
import { ValidationError } from '../../utils/errors.js';
import { formatRegistrationConfirmation } from '../../utils/formatters.js';
import { parseRegistrationSizes } from '../../utils/registration.js';
import { ensureNonEmptyString } from '../../utils/validators.js';
import {
  getRegistrationCancelKeyboard,
  getRegistrationConfirmKeyboard,
  getRegistrationStepKeyboard,
  getUsernameKeyboard,
  REGISTRATION_BUTTONS,
} from '../keyboards/registration.js';
import { getMainMenuKeyboard } from '../keyboards/mainMenu.js';
import { REGISTRATION_EDIT_SCENE_ID, REGISTRATION_SCENE_ID } from './sceneIds.js';

export { REGISTRATION_SCENE_ID };

function getSceneState(ctx) {
  ctx.wizard.state.registrationDraft ??= {};
  return ctx.wizard.state.registrationDraft;
}

function getMessageText(ctx) {
  return ctx.message?.text?.trim() ?? '';
}

function isCancelAction(ctx) {
  const text = getMessageText(ctx);
  return text === REGISTRATION_BUTTONS.CANCEL || text === '/cancel';
}

function isBackAction(ctx) {
  return getMessageText(ctx) === REGISTRATION_BUTTONS.BACK;
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
  await leaveWithMainMenu(ctx, 'Регистрацию можно продолжить позже.');
}

async function ensureRegistrationAccess(ctx) {
  const user = await ctx.state.services.registrationService.ensureTelegramUser(ctx.from);
  const isBlocked = await ctx.state.services.bookingService.isUserBlocked(user.id);

  if (isBlocked) {
    await leaveWithMainMenu(ctx, buildBlockedMessage(user, ctx.state.env.SUPPORT_CONTACT));
    return null;
  }

  return user;
}

async function promptFullName(ctx) {
  await ctx.reply(
    'Напиши ФИО',
    getRegistrationCancelKeyboard(),
  );
}

async function promptPhone(ctx) {
  await ctx.reply('Напиши номер телефона', getRegistrationStepKeyboard());
}

async function promptUsername(ctx) {
  await ctx.reply(
    'Напиши свой ник в Telegram\nНапример: @username',
    getUsernameKeyboard(Boolean(ctx.from?.username)),
  );
}

async function promptAddress(ctx) {
  await ctx.reply('Напиши домашний адрес', getRegistrationStepKeyboard());
}

async function promptCdekAddress(ctx) {
  await ctx.reply('Напиши адрес СДЭК', getRegistrationStepKeyboard());
}

async function promptSizes(ctx) {
  await ctx.reply(BOT_TEXTS.REGISTRATION_SIZE_TEMPLATE, getRegistrationStepKeyboard());
}

export function createRegistrationScene() {
  return new Scenes.WizardScene(
    REGISTRATION_SCENE_ID,
    async (ctx) => {
      const user = await ensureRegistrationAccess(ctx);

      if (!user) {
        return undefined;
      }

      const existingRegistration = await ctx.state.services.registrationService.getRegistrationByUserId(user.id);

      if (existingRegistration) {
        await ctx.scene.enter(REGISTRATION_EDIT_SCENE_ID);
        return undefined;
      }

      ctx.wizard.state.registrationDraft = {
        profileUsername: ctx.from?.username ? `@${ctx.from.username}` : null,
        userId: user.id,
      };

      await ctx.reply('Давай быстро заполним регистрацию ✨');
      await promptFullName(ctx);
      return ctx.wizard.next();
    },
    async (ctx) => {
      if (isCancelAction(ctx)) {
        await cancelFlow(ctx);
        return undefined;
      }

      const fullName = getMessageText(ctx);

      try {
        getSceneState(ctx).fullName = ensureNonEmptyString(fullName, 'ФИО');
      } catch (error) {
        if (error instanceof ValidationError) {
          await ctx.reply('Напиши ФИО', getRegistrationCancelKeyboard());
          return undefined;
        }

        throw error;
      }

      await promptPhone(ctx);
      return ctx.wizard.next();
    },
    async (ctx) => {
      if (isCancelAction(ctx)) {
        await cancelFlow(ctx);
        return undefined;
      }

      if (isBackAction(ctx)) {
        await promptFullName(ctx);
        ctx.wizard.selectStep(1);
        return undefined;
      }

      const phone = getMessageText(ctx);

      try {
        getSceneState(ctx).phone = ensureNonEmptyString(phone, 'Телефон');
      } catch (error) {
        if (error instanceof ValidationError) {
          await promptPhone(ctx);
          return undefined;
        }

        throw error;
      }

      await promptUsername(ctx);
      return ctx.wizard.next();
    },
    async (ctx) => {
      if (isCancelAction(ctx)) {
        await cancelFlow(ctx);
        return undefined;
      }

      if (isBackAction(ctx)) {
        await promptPhone(ctx);
        ctx.wizard.selectStep(2);
        return undefined;
      }

      const state = getSceneState(ctx);
      const text = getMessageText(ctx);

      if (text === REGISTRATION_BUTTONS.USE_PROFILE_USERNAME) {
        if (!state.profileUsername) {
          await promptUsername(ctx);
          return undefined;
        }

        state.telegramUsername = state.profileUsername;
      } else {
        try {
          state.telegramUsername = ensureNonEmptyString(text, 'Telegram username');
        } catch (error) {
          if (error instanceof ValidationError) {
            await promptUsername(ctx);
            return undefined;
          }

          throw error;
        }
      }

      await promptAddress(ctx);
      return ctx.wizard.next();
    },
    async (ctx) => {
      if (isCancelAction(ctx)) {
        await cancelFlow(ctx);
        return undefined;
      }

      if (isBackAction(ctx)) {
        await promptUsername(ctx);
        ctx.wizard.selectStep(3);
        return undefined;
      }

      const address = getMessageText(ctx);

      try {
        getSceneState(ctx).homeAddress = ensureNonEmptyString(address, 'Домашний адрес');
      } catch (error) {
        if (error instanceof ValidationError) {
          await promptAddress(ctx);
          return undefined;
        }

        throw error;
      }

      await promptCdekAddress(ctx);
      return ctx.wizard.next();
    },
    async (ctx) => {
      if (isCancelAction(ctx)) {
        await cancelFlow(ctx);
        return undefined;
      }

      if (isBackAction(ctx)) {
        await promptAddress(ctx);
        ctx.wizard.selectStep(4);
        return undefined;
      }

      const cdekAddress = getMessageText(ctx);

      try {
        getSceneState(ctx).cdekAddress = ensureNonEmptyString(cdekAddress, 'Адрес СДЭК');
      } catch (error) {
        if (error instanceof ValidationError) {
          await promptCdekAddress(ctx);
          return undefined;
        }

        throw error;
      }

      await promptSizes(ctx);
      return ctx.wizard.next();
    },
    async (ctx) => {
      if (isCancelAction(ctx)) {
        await cancelFlow(ctx);
        return undefined;
      }

      if (isBackAction(ctx)) {
        await promptCdekAddress(ctx);
        ctx.wizard.selectStep(5);
        return undefined;
      }

      const sizes = getMessageText(ctx);

      try {
        const normalizedSizes = ensureNonEmptyString(sizes, 'Размеры');
        const parsedSizes = parseRegistrationSizes(normalizedSizes);

        if (!parsedSizes.hasStructuredData) {
          await ctx.reply(
            'Заполни размеры по шаблону ниже, чтобы я показал их аккуратно по полям.',
            getRegistrationStepKeyboard(),
          );
          await promptSizes(ctx);
          return undefined;
        }

        getSceneState(ctx).sizes = parsedSizes.normalizedText || parsedSizes.rawText;
      } catch (error) {
        if (error instanceof ValidationError) {
          await promptSizes(ctx);
          return undefined;
        }

        throw error;
      }

      await ctx.reply(
        formatRegistrationConfirmation(getSceneState(ctx)),
        getRegistrationConfirmKeyboard(),
      );
      return ctx.wizard.next();
    },
    async (ctx) => {
      if (isCancelAction(ctx)) {
        await cancelFlow(ctx);
        return undefined;
      }

      const action = getMessageText(ctx);

      if (action === REGISTRATION_BUTTONS.BACK) {
        await promptSizes(ctx);
        ctx.wizard.selectStep(6);
        return undefined;
      }

      if (action === REGISTRATION_BUTTONS.RESTART) {
        ctx.wizard.state.registrationDraft = {
          profileUsername: getSceneState(ctx).profileUsername,
          userId: getSceneState(ctx).userId,
        };
        await promptFullName(ctx);
        ctx.wizard.selectStep(1);
        return undefined;
      }

      if (action !== REGISTRATION_BUTTONS.CONFIRM) {
        await ctx.reply('Выбери кнопку ниже.', getRegistrationConfirmKeyboard());
        return undefined;
      }

      const state = getSceneState(ctx);

      try {
        await ctx.state.services.registrationService.registerUser({
          userId: state.userId,
          fullName: state.fullName,
          phone: state.phone,
          telegramUsername: state.telegramUsername,
          homeAddress: state.homeAddress,
          cdekAddress: state.cdekAddress,
          sizes: state.sizes,
          telegramProfileUsername: state.profileUsername,
        });

        await ctx.reply(
          BOT_TEXTS.REGISTRATION_DONE,
          getMainMenuKeyboard(),
        );

        const pdfResult = await ctx.state.services.registrationService.sendRegistrationPdf({
          chatId: ctx.chat.id,
          telegram: ctx.telegram,
          userId: state.userId,
        });

        if (!pdfResult.sent) {
          await ctx.reply(pdfResult.message, getMainMenuKeyboard());
        }

        await ctx.scene.leave();
        return undefined;
      } catch (error) {
        if (error instanceof ValidationError) {
          await ctx.reply(error.message);

          if (error.details?.field === 'phone') {
            await promptPhone(ctx);
            ctx.wizard.selectStep(2);
            return undefined;
          }

          if (error.details?.field === 'registration') {
            await ctx.scene.enter(REGISTRATION_EDIT_SCENE_ID);
            return undefined;
          }

          await ctx.reply(
            formatRegistrationConfirmation(state),
            getRegistrationConfirmKeyboard(),
          );
          return undefined;
        }

        throw error;
      }
    },
  );
}
```

src/bot/handlers/menuHandlers.js
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
import {
  BOOKING_CALLBACKS,
  getUserBookingCancelConfirmKeyboard,
  getUserBookingReschedulePromptKeyboard,
  getUserBoutiqueBookingActionsKeyboard,
} from '../keyboards/booking.js';
import { getMainMenuKeyboard } from '../keyboards/mainMenu.js';
import { BOOKING_RESCHEDULE_SCENE_ID } from '../scenes/bookingRescheduleScene.js';
import { BOOKING_SCENE_ID } from '../scenes/bookingScene.js';
import { REGISTRATION_EDIT_SCENE_ID } from '../scenes/registrationEditScene.js';
import { REGISTRATION_SCENE_ID } from '../scenes/registrationScene.js';
import { isMessageNotModifiedError, normalizeInlineMarkup } from '../utils/inlineKeyboard.js';

const ACTIVE_BOOKING_STATUSES = [BookingStatus.CREATED, BookingStatus.SUBMITTED];

function buildBlockedMessage(user, supportContact) {
  const lines = [BOT_TEXTS.BLOCKED];

  if (user.blockedReason) {
    lines.push(`Причина: ${user.blockedReason}`);
  }

  lines.push(`Если нужна помощь: ${supportContact}`);

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
    'Отменить эту запись?',
  ].join('\n\n');
}

function buildReschedulePromptText(booking) {
  return [
    formatUserBookingCard(booking, {
      includeStatus: false,
    }),
    'Текущая запись будет заменена новой. Продолжить?',
  ].join('\n\n');
}

function buildCancelledText() {
  return 'Запись отменена.';
}

function buildBookingUserName(booking) {
  const fullName =
    booking?.user?.registration?.fullName ||
    [booking?.user?.firstName, booking?.user?.lastName].filter(Boolean).join(' ').trim();

  return fullName || 'Креатор без имени';
}

function buildBookingUsername(booking) {
  const registrationUsername = booking?.user?.registration?.telegramUsername;

  if (registrationUsername) {
    return registrationUsername;
  }

  if (booking?.user?.username) {
    return `@${booking.user.username}`;
  }

  return 'не указан';
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
  const boutiqueName = booking?.boutique?.name ?? booking?.boutiqueAddress ?? 'Не указан';

  return [
    isUrgent ? 'Срочная отмена записи на сегодня' : 'Отмена записи',
    '',
    `Креатор: ${buildBookingUserName(booking)}`,
    `Ник: ${buildBookingUsername(booking)}`,
    `Бутик: ${boutiqueName}`,
    `Дата: ${booking?.visitDate ? formatDate(booking.visitDate, 'DD.MM.YYYY') : 'Не указана'}`,
    `Время: ${formatSlotLabelForUser(booking?.slotLabel ?? booking?.timeSlot?.label) || 'Не указано'}`,
    `Отменено: ${formatDate(cancelledAt, 'DD.MM.YYYY HH:mm')}`,
  ].join('\n');
}

function buildArchivedBookingsText(bookings) {
  const visibleBookings = bookings.slice(0, 3);
  const hiddenCount = bookings.length - visibleBookings.length;
  const lines = [formatUserBookingArchive(visibleBookings, 'Прошлые заявки')];

  if (hiddenCount > 0) {
    lines.push(`И ещё ${hiddenCount} в истории.`);
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

    await ctx.scene.enter(REGISTRATION_EDIT_SCENE_ID);
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
      await ctx.reply('У тебя пока нет заявок.', getMainMenuKeyboard());
      return;
    }

    const activeBookings = sortActiveBookings(bookings.filter(isActiveBooking));
    const archivedBookings = sortArchivedBookings(bookings.filter((booking) => !isActiveBooking(booking)));

    if (activeBookings.length > 0) {
      await ctx.reply('Активные заявки', getMainMenuKeyboard());

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
        await answerBookingCallback(ctx, 'Запись не найдена.', true);
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
        await answerBookingCallback(ctx, 'Запись не найдена.', true);
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
        'Сначала нажми «Регистрация».',
        getMainMenuKeyboard(),
      );
      return;
    }

    const result = await services.timerService.startTimerForUserLatestBooking(user.id);

    if (result.requiresBooking) {
      await ctx.reply(
        'Сначала нажми «Записаться».',
        getMainMenuKeyboard(),
      );
      return;
    }

    if (result.alreadyActive) {
      await ctx.reply(
        'Ты уже отметил(а), что взял(а) образы.',
        getMainMenuKeyboard(),
      );
      return;
    }

    await ctx.reply(
      'Готово, выдача отмечена.',
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
      await ctx.reply('Сейчас у тебя нет активной выдачи образов.', getMainMenuKeyboard());
      return;
    }

    await ctx.reply(
      'Готово, возврат отмечен.',
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
      'Выбери нужный раздел ниже.',
      getMainMenuKeyboard(),
    );
  });
}
```

src/bot/commands.js
```js
import { BOT_TEXTS } from '../utils/constants.js';
import { getMainMenuKeyboard } from './keyboards/mainMenu.js';
import { BOOKING_SCENE_ID } from './scenes/bookingScene.js';
import { REGISTRATION_EDIT_SCENE_ID } from './scenes/registrationEditScene.js';
import { REGISTRATION_SCENE_ID } from './scenes/registrationScene.js';

function buildBlockedMessage(user, supportContact) {
  const lines = [BOT_TEXTS.BLOCKED];

  if (user.blockedReason) {
    lines.push(`Причина: ${user.blockedReason}`);
  }

  lines.push(`Если нужна помощь: ${supportContact}`);

  return lines.join('\n');
}

export function registerCommands(bot, { env, services }) {
  bot.start(async (ctx) => {
    const user = await services.registrationService.ensureTelegramUser(ctx.from);
    const isBlocked = await services.bookingService.isUserBlocked(user.id);

    if (isBlocked) {
      await ctx.reply(buildBlockedMessage(user, env.SUPPORT_CONTACT), getMainMenuKeyboard());
      return;
    }

    const registrationSummary = await services.registrationService.getRegistrationSummary(user.id);
    const message = registrationSummary.exists
      ? BOT_TEXTS.START_REGISTERED
      : BOT_TEXTS.START_NEW_USER;

    await ctx.reply(message, getMainMenuKeyboard());
  });

  bot.command('menu', async (ctx) => {
    const user = await services.registrationService.ensureTelegramUser(ctx.from);
    const isBlocked = await services.bookingService.isUserBlocked(user.id);

    if (isBlocked) {
      await ctx.reply(buildBlockedMessage(user, env.SUPPORT_CONTACT), getMainMenuKeyboard());
      return;
    }

    await ctx.reply(BOT_TEXTS.MENU_HINT, getMainMenuKeyboard());
  });

  bot.command('help', async (ctx) => {
    await ctx.reply(
      `Выбери нужный раздел ниже.\n\nЕсли нужна помощь, напиши: ${env.SUPPORT_CONTACT}`,
      getMainMenuKeyboard(),
    );
  });

  bot.command('registration', async (ctx) => {
    const user = await services.registrationService.ensureTelegramUser(ctx.from);
    const isBlocked = await services.bookingService.isUserBlocked(user.id);

    if (isBlocked) {
      await ctx.reply(buildBlockedMessage(user, env.SUPPORT_CONTACT), getMainMenuKeyboard());
      return;
    }

    const registration = await services.registrationService.getRegistrationByUserId(user.id);

    await ctx.scene.enter(registration ? REGISTRATION_EDIT_SCENE_ID : REGISTRATION_SCENE_ID);
  });

  bot.command('booking', async (ctx) => {
    await ctx.scene.enter(BOOKING_SCENE_ID);
  });
}
```

src/bot/index.js
```js
import { Scenes, Telegraf, session } from 'telegraf';

import { registerCommands } from './commands.js';
import { registerAdminHandlers } from './handlers/adminHandlers.js';
import { registerMenuHandlers } from './handlers/menuHandlers.js';
import { createContextMiddleware } from './middlewares/context.js';
import { registerErrorHandler } from './middlewares/errorHandler.js';
import { createLoggingMiddleware } from './middlewares/logging.js';
import { createAdminBoutiqueScene } from './scenes/adminBoutiqueScene.js';
import { createAdminAdminScene } from './scenes/adminAdminScene.js';
import { createAdminSlotScene } from './scenes/adminSlotScene.js';
import { createAdminTimeSlotScene } from './scenes/adminTimeSlotScene.js';
import { createAdminUserScene } from './scenes/adminUserScene.js';
import { createBookingRescheduleScene } from './scenes/bookingRescheduleScene.js';
import { createBookingScene } from './scenes/bookingScene.js';
import { createRegistrationEditScene } from './scenes/registrationEditScene.js';
import { createRegistrationScene } from './scenes/registrationScene.js';

export async function createBot({ env, logger, services }) {
  const bot = new Telegraf(env.BOT_TOKEN);
  const stage = new Scenes.Stage([
    createRegistrationScene(),
    createRegistrationEditScene(),
    createBookingScene(),
    createBookingRescheduleScene(),
    createAdminAdminScene(),
    createAdminSlotScene(),
    createAdminUserScene(),
    createAdminBoutiqueScene(),
    createAdminTimeSlotScene(),
  ]);

  registerErrorHandler(bot, { logger });

  bot.use(createLoggingMiddleware({ logger }));
  bot.use(createContextMiddleware({ env, logger, services }));
  bot.use(session());
  bot.use(stage.middleware());

  registerCommands(bot, { env, services });
  registerAdminHandlers(bot, { env, services });
  registerMenuHandlers(bot, { env, services });

  await bot.telegram.setMyCommands([
    { command: 'start', description: 'Запустить бота' },
    { command: 'booking', description: 'Создать заявку' },
    { command: 'menu', description: 'Показать главное меню' },
    { command: 'help', description: 'Помощь' },
    { command: 'registration', description: 'Пройти регистрацию' },
    { command: 'admin', description: 'Открыть админку' },
  ]);

  return bot;
}
```
