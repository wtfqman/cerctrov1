function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeUsername(value) {
  return normalizeText(value).replace(/^@/, '').toLowerCase();
}

const INTEGRATION_TEST_FULL_NAMES = new Set(['Integration Test']);
const INTEGRATION_TEST_TELEGRAM_IDS = new Set(['9586763375']);
const INTEGRATION_TEST_USERNAME_PREFIXES = Object.freeze(['itest']);
const DEMO_FULL_NAMES = new Set(['Иванов Иван Иванович']);
const EXPLICIT_DEMO_USERNAMES = new Set(['ssssv_a', 'wtfquiet']);
const GENERIC_DEMO_USERNAMES = new Set(['username']);

function isKnownDemoUsername(value) {
  const normalized = normalizeUsername(value);

  if (!normalized) {
    return false;
  }

  return EXPLICIT_DEMO_USERNAMES.has(normalized) || GENERIC_DEMO_USERNAMES.has(normalized);
}

function isExplicitDemoUsername(value) {
  const normalized = normalizeUsername(value);

  if (!normalized) {
    return false;
  }

  return EXPLICIT_DEMO_USERNAMES.has(normalized);
}

export function isIntegrationTestFullName(value) {
  return INTEGRATION_TEST_FULL_NAMES.has(normalizeText(value));
}

export function isKnownDemoFullName(value) {
  return DEMO_FULL_NAMES.has(normalizeText(value));
}

export function isTestFullName(value) {
  return isIntegrationTestFullName(value) || isKnownDemoFullName(value);
}

export function isTestTelegramId(value) {
  const normalized = normalizeText(value);
  return normalized ? INTEGRATION_TEST_TELEGRAM_IDS.has(normalized) : false;
}

export function isTestUsername(value) {
  const normalized = normalizeUsername(value);

  if (!normalized) {
    return false;
  }

  return (
    INTEGRATION_TEST_USERNAME_PREFIXES.some((prefix) => normalized.startsWith(prefix)) ||
    isKnownDemoUsername(normalized)
  );
}

export function isDemoUsername(value) {
  return isKnownDemoUsername(value);
}

export function isTestUserRecord(user) {
  if (!user) {
    return false;
  }

  const registration = user.registration;
  const hasDemoFullName = isKnownDemoFullName(registration?.fullName);
  const hasDemoUsername =
    isKnownDemoUsername(user.username) ||
    isKnownDemoUsername(registration?.telegramUsername);
  const hasIntegrationMarker =
    isTestTelegramId(user.telegramId) ||
    INTEGRATION_TEST_USERNAME_PREFIXES.some((prefix) => normalizeUsername(user.username).startsWith(prefix)) ||
    INTEGRATION_TEST_USERNAME_PREFIXES.some((prefix) => normalizeUsername(registration?.telegramUsername).startsWith(prefix)) ||
    isIntegrationTestFullName(registration?.fullName);
  const hasDemoMarker = hasDemoFullName && hasDemoUsername;

  return (
    hasIntegrationMarker ||
    hasDemoMarker
  );
}

export function isTestBookingUser(booking) {
  return isTestUserRecord(booking?.user);
}
