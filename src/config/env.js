import { existsSync } from 'node:fs';
import path from 'node:path';

import { AdminRole } from '@prisma/client';

import { loadEnvFiles } from './loadEnv.js';

loadEnvFiles();

function getEnvValue(nameOrNames) {
  const names = Array.isArray(nameOrNames) ? nameOrNames : [nameOrNames];

  for (const name of names) {
    const rawValue = process.env[name];

    if (typeof rawValue === 'string' && rawValue.trim() !== '') {
      return rawValue.trim();
    }
  }

  return '';
}

function getRequiredEnv(nameOrNames, label = null) {
  const value = getEnvValue(nameOrNames);

  if (!value) {
    const names = Array.isArray(nameOrNames) ? nameOrNames.join(', ') : nameOrNames;
    throw new Error(`Environment variable "${label ?? names}" is required`);
  }

  return value;
}

function getNumberEnv(name, fallbackValue) {
  const rawValue = getEnvValue(name);

  if (!rawValue) {
    return fallbackValue;
  }

  const parsed = Number(rawValue);

  if (Number.isNaN(parsed)) {
    throw new Error(`Environment variable "${name}" must be a number`);
  }

  return parsed;
}

function getBooleanEnv(name, fallbackValue) {
  const rawValue = getEnvValue(name);

  if (!rawValue) {
    return fallbackValue;
  }

  const normalized = rawValue.toLowerCase();

  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }

  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }

  throw new Error(`Environment variable "${name}" must be a boolean`);
}

function parseAdminIds(rawValue) {
  const ids = rawValue
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (ids.length === 0) {
    throw new Error('Environment variable "ADMIN_IDS" must contain at least one Telegram ID');
  }

  for (const id of ids) {
    if (!/^\d+$/.test(id)) {
      throw new Error(`Environment variable "ADMIN_IDS" contains invalid Telegram ID: ${id}`);
    }
  }

  return ids;
}

function resolveExistingOptionalFilePath(envName) {
  const inputPath = getEnvValue(envName);

  if (!inputPath) {
    return '';
  }

  const resolvedPath = path.isAbsolute(inputPath) ? inputPath : path.resolve(process.cwd(), inputPath);

  if (!existsSync(resolvedPath)) {
    throw new Error(`File from environment variable "${envName}" was not found: ${resolvedPath}`);
  }

  return resolvedPath;
}

function ensureSupportedPdfStorageMode(mode) {
  const normalizedMode = mode.trim().toLowerCase();

  if (normalizedMode !== 'local') {
    throw new Error(`Environment variable "PDF_STORAGE_MODE" must be "local", received "${mode}"`);
  }

  return normalizedMode;
}

function ensureSupportedAdminRole(role) {
  const normalizedRole = role.trim().toUpperCase();

  if (!Object.values(AdminRole).includes(normalizedRole)) {
    throw new Error(
      `Environment variable "DEFAULT_ADMIN_ROLE" must be one of: ${Object.values(AdminRole).join(', ')}`,
    );
  }

  return normalizedRole;
}

function normalizeDatabaseUrl(value) {
  if (value === 'file:./prisma/dev.db') {
    return 'file:./dev.db';
  }

  return value;
}

const botEnabled = getBooleanEnv('BOT_ENABLED', true);
const rawBotToken = getEnvValue(['BOT_TOKEN', 'TELEGRAM_BOT_TOKEN']);
const botToken = botEnabled ? getRequiredEnv(['BOT_TOKEN', 'TELEGRAM_BOT_TOKEN'], 'BOT_TOKEN') : rawBotToken;
const adminIds = parseAdminIds(getRequiredEnv('ADMIN_IDS'));
const defaultTimezone = getEnvValue(['DEFAULT_TIMEZONE', 'APP_TIMEZONE']) || 'Europe/Moscow';
const pdfStorageMode = ensureSupportedPdfStorageMode(getEnvValue('PDF_STORAGE_MODE') || 'local');
const supportContact = getEnvValue(['SUPPORT_CONTACT', 'BOT_USERNAME']) || '@Creator_CercaTrova_bot';
const defaultAdminRole = ensureSupportedAdminRole(getEnvValue('DEFAULT_ADMIN_ROLE') || AdminRole.LIMITED);
const googleSheetsSpreadsheetId = getEnvValue('GOOGLE_SHEETS_SPREADSHEET_ID');
const googleServiceAccountJsonPath = resolveExistingOptionalFilePath('GOOGLE_SERVICE_ACCOUNT_JSON_PATH');
const googleSheetName = getEnvValue('GOOGLE_SHEET_NAME');
const smtpHost = getEnvValue('SMTP_HOST');
const smtpPortInput = getEnvValue('SMTP_PORT');
const smtpPort = smtpPortInput ? getNumberEnv('SMTP_PORT', 0) : null;
const smtpSecureInput = getEnvValue('SMTP_SECURE');
const smtpSecure = smtpSecureInput ? getBooleanEnv('SMTP_SECURE', false) : null;
const smtpUser = getEnvValue('SMTP_USER');
const smtpPass = getEnvValue('SMTP_PASS');
const mailFrom = getEnvValue('MAIL_FROM');
const mailFromName = getEnvValue('MAIL_FROM_NAME');
const googleSheetsConfig = Object.freeze({
  GOOGLE_SHEETS_SPREADSHEET_ID: googleSheetsSpreadsheetId,
  GOOGLE_SERVICE_ACCOUNT_JSON_PATH: googleServiceAccountJsonPath,
  GOOGLE_SHEET_NAME: googleSheetName,
});
const mailConfig = Object.freeze({
  SMTP_HOST: smtpHost,
  SMTP_PORT: smtpPort,
  SMTP_SECURE: smtpSecure,
  SMTP_USER: smtpUser,
  SMTP_PASS: smtpPass,
  MAIL_FROM: mailFrom,
});
const googleSheetsMissingVars = Object.freeze(
  Object.entries(googleSheetsConfig)
    .filter(([, value]) => !value)
    .map(([name]) => name),
);
const mailMissingVars = Object.freeze(
  Object.entries(mailConfig)
    .filter(([, value]) => value === '' || value === null)
    .map(([name]) => name),
);
const googleSheetsHasAnyConfig = Object.values(googleSheetsConfig).some(Boolean);
const googleSheetsEnabled = googleSheetsMissingVars.length === 0;
const mailHasAnyConfig = [
  smtpHost,
  smtpPortInput,
  smtpSecureInput,
  smtpUser,
  smtpPass,
  mailFrom,
].some(Boolean);
const mailEnabled = mailMissingVars.length === 0;
const defaultReminderDay = getNumberEnv('DEFAULT_REMINDER_DAY', getNumberEnv('RETURN_REMINDER_DAYS', 5));
const defaultAdminAlertDay = getNumberEnv('DEFAULT_ADMIN_ALERT_DAY', getNumberEnv('RETURN_ADMIN_ALERT_DAYS', 8));
const menDeliveryReminderDay = getNumberEnv('MEN_DELIVERY_REMINDER_DAY', 10);
const menDeliveryAdminAlertDay = getNumberEnv('MEN_DELIVERY_ADMIN_ALERT_DAY', 14);

export const env = Object.freeze({
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  LOG_LEVEL: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  BOT_ENABLED: botEnabled,
  BOT_TOKEN: botToken,
  TELEGRAM_BOT_TOKEN: botToken,
  BOT_USERNAME: getEnvValue('BOT_USERNAME') || '@Creator_CercaTrova_bot',
  DATABASE_URL: normalizeDatabaseUrl(getRequiredEnv('DATABASE_URL')),
  ADMIN_IDS: adminIds,
  PRIMARY_ADMIN_ID: adminIds[0],
  GOOGLE_SHEETS_ENABLED: googleSheetsEnabled,
  GOOGLE_SHEETS_HAS_ANY_CONFIG: googleSheetsHasAnyConfig,
  GOOGLE_SHEETS_MISSING_VARS: googleSheetsMissingVars,
  GOOGLE_SHEETS_SPREADSHEET_ID: googleSheetsSpreadsheetId,
  GOOGLE_SERVICE_ACCOUNT_JSON_PATH: googleServiceAccountJsonPath,
  GOOGLE_SHEET_NAME: googleSheetName,
  MAIL_ENABLED: mailEnabled,
  MAIL_HAS_ANY_CONFIG: mailHasAnyConfig,
  MAIL_MISSING_VARS: mailMissingVars,
  SMTP_HOST: smtpHost,
  SMTP_PORT: smtpPort,
  SMTP_SECURE: smtpSecure,
  SMTP_USER: smtpUser,
  SMTP_PASS: smtpPass,
  MAIL_FROM: mailFrom,
  MAIL_FROM_NAME: mailFromName,
  DEFAULT_TIMEZONE: defaultTimezone,
  APP_TIMEZONE: defaultTimezone,
  APP_URL: getEnvValue('APP_URL'),
  PDF_STORAGE_MODE: pdfStorageMode,
  PDF_STORAGE_DIR: getEnvValue('PDF_STORAGE_DIR') || 'storage/pdfs',
  DEFAULT_REMINDER_DAY: defaultReminderDay,
  DEFAULT_ADMIN_ALERT_DAY: defaultAdminAlertDay,
  RETURN_REMINDER_DAYS: defaultReminderDay,
  RETURN_ADMIN_ALERT_DAYS: defaultAdminAlertDay,
  MEN_DELIVERY_REMINDER_DAY: menDeliveryReminderDay,
  MEN_DELIVERY_ADMIN_ALERT_DAY: menDeliveryAdminAlertDay,
  OVERDUE_CHECK_INTERVAL_MS: getNumberEnv('OVERDUE_CHECK_INTERVAL_MS', 10 * 60 * 1000),
  DEFAULT_ADMIN_ROLE: defaultAdminRole,
  SUPPORT_CONTACT: supportContact,
});

export function isGoogleSheetsConfigured() {
  return env.GOOGLE_SHEETS_ENABLED;
}
