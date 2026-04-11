export const REGISTRATION_SIZE_FIELDS = Object.freeze([
  {
    key: 'shirt',
    label: 'Сорочка',
    aliases: ['Сорочка'],
  },
  {
    key: 'jacket',
    label: 'Пиджак',
    aliases: ['Пиджак'],
  },
  {
    key: 'trousers',
    label: 'Брюки',
    aliases: ['Брюки'],
  },
  {
    key: 'knitwear',
    label: 'Трикотаж',
    aliases: ['Трикотаж'],
  },
  {
    key: 'classicSuit',
    label: 'Костюм классика',
    aliases: ['Костюм классика', 'Костюм-классика'],
  },
  {
    key: 'powerSuit',
    label: 'Костюм power suit',
    aliases: ['Костюм power suit', 'Power suit', 'Костюм powersuit'],
  },
]);

const SIZE_FIELD_PATTERNS = REGISTRATION_SIZE_FIELDS.map((field) => ({
  ...field,
  patterns: field.aliases.map((alias) => {
    const escapedAlias = alias
      .trim()
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\s+/g, '\\s+');

    return {
      labelOnly: new RegExp(`^${escapedAlias}\\s*[:\\-]?\\s*$`, 'iu'),
      withValue: new RegExp(`^${escapedAlias}(?:\\s*[:\\-]\\s*|\\s+)(.+)$`, 'iu'),
    };
  }),
}));

function createEmptySizeFields() {
  return Object.fromEntries(REGISTRATION_SIZE_FIELDS.map((field) => [field.key, '']));
}

function normalizeTextValue(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeAddressValue(value) {
  return normalizeTextValue(value);
}

function formatStructuredSizeLines(fields, missingValue = '') {
  return REGISTRATION_SIZE_FIELDS.map((field) => {
    const value = normalizeTextValue(fields[field.key]);
    return `${field.label}: ${value || missingValue}`.trimEnd();
  });
}

function formatBestEffortSizeLines(rawText, missingValue = '-') {
  const lines = normalizeTextValue(rawText)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2 || lines.length > REGISTRATION_SIZE_FIELDS.length) {
    return null;
  }

  const fields = createEmptySizeFields();

  REGISTRATION_SIZE_FIELDS.forEach((field, index) => {
    fields[field.key] = lines[index] ?? '';
  });

  return formatStructuredSizeLines(fields, missingValue);
}

function matchSizeField(line) {
  for (const field of SIZE_FIELD_PATTERNS) {
    for (const pattern of field.patterns) {
      const valueMatch = line.match(pattern.withValue);

      if (valueMatch) {
        return {
          key: field.key,
          value: valueMatch[1].trim(),
        };
      }

      if (pattern.labelOnly.test(line)) {
        return {
          key: field.key,
          value: '',
        };
      }
    }
  }

  return null;
}

export function getRegistrationHomeAddress(registration) {
  return normalizeAddressValue(registration?.homeAddress ?? registration?.address ?? '');
}

export function getRegistrationCdekAddress(registration) {
  return normalizeAddressValue(registration?.cdekAddress ?? '');
}

export function parseRegistrationSizes(value) {
  const rawText = normalizeTextValue(value);
  const fields = createEmptySizeFields();

  if (!rawText) {
    return {
      displayText: '',
      fields,
      hasStructuredData: false,
      isComplete: false,
      matchedCount: 0,
      normalizedText: '',
      rawText: '',
    };
  }

  const lines = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const recognizedKeys = new Set();
  let pendingKey = null;

  for (const line of lines) {
    const matchedField = matchSizeField(line);

    if (matchedField) {
      recognizedKeys.add(matchedField.key);

      if (matchedField.value) {
        fields[matchedField.key] = matchedField.value;
        pendingKey = null;
      } else {
        pendingKey = matchedField.key;
      }

      continue;
    }

    if (pendingKey) {
      fields[pendingKey] = line;
      pendingKey = null;
    }
  }

  const matchedCount = recognizedKeys.size;
  const hasStructuredData = matchedCount > 0;
  const normalizedText = hasStructuredData
    ? formatStructuredSizeLines(fields).join('\n')
    : rawText;
  const displayText = hasStructuredData
    ? formatStructuredSizeLines(fields, '-').join('\n')
    : rawText;
  const isComplete = REGISTRATION_SIZE_FIELDS.every((field) => normalizeTextValue(fields[field.key]));

  return {
    displayText,
    fields,
    hasStructuredData,
    isComplete,
    matchedCount,
    normalizedText,
    rawText,
  };
}

export function normalizeRegistrationSizes(value) {
  const parsed = parseRegistrationSizes(value);
  return parsed.normalizedText || parsed.rawText;
}

export function formatRegistrationSizes(value, { includeTitle = true } = {}) {
  const parsed = parseRegistrationSizes(value);
  const bestEffortLines = parsed.hasStructuredData ? null : formatBestEffortSizeLines(parsed.rawText);
  const body = bestEffortLines?.join('\n') || parsed.displayText || '-';

  if (!includeTitle) {
    return body;
  }

  return ['Размеры:', body].join('\n');
}
