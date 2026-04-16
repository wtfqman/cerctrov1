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

function normalizeTelegramUsername(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();

  if (!normalized) {
    return null;
  }

  return normalized.startsWith('@') ? normalized : `@${normalized}`;
}

export function getPreferredTelegramUsername(user) {
  return normalizeTelegramUsername(user?.username) ?? normalizeTelegramUsername(user?.registration?.telegramUsername);
}

function getInlineUsername(user) {
  const username = getPreferredTelegramUsername(user);
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

export function formatAdminUserIdentityLines(user, { label = 'Креатор' } = {}) {
  const fullName =
    user?.registration?.fullName ||
    [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim();
  const username = getPreferredTelegramUsername(user);
  const lines = [];

  if (fullName) {
    lines.push(label ? `${label}: ${fullName}` : fullName);
  }

  if (username) {
    lines.push(`Username: ${username}`);
  } else if (user?.telegramId) {
    lines.push(`Telegram ID: ${user.telegramId}`);
  } else if (!fullName) {
    lines.push('Telegram ID: не указан');
  }

  return lines;
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

export function formatBookingSummary(booking, { includeStatus = true, sanitizeBoutique = false } = {}) {
  const requestTypeLabel = BOOKING_REQUEST_TYPE_LABELS[booking.requestType] ?? booking.requestType;
  const visitModeLabel = VISIT_MODE_LABELS[booking.visitMode] ?? booking.visitMode;
  const statusLabel = BOOKING_STATUS_LABELS[booking.status] ?? booking.status;
  const boutiqueLabel = sanitizeBoutique
    ? getUserVisibleBoutiqueLabel(booking, 'Не выбран')
    : booking.boutique?.name ?? booking.boutiqueAddress ?? 'Не выбран';

  const lines = [`${requestTypeLabel} / ${visitModeLabel}`];

  if (includeStatus) {
    lines.push(`Статус: ${statusLabel}`);
  }

  if (booking.visitMode === 'BOUTIQUE') {
    lines.push(`Бутик: ${boutiqueLabel}`);

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
    lines.push(getUserVisibleBoutiqueLabel(booking, 'Бутик не указан'));

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
    lines.push(`Бутик: ${getUserVisibleBoutiqueLabel(booking, 'Не указан')}`);
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

function getAdminBookingActorLine(booking) {
  const fullName = formatUserDisplayName(booking.user);
  const username = getInlineUsername(booking.user);

  return username ? `${fullName} · ${username}` : fullName;
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

  return parts.join(' · ');
}

function getAdminBookingBoutiqueLabel(booking) {
  const boutiqueName = typeof booking?.boutique?.name === 'string' ? booking.boutique.name.trim() : '';

  if (boutiqueName) {
    return boutiqueName;
  }

  const boutiqueAddress = typeof booking?.boutiqueAddress === 'string' ? booking.boutiqueAddress.trim() : '';

  return boutiqueAddress || 'Бутик не указан';
}

function getAdminBookingFullName(booking) {
  return (
    booking?.user?.registration?.fullName ||
    [booking?.user?.firstName, booking?.user?.lastName].filter(Boolean).join(' ').trim() ||
    'Не указано'
  );
}

function getAdminBookingPhone(booking) {
  return booking?.user?.registration?.phone ?? booking?.contactPhone ?? booking?.user?.phone ?? null;
}

function getAdminBookingDateLine(booking) {
  return booking?.visitDate
    ? `Дата: ${formatDate(booking.visitDate, 'DD.MM.YYYY')}`
    : 'Дата: не указана';
}

function getAdminBookingTimeLine(booking) {
  const slotLabel = formatSlotLabelForUser(booking?.slotLabel ?? booking?.timeSlot?.label);
  return slotLabel ? `Время: ${slotLabel}` : 'Время: не указано';
}

function getAdminBookingLocationLine(booking) {
  if (booking?.visitMode === 'BOUTIQUE') {
    return `Бутик: ${getAdminBookingBoutiqueLabel(booking)}`;
  }

  return `Адрес: ${booking?.deliveryAddress ?? 'не указан'}`;
}

function truncateText(value, maxLength = 48) {
  if (typeof value !== 'string') {
    return '';
  }

  const normalized = value.trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(maxLength - 1, 1)).trim()}…`;
}

export function hasAdminBookingUserPdf(booking) {
  const telegramFileId = booking?.user?.personalPdf?.telegramFileId;
  return typeof telegramFileId === 'string' && telegramFileId.trim() !== '';
}

function getAdminBookingSelectorActor(booking) {
  const registrationFullName =
    typeof booking?.user?.registration?.fullName === 'string'
      ? booking.user.registration.fullName.trim()
      : '';

  return registrationFullName || getPreferredTelegramUsername(booking?.user) || 'Пользователь';
}

export function formatAdminBookingSelectorLabel(booking, index = null) {
  const actor = getAdminBookingSelectorActor(booking);
  const parts = [actor];

  if (booking?.visitDate) {
    parts.push(formatDate(booking.visitDate, 'DD.MM'));
  } else if (booking?.visitMode === 'DELIVERY') {
    parts.push('доставка');
  }

  const slotLabel = formatSlotLabelForUser(booking?.slotLabel ?? booking?.timeSlot?.label);

  if (slotLabel) {
    parts.push(slotLabel);
  }

  const label = parts.join(' · ');

  return index === null
    ? truncateText(label)
    : truncateText(`${index + 1}. ${label}`);
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
    lines.push(getAdminBookingBoutiqueLabel(booking));

    const dateTimeLine = formatAdminBookingDateTimeLine(booking);

    if (dateTimeLine) {
      lines.push(dateTimeLine);
    }
  }

  if (booking.visitMode === 'DELIVERY') {
    lines.push(booking.deliveryAddress ?? 'Адрес не указан');
  }

  lines.push(`PDF: ${hasAdminBookingUserPdf(booking) ? 'да' : 'нет'}`);

  return lines.join('\n');
}

export function formatAdminDailyBookingSummary(
  bookings,
  {
    title = 'Новые заявки за день',
    periodLabel = '',
  } = {},
) {
  if (!Array.isArray(bookings) || bookings.length === 0) {
    return 'Новых заявок за день нет.';
  }

  const items = bookings.map((booking, index) => {
    const requestTypeLabel = BOOKING_REQUEST_TYPE_LABELS[booking.requestType] ?? booking.requestType;
    const visitModeLabel = VISIT_MODE_LABELS[booking.visitMode] ?? booking.visitMode;
    const lines = [
      `${index + 1}.`,
      getAdminBookingActorLine(booking),
      `${requestTypeLabel} / ${visitModeLabel}`,
      booking.visitMode === 'BOUTIQUE'
        ? getAdminBookingBoutiqueLabel(booking)
        : booking.deliveryAddress ?? 'Адрес не указан',
    ];

    const dateTimeLine = formatAdminBookingDateTimeLine(booking);

    if (dateTimeLine) {
      lines.push(dateTimeLine);
    }

    lines.push(`PDF: ${hasAdminBookingUserPdf(booking) ? 'да' : 'нет'}`);

    return lines.join('\n');
  });

  return [title, periodLabel, ...items].filter(Boolean).join('\n\n');
}

export function formatAdminBookingDetailCard(booking, { title = 'Заявка' } = {}) {
  const requestTypeLabel = BOOKING_REQUEST_TYPE_LABELS[booking.requestType] ?? booking.requestType;
  const visitModeLabel = VISIT_MODE_LABELS[booking.visitMode] ?? booking.visitMode;
  const username = getPreferredTelegramUsername(booking?.user);
  const lines = [
    title,
    '',
    `ФИО: ${getAdminBookingFullName(booking)}`,
    username ? `Username: ${username}` : `Telegram ID: ${booking?.user?.telegramId ?? 'не указан'}`,
    getAdminBookingPhone(booking) ? `Телефон: ${getAdminBookingPhone(booking)}` : null,
    `Тип заявки: ${requestTypeLabel}`,
    `Формат: ${visitModeLabel}`,
    getAdminBookingLocationLine(booking),
    getAdminBookingDateLine(booking),
    getAdminBookingTimeLine(booking),
    `PDF: ${hasAdminBookingUserPdf(booking) ? 'да' : 'нет'}`,
  ].filter(Boolean);

  return lines.join('\n');
}

export function formatAdminBookingList(bookings, title, emptyMessage = 'Пока заявок нет.') {
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
