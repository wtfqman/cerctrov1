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
