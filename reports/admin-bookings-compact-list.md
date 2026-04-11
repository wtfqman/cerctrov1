# Admin Bookings Compact List

## src/utils/formatters.js

```js
import {
  ADMIN_ROLE_LABELS,
  BOOKING_REQUEST_TYPE_LABELS,
  BOOKING_STATUS_LABELS,
  ROOT_ADMIN_TELEGRAM_ID,
  VISIT_MODE_LABELS,
} from './constants.js';
import { getUserVisibleBoutiqueLabel } from './boutiques.js';
import { formatDate } from './date.js';
import {
  formatRegistrationSizes,
  getRegistrationCdekAddress,
  getRegistrationHomeAddress,
} from './registration.js';
import { formatSlotLabelForUser } from './slots.js';

function getInlineUsername(user) {
  const username = user?.registration?.telegramUsername ?? (user?.username ? `@${user.username}` : null);
  return username || 'Р±РµР· username';
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

  return `РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ ${user?.telegramId ?? 'Р±РµР· РёРјРµРЅРё'}`;
}

export function formatBoutiqueAddress(boutique) {
  return [boutique?.addressLine1, boutique?.addressLine2, boutique?.city].filter(Boolean).join(', ');
}

export function formatBoutiquesList(boutiques) {
  if (!Array.isArray(boutiques) || boutiques.length === 0) {
    return 'Р‘СѓС‚РёРєРё РїРѕРєР° РЅРµ РґРѕР±Р°РІР»РµРЅС‹.';
  }

  return boutiques
    .map((boutique, index) => {
      const timeSlotsCount = Array.isArray(boutique.timeSlots) ? boutique.timeSlots.length : 0;

      return [
        `${index + 1}. ${boutique.name}`,
        `РђРґСЂРµСЃ: ${formatBoutiqueAddress(boutique) || 'РќРµ СѓРєР°Р·Р°РЅ'}`,
        `РЎР»РѕС‚РѕРІ: ${timeSlotsCount}`,
      ].join('\n');
    })
    .join('\n\n');
}

export function formatTimeSlotsList(timeSlots) {
  if (!Array.isArray(timeSlots) || timeSlots.length === 0) {
    return 'Р’СЂРµРјРµРЅРЅС‹Рµ СЃР»РѕС‚С‹ РїРѕРєР° РЅРµ РґРѕР±Р°РІР»РµРЅС‹.';
  }

  return timeSlots
    .map((slot, index) => {
      const status = slot.isActive === false ? 'РЅРµР°РєС‚РёРІРµРЅ' : 'Р°РєС‚РёРІРµРЅ';

      return `${index + 1}. ${formatSlotLabelForUser(slot.label)} (${status})`;
    })
    .join('\n');
}

export function formatAvailableSlotsList(slots, date = null) {
  if (!Array.isArray(slots) || slots.length === 0) {
    return 'РќР° СЌС‚Сѓ РґР°С‚Сѓ РїРѕРєР° РЅРµС‚ СЃРІРѕР±РѕРґРЅС‹С… СЃР»РѕС‚РѕРІ.';
  }

  const header = date ? `РЎРІРѕР±РѕРґРЅС‹Рµ СЃР»РѕС‚С‹ РЅР° ${formatDate(date, 'DD.MM.YYYY')}:` : 'РЎРІРѕР±РѕРґРЅС‹Рµ СЃР»РѕС‚С‹:';
  const lines = slots.map((entry, index) => {
    const slot = entry.slot ?? entry;
    const statusText =
      entry.statusText ??
      (entry.isAvailable ? 'РЎРІРѕР±РѕРґРЅРѕ' : entry.isClosedByAdmin ? 'Р—Р°РєСЂС‹С‚Рѕ' : 'РќРµРґРѕСЃС‚СѓРїРЅРѕ');

    return `${index + 1}. ${formatSlotLabelForUser(slot.label)} - ${statusText}`;
  });

  return [header, ...lines].join('\n');
}

export function formatBookingSummary(booking, { includeStatus = true, sanitizeBoutique = false } = {}) {
  const requestTypeLabel = BOOKING_REQUEST_TYPE_LABELS[booking.requestType] ?? booking.requestType;
  const visitModeLabel = VISIT_MODE_LABELS[booking.visitMode] ?? booking.visitMode;
  const statusLabel = BOOKING_STATUS_LABELS[booking.status] ?? booking.status;
  const boutiqueLabel = sanitizeBoutique
    ? getUserVisibleBoutiqueLabel(booking, 'РќРµ РІС‹Р±СЂР°РЅ')
    : booking.boutique?.name ?? booking.boutiqueAddress ?? 'РќРµ РІС‹Р±СЂР°РЅ';

  const lines = [`${requestTypeLabel} / ${visitModeLabel}`];

  if (includeStatus) {
    lines.push(`РЎС‚Р°С‚СѓСЃ: ${statusLabel}`);
  }

  if (booking.visitMode === 'BOUTIQUE') {
    lines.push(`Р‘СѓС‚РёРє: ${boutiqueLabel}`);

    if (booking.visitDate) {
      lines.push(`Р”РµРЅСЊ: ${formatDate(booking.visitDate, 'DD.MM.YYYY')}`);
    }

    if (booking.slotLabel) {
      lines.push(`Р’СЂРµРјСЏ: ${formatSlotLabelForUser(booking.slotLabel)}`);
    }
  }

  if (booking.visitMode === 'DELIVERY') {
    lines.push(`РђРґСЂРµСЃ: ${booking.deliveryAddress ?? 'РќРµ СѓРєР°Р·Р°РЅ'}`);
  }

  if (booking.wishText) {
    lines.push(`РџРѕР¶РµР»Р°РЅРёСЏ: ${booking.wishText}`);
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

  return parts.join(' вЂў ');
}

function getCompactUserBookingStatus(booking) {
  if (booking.status === 'CANCELLED') {
    return 'РћС‚РјРµРЅРµРЅР°';
  }

  if (booking.status === 'COMPLETED') {
    return 'Р—Р°РІРµСЂС€РµРЅР°';
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
    lines.push(getUserVisibleBoutiqueLabel(booking, 'Р‘СѓС‚РёРє РЅРµ СѓРєР°Р·Р°РЅ'));

    const dateTimeLine = buildUserBookingDateTimeLine(booking);

    if (dateTimeLine) {
      lines.push(dateTimeLine);
    }
  }

  if (booking.visitMode === 'DELIVERY') {
    lines.push(booking.deliveryAddress ?? 'РђРґСЂРµСЃ РґРѕСЃС‚Р°РІРєРё РЅРµ СѓРєР°Р·Р°РЅ');
  }

  if (booking.wishText) {
    lines.push(`РџРѕР¶РµР»Р°РЅРёСЏ: ${booking.wishText}`);
  }

  if (includeStatus) {
    const statusLine = getCompactUserBookingStatus(booking);

    if (statusLine) {
      lines.push(statusLine);
    }
  }

  return lines.join('\n');
}

export function formatUserBookingArchive(bookings, title = 'РџСЂРѕС€Р»С‹Рµ Р·Р°СЏРІРєРё') {
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
    'Р“РѕС‚РѕРІРѕ рџ’«',
    'Р—Р°СЏРІРєР° СЃРѕС…СЂР°РЅРµРЅР°.',
    '',
    `${requestTypeLabel} / ${visitModeLabel}`,
  ];

  if (booking.visitMode === 'BOUTIQUE') {
    lines.push(`Р‘СѓС‚РёРє: ${getUserVisibleBoutiqueLabel(booking, 'РќРµ СѓРєР°Р·Р°РЅ')}`);
    lines.push(`Р”РµРЅСЊ: ${booking.visitDate ? formatDate(booking.visitDate, 'DD.MM.YYYY') : 'РќРµ СѓРєР°Р·Р°РЅ'}`);
    lines.push(`Р’СЂРµРјСЏ: ${formatSlotLabelForUser(booking.slotLabel) || 'РќРµ СѓРєР°Р·Р°РЅРѕ'}`);
  }

  if (booking.visitMode === 'DELIVERY') {
    lines.push(`РђРґСЂРµСЃ: ${booking.deliveryAddress ?? 'РќРµ СѓРєР°Р·Р°РЅ'}`);
  }

  if (booking.wishText) {
    lines.push(`РџРѕР¶РµР»Р°РЅРёСЏ: ${booking.wishText}`);
  }

  return lines.join('\n');
}

export function formatRegistrationSummary(registration) {
  return `Р РµРіРёСЃС‚СЂР°С†РёСЏ СЃРѕС…СЂР°РЅРµРЅР° рџ’«\n${registration.fullName}`;
}

export function formatRegistrationDetails(registration) {
  const homeAddress = getRegistrationHomeAddress(registration);
  const cdekAddress = getRegistrationCdekAddress(registration);
  const lines = [
    'Р”Р°РЅРЅС‹Рµ:',
    `Р¤РРћ: ${registration.fullName}`,
    `РўРµР»РµС„РѕРЅ: ${registration.phone}`,
    `РќРёРє: ${registration.telegramUsername}`,
    `Р”РѕРјР°С€РЅРёР№ Р°РґСЂРµСЃ: ${homeAddress || 'РЅРµ СѓРєР°Р·Р°РЅ'}`,
    `РђРґСЂРµСЃ РЎР”Р­Рљ: ${cdekAddress || 'РЅРµ СѓРєР°Р·Р°РЅ'}`,
    '',
    formatRegistrationSizes(registration.sizes),
  ];

  return lines.join('\n');
}

export function formatRegistrationConfirmation(data) {
  const homeAddress = getRegistrationHomeAddress(data);
  const cdekAddress = getRegistrationCdekAddress(data);
  const lines = [
    'РџСЂРѕРІРµСЂСЊ РґР°РЅРЅС‹Рµ:',
    '',
    `Р¤РРћ: ${data.fullName}`,
    `РўРµР»РµС„РѕРЅ: ${data.phone}`,
    `РќРёРє: ${data.telegramUsername}`,
    `Р”РѕРјР°С€РЅРёР№ Р°РґСЂРµСЃ: ${homeAddress || 'РЅРµ СѓРєР°Р·Р°РЅ'}`,
    `РђРґСЂРµСЃ РЎР”Р­Рљ: ${cdekAddress || 'РЅРµ СѓРєР°Р·Р°РЅ'}`,
    '',
    formatRegistrationSizes(data.sizes),
    '',
    'Р•СЃР»Рё РІСЃС‘ РІРµСЂРЅРѕ, РЅР°Р¶РјРё В«РџРѕРґС‚РІРµСЂРґРёС‚СЊВ».',
  ];

  return lines.join('\n');
}

export function formatTimerStatusSummary(timerStatus) {
  if (!timerStatus?.hasActiveTimer || !timerStatus.timer) {
    return 'РЎРµР№С‡Р°СЃ Сѓ С‚РµР±СЏ РЅРµС‚ Р°РєС‚РёРІРЅРѕР№ РІС‹РґР°С‡Рё РѕР±СЂР°Р·РѕРІ.';
  }

  const { daysPassed, timer } = timerStatus;
  const statusLabel =
    {
      ACTIVE: 'РѕР±СЂР°Р·С‹ Сѓ РІР°СЃ',
      RETURNED: 'РѕР±СЂР°Р·С‹ РІРѕР·РІСЂР°С‰РµРЅС‹',
      OVERDUE: 'РїРѕСЂР° РѕС„РѕСЂРјРёС‚СЊ РІРѕР·РІСЂР°С‚',
    }[timer.status] ?? 'РѕР±СЂР°Р·С‹ Сѓ РІР°СЃ';

  return [
    'РџРѕ РІРµС‰Р°Рј:',
    `РЎРµР№С‡Р°СЃ: ${statusLabel}`,
    `Р’Р·СЏС‚Рѕ: ${formatDate(timer.takenAt, 'DD.MM.YYYY HH:mm')}`,
    `РџСЂРѕС€Р»Рѕ РґРЅРµР№: ${daysPassed}`,
  ].join('\n');
}

export function formatAdminWelcome() {
  return [
    'РђРґРјРёРЅ-РјРµРЅСЋ',
    'Р’С‹Р±РµСЂРё РґРµР№СЃС‚РІРёРµ:',
  ].join('\n');
}

export function formatAdminRoleLabel(role) {
  return ADMIN_ROLE_LABELS[role] ?? String(role ?? '').toLowerCase();
}

export function formatAdminAccountSummary(admin, { includeStatus = true } = {}) {
  const lines = [
    admin?.displayName || formatUserDisplayName(admin?.user),
    `Telegram ID: ${admin?.user?.telegramId ?? '\u043d\u0435 \u0443\u043a\u0430\u0437\u0430\u043d'}`,
    `\u0420\u043e\u043b\u044c: ${formatAdminRoleLabel(admin?.role)}`,
  ];

  if (admin?.user?.username) {
    lines.push(`Username: @${admin.user.username}`);
  }

  if (includeStatus) {
    lines.push(
      `\u0421\u0442\u0430\u0442\u0443\u0441: ${
        admin?.isActive === false ? '\u043e\u0442\u043a\u043b\u044e\u0447\u0451\u043d' : '\u0430\u043a\u0442\u0438\u0432\u0435\u043d'
      }`,
    );
  }

  if (admin?.user?.telegramId === ROOT_ADMIN_TELEGRAM_ID) {
    lines.push('\u0414\u043e\u0441\u0442\u0443\u043f: root admin');
  }

  return lines.join('\n');
}

export function formatAdminAccountsList(admins, title = '\u0410\u0434\u043c\u0438\u043d\u044b') {
  if (!Array.isArray(admins) || admins.length === 0) {
    return '\u0421\u043f\u0438\u0441\u043e\u043a \u0430\u0434\u043c\u0438\u043d\u043e\u0432 \u043f\u043e\u043a\u0430 \u043f\u0443\u0441\u0442.';
  }

  return [
    title,
    '',
    ...admins.map((admin, index) => (
      [`${index + 1}.`, formatAdminAccountSummary(admin)].join('\n')
    )),
  ].join('\n\n');
}

export function formatAdminUserSummary(user) {
  const homeAddress = getRegistrationHomeAddress(user.registration);
  const cdekAddress = getRegistrationCdekAddress(user.registration);
  const lines = [
    `${formatUserDisplayName(user)}`,
    `Username: ${getInlineUsername(user)}`,
    `Telegram ID: ${user.telegramId}`,
    `РЎС‚Р°С‚СѓСЃ: ${user.isBlocked ? 'Р·Р°Р±Р»РѕРєРёСЂРѕРІР°РЅ' : 'Р°РєС‚РёРІРµРЅ'}`,
  ];

  if (user.registration?.phone) {
    lines.push(`РўРµР»РµС„РѕРЅ: ${user.registration.phone}`);
  }

  if (homeAddress) {
    lines.push(`Р”РѕРјР°С€РЅРёР№ Р°РґСЂРµСЃ: ${homeAddress}`);
  }

  if (cdekAddress) {
    lines.push(`РђРґСЂРµСЃ РЎР”Р­Рљ: ${cdekAddress}`);
  }

  return lines.join('\n');
}

function getAdminBookingActorLine(booking) {
  const fullName = formatUserDisplayName(booking.user);
  const username = getInlineUsername(booking.user);

  return username ? `${fullName} В· ${username}` : fullName;
}

function formatAdminBookingDateTimeLine(booking) {
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

  return parts.join(' В· ');
}

export function formatAdminBookingCard(booking, { title = null } = {}) {
  const requestTypeLabel = BOOKING_REQUEST_TYPE_LABELS[booking.requestType] ?? booking.requestType;
  const visitModeLabel = VISIT_MODE_LABELS[booking.visitMode] ?? booking.visitMode;
  const lines = [];

  if (title) {
    lines.push(title);
  }

  lines.push(getAdminBookingActorLine(booking));
  lines.push(`${requestTypeLabel} / ${visitModeLabel}`);

  if (booking.visitMode === 'BOUTIQUE') {
    lines.push(getUserVisibleBoutiqueLabel(booking, 'Р‘СѓС‚РёРє РЅРµ СѓРєР°Р·Р°РЅ'));

    const dateTimeLine = formatAdminBookingDateTimeLine(booking);

    if (dateTimeLine) {
      lines.push(dateTimeLine);
    }
  }

  if (booking.visitMode === 'DELIVERY') {
    lines.push(booking.deliveryAddress ?? 'РђРґСЂРµСЃ РЅРµ СѓРєР°Р·Р°РЅ');
  }

  return lines.join('\n');
}

export function formatAdminBookingList(bookings, title, emptyMessage = 'РџРѕРєР° Р·Р°СЏРІРѕРє РЅРµС‚.') {
  if (!Array.isArray(bookings) || bookings.length === 0) {
    return emptyMessage;
  }

  const items = bookings.map((booking, index) => (
    formatAdminBookingCard(booking, {
      title: `${index + 1}.`,
    })
  ));

  return [title, '', ...items].join('\n\n');
}

export function formatAdminDebtorsList(timers, daysThreshold) {
  if (!Array.isArray(timers) || timers.length === 0) {
    return 'РЎРµР№С‡Р°СЃ РґРѕР»Р¶РЅРёРєРѕРІ РЅРµС‚.';
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
      `Р’Р·СЏР» РѕР±СЂР°Р·С‹: ${formatDate(timer.takenAt, 'DD.MM.YYYY HH:mm')}`,
      `РџСЂРѕС€Р»Рѕ РґРЅРµР№: ${daysPassed}`,
      `РџРѕСЂРѕРі РїСЂРѕСЃСЂРѕС‡РєРё: ${daysThreshold} РґРЅРµР№`,
    ];

    if (timer.booking) {
      lines.push(`РЎРІСЏР·СЊ СЃ Р·Р°СЏРІРєРѕР№: ${formatBookingSummary(timer.booking)}`);
    }

    return lines.join('\n');
  });

  return ['Р”РѕР»Р¶РЅРёРєРё РїРѕ РІРµС‰Р°Рј', '', ...items].join('\n\n');
}

export function formatAdminSlotStateList(entries, date, mode = 'close') {
  if (!Array.isArray(entries) || entries.length === 0) {
    return mode === 'open'
      ? 'РќР° РІС‹Р±СЂР°РЅРЅСѓСЋ РґР°С‚Сѓ РЅРµС‚ Р·Р°РєСЂС‹С‚С‹С… СЃР»РѕС‚РѕРІ.'
      : 'РќР° РІС‹Р±СЂР°РЅРЅСѓСЋ РґР°С‚Сѓ РЅРµС‚ СЃР»РѕС‚РѕРІ.';
  }

  const header =
    mode === 'open'
      ? `Р—Р°РєСЂС‹С‚С‹Рµ СЃР»РѕС‚С‹ РЅР° ${formatDate(date, 'DD.MM.YYYY')}:`
      : `РЎР»РѕС‚С‹ РЅР° ${formatDate(date, 'DD.MM.YYYY')}:`;

  const lines = entries.map((entry, index) => {
    const status = entry.closure
      ? `Р·Р°РєСЂС‹С‚${entry.closure.reason ? `: ${entry.closure.reason}` : ''}`
      : entry.booking
        ? 'Р·Р°РЅСЏС‚ РїРѕР»СЊР·РѕРІР°С‚РµР»РµРј'
        : 'СЃРІРѕР±РѕРґРµРЅ';

    return `${index + 1}. ${formatSlotLabelForUser(entry.slot.label)} - ${status}`;
  });

  return [header, ...lines].join('\n');
}
```

