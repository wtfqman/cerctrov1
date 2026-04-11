function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

const INTERNAL_BOUTIQUE_CODE_PREFIXES = Object.freeze([
  'MOS_NOMAIL_',
  'MOS_RESCHE_',
  'MOS_SMTPFA_',
  'TEST_',
  'DEBUG_',
  'INTERNAL_',
]);

const INTERNAL_BOUTIQUE_NAME_PATTERNS = Object.freeze([
  /\bNo Mail\b/iu,
  /\bSMTP Fail\b/iu,
  /\bReschedule\b/iu,
  /\bIntegration\b/iu,
  /\bDebug\b/iu,
  /\bInternal\b/iu,
  /\bTest\b/iu,
]);

const INTERNAL_BOUTIQUE_NOTE_MARKERS = Object.freeze([
  'internal_only',
  'hidden_from_user',
  'system_only',
  'debug_only',
  'test_only',
]);

function includesInternalNoteMarker(notes) {
  const normalizedNotes = normalizeText(notes).toLowerCase();

  if (!normalizedNotes) {
    return false;
  }

  return INTERNAL_BOUTIQUE_NOTE_MARKERS.some((marker) => normalizedNotes.includes(marker));
}

export function isInternalBoutiqueCode(code) {
  const normalizedCode = normalizeText(code).toUpperCase();

  if (!normalizedCode) {
    return false;
  }

  return INTERNAL_BOUTIQUE_CODE_PREFIXES.some((prefix) => normalizedCode.startsWith(prefix));
}

export function isInternalBoutiqueName(name) {
  const normalizedName = normalizeText(name);

  if (!normalizedName) {
    return false;
  }

  return INTERNAL_BOUTIQUE_NAME_PATTERNS.some((pattern) => pattern.test(normalizedName));
}

export function isInternalBoutique(boutique) {
  if (!boutique) {
    return false;
  }

  return (
    isInternalBoutiqueCode(boutique.code) ||
    isInternalBoutiqueName(boutique.name) ||
    includesInternalNoteMarker(boutique.notes)
  );
}

export function isVisibleBoutique(boutique) {
  return Boolean(boutique) && !isInternalBoutique(boutique);
}

export function filterVisibleBoutiques(boutiques) {
  return Array.isArray(boutiques) ? boutiques.filter(isVisibleBoutique) : [];
}

export function isUserVisibleBoutique(boutique) {
  return isVisibleBoutique(boutique);
}

export function filterUserVisibleBoutiques(boutiques) {
  return filterVisibleBoutiques(boutiques);
}

export function isDisallowedUserBoutiqueLabel(label) {
  return isInternalBoutiqueName(label);
}

export function getUserVisibleBoutiqueLabel(source, fallback = 'Бутик') {
  const boutique = source?.boutique ?? source;

  if (boutique && isVisibleBoutique(boutique)) {
    return normalizeText(boutique.name) || fallback;
  }

  if (!boutique || !boutique.id) {
    const boutiqueAddress = normalizeText(source?.boutiqueAddress);
    return boutiqueAddress || fallback;
  }

  return fallback;
}

export function getVisibleBoutiqueLabel(source, fallback = 'Бутик') {
  return getUserVisibleBoutiqueLabel(source, fallback);
}
