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
