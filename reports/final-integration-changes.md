# Final Integration Changes

## src/utils/mail.js
```js
import { ValidationError } from './errors.js';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const EMAIL_LIST_SEPARATOR = /[,\n;]+/;
const OPTIONAL_SKIP_MARKERS = new Set(['-', 'нет', 'none', 'no', 'пропустить']);

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function isValidEmailAddress(value) {
  return EMAIL_REGEX.test(normalizeString(value));
}

export function normalizeEmail(value, fieldName = 'Email') {
  const normalized = normalizeString(value);

  if (!normalized) {
    throw new ValidationError(`Поле "${fieldName}" обязательно`);
  }

  if (!isValidEmailAddress(normalized)) {
    throw new ValidationError(`Поле "${fieldName}" заполнено некорректно`);
  }

  return normalized.toLowerCase();
}

export function normalizeOptionalEmail(value, fieldName = 'Email') {
  const normalized = normalizeString(value);

  if (!normalized || OPTIONAL_SKIP_MARKERS.has(normalized.toLowerCase())) {
    return null;
  }

  return normalizeEmail(normalized, fieldName);
}

export function normalizeEmailList(value, { allowEmpty = true, fieldName = 'Email' } = {}) {
  const normalized = normalizeString(value);

  if (!normalized || OPTIONAL_SKIP_MARKERS.has(normalized.toLowerCase())) {
    if (allowEmpty) {
      return [];
    }

    throw new ValidationError(`Поле "${fieldName}" обязательно`);
  }

  const items = normalized
    .split(EMAIL_LIST_SEPARATOR)
    .map((item) => item.trim())
    .filter(Boolean);

  if (items.length === 0) {
    if (allowEmpty) {
      return [];
    }

    throw new ValidationError(`Поле "${fieldName}" обязательно`);
  }

  return [...new Set(items.map((item) => normalizeEmail(item, fieldName)))];
}

export function formatEmailList(value) {
  if (Array.isArray(value)) {
    return value.join(', ');
  }

  return normalizeString(value);
}

```

## src/services/bookingService.js
```js
import { BookingRequestType, BookingStatus, Prisma, TimerStatus, VisitMode } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

import { ADMIN_PERMISSIONS, AUDIT_ACTIONS } from '../utils/constants.js';
import { dayjs, formatDate, getNextAvailableBookingDates, now, startOfDate } from '../utils/date.js';
import { AppError, ForbiddenError, NotFoundError, ValidationError } from '../utils/errors.js';
import { normalizeEmail, normalizeEmailList, normalizeOptionalEmail } from '../utils/mail.js';
import {
  formatAvailableSlotsList,
  formatBoutiqueAddress,
  formatBoutiquesList,
  formatTimeSlotsList,
} from '../utils/formatters.js';
import { ensureFutureOrToday, ensureNonEmptyString, normalizeTelegramId } from '../utils/validators.js';

const ACTIVE_BOOKING_STATUSES = [BookingStatus.CREATED, BookingStatus.SUBMITTED];
const OPEN_TIMER_STATUSES = [TimerStatus.ACTIVE, TimerStatus.OVERDUE];
const ADMIN_USER_INCLUDE = Object.freeze({
  registration: true,
  _count: {
    select: {
      bookings: true,
      timers: true,
    },
  },
});
const ADMIN_BOOKING_INCLUDE = Object.freeze({
  user: {
    include: {
      registration: true,
    },
  },
  boutique: true,
  timeSlot: true,
});
const USER_BOOKING_INCLUDE = Object.freeze({
  boutique: true,
  timeSlot: true,
});
const USER_BOOKING_WITH_USER_INCLUDE = Object.freeze({
  ...USER_BOOKING_INCLUDE,
  user: {
    include: {
      registration: true,
    },
  },
});

function buildActiveSlotKey({ boutiqueId, slotId, visitDate }) {
  return `${boutiqueId}:${slotId}:${dayjs(visitDate).format('YYYY-MM-DD')}`;
}

function normalizeOptionalText(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized === '' ? null : normalized;
}

function buildBoutiqueCode({ code, name, city, addressLine1 }) {
  if (code) {
    return ensureNonEmptyString(code, 'Код бутика').toUpperCase();
  }

  const randomCode = uuidv4().split('-')[0].toUpperCase();
  const cityFragment = String(city ?? '').trim().toUpperCase().slice(0, 3);
  const addressFragment = String(addressLine1 ?? '').replace(/\s+/g, '').slice(0, 6).toUpperCase();
  const nameFragment = String(name ?? '').replace(/\s+/g, '').slice(0, 6).toUpperCase();

  return [cityFragment, nameFragment || addressFragment, randomCode].filter(Boolean).join('_');
}

function buildSlotComment({ boutique, date, slot, reason = '' }) {
  return [
    `Бутик: ${boutique.name}`,
    `Дата: ${formatDate(date, 'DD.MM.YYYY')}`,
    `Слот: ${slot.label}`,
    reason ? `Причина: ${reason}` : '',
  ]
    .filter(Boolean)
    .join(' | ');
}

function buildUserComment(user, reason = '') {
  const fullName =
    user?.registration?.fullName ||
    [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim() ||
    'Без имени';
  const username = user?.registration?.telegramUsername ?? (user?.username ? `@${user.username}` : 'без username');

  return [
    `Пользователь: ${fullName}`,
    `Username: ${username}`,
    `Telegram ID: ${user.telegramId}`,
    reason ? `Комментарий: ${reason}` : '',
  ]
    .filter(Boolean)
    .join(' | ');
}

function buildBookingChangeComment(booking, action, extra = '') {
  return [
    `action: ${action}`,
    booking?.publicId ? `booking_id: ${booking.publicId}` : '',
    extra,
  ]
    .filter(Boolean)
    .join(' | ');
}

function isUniqueConstraintError(error, fieldName) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002' &&
    Array.isArray(error.meta?.target) &&
    error.meta.target.includes(fieldName)
  );
}

function normalizeUsernameQuery(value) {
  const rawValue = ensureNonEmptyString(value, 'Username');
  const withoutAt = rawValue.replace(/^@/, '');

  return {
    withAt: rawValue.startsWith('@') ? rawValue : `@${rawValue}`,
    withoutAt,
  };
}

export function createBookingService({ prisma, logger, googleSheets, adminService, emailService }) {
  const serviceLogger = logger.child({ service: 'booking' });

  async function getBoutiques({ includeInactive = false, includeTimeSlots = true } = {}) {
    return prisma.boutique.findMany({
      where: includeInactive ? undefined : { isActive: true },
      include: includeTimeSlots
        ? {
            timeSlots: {
              where: includeInactive ? undefined : { isActive: true },
              orderBy: [{ sortOrder: 'asc' }, { startTime: 'asc' }],
            },
          }
        : undefined,
      orderBy: [{ city: 'asc' }, { name: 'asc' }],
    });
  }

  async function createBoutique(data, adminActorId) {
    const admin = await adminService.assertPermission(adminActorId, ADMIN_PERMISSIONS.MANAGE_BOUTIQUES);
    const name = ensureNonEmptyString(data.name, 'Название бутика');
    const addressLine1 = ensureNonEmptyString(data.addressLine1, 'Адрес бутика');
    const city = ensureNonEmptyString(data.city, 'Город');
    const email = normalizeOptionalEmail(data.email, 'Email бутика');
    const ccEmails = Array.isArray(data.ccEmails)
      ? [...new Set(data.ccEmails.map((item) => normalizeEmail(item, 'Дополнительные email')))]
      : normalizeEmailList(data.ccEmails ?? '', {
          allowEmpty: true,
          fieldName: 'Дополнительные email',
        });
    const code = buildBoutiqueCode({
      code: data.code,
      name,
      city,
      addressLine1,
    });

    const existing = await prisma.boutique.findFirst({
      where: {
        OR: [
          { code },
          {
            name,
            addressLine1,
            city,
          },
        ],
      },
    });

    let boutique;

    if (existing?.isActive) {
      throw new ValidationError('Бутик с такими данными уже существует');
    }

    if (existing) {
      boutique = await prisma.boutique.update({
        where: { id: existing.id },
        data: {
          code,
          name,
          addressLine1,
          addressLine2: data.addressLine2 ?? null,
          ccEmails: ccEmails.length > 0 ? ccEmails.join(', ') : null,
          city,
          email,
          notes: data.notes ?? null,
          isActive: true,
        },
      });
    } else {
      boutique = await prisma.boutique.create({
        data: {
          code,
          name,
          addressLine1,
          addressLine2: data.addressLine2 ?? null,
          ccEmails: ccEmails.length > 0 ? ccEmails.join(', ') : null,
          city,
          email,
          notes: data.notes ?? null,
          isActive: true,
        },
      });
    }

    await prisma.auditLog.create({
      data: {
        action: AUDIT_ACTIONS.BOUTIQUE_CREATED,
        adminId: admin.id,
        actorType: 'ADMIN',
        entityType: 'Boutique',
        entityId: boutique.id,
        message: `Создан или активирован бутик ${boutique.name}`,
      },
    });

    await googleSheets.logAdminAction({
      action: AUDIT_ACTIONS.BOUTIQUE_CREATED,
      adminId: admin.user.telegramId,
      comment: `Создан или активирован бутик "${boutique.name}" (${formatBoutiqueAddress(boutique)})`,
      status: 'active',
    });

    return boutique;
  }

  async function removeBoutique(boutiqueId, adminActorId) {
    const admin = await adminService.assertPermission(adminActorId, ADMIN_PERMISSIONS.MANAGE_BOUTIQUES);
    const boutique = await requireBoutique(boutiqueId, { includeInactive: true });

    await prisma.$transaction([
      prisma.boutique.update({
        where: { id: boutique.id },
        data: { isActive: false },
      }),
      prisma.timeSlot.updateMany({
        where: { boutiqueId: boutique.id },
        data: { isActive: false },
      }),
      prisma.slotClosure.updateMany({
        where: { boutiqueId: boutique.id },
        data: { isActive: false },
      }),
      prisma.auditLog.create({
        data: {
          action: AUDIT_ACTIONS.BOUTIQUE_REMOVED,
          adminId: admin.id,
          actorType: 'ADMIN',
          entityType: 'Boutique',
          entityId: boutique.id,
          message: `Бутик деактивирован: ${boutique.name}`,
        },
      }),
    ]);

    await googleSheets.logAdminAction({
      action: AUDIT_ACTIONS.BOUTIQUE_REMOVED,
      adminId: admin.user.telegramId,
      comment: `Бутик деактивирован: "${boutique.name}" (${formatBoutiqueAddress(boutique)})`,
      status: 'inactive',
    });

    return {
      ...boutique,
      isActive: false,
    };
  }

  async function getTimeSlots(boutiqueId = null, { includeInactive = false } = {}) {
    const where = {
      ...(includeInactive ? {} : { isActive: true }),
      ...(boutiqueId ? { boutiqueId } : {}),
    };

    return prisma.timeSlot.findMany({
      where,
      include: {
        boutique: true,
      },
      orderBy: [{ sortOrder: 'asc' }, { startTime: 'asc' }],
    });
  }

  async function createTimeSlot(boutiqueId, data, adminActorId) {
    const admin = await adminService.assertPermission(adminActorId, ADMIN_PERMISSIONS.MANAGE_TIME_SLOTS);
    const boutique = await requireBoutique(boutiqueId);
    const startTime = ensureNonEmptyString(data.startTime, 'Время начала');
    const endTime = ensureNonEmptyString(data.endTime, 'Время окончания');
    const label = data.label ? ensureNonEmptyString(data.label, 'Подпись слота') : `${startTime}-${endTime}`;
    const capacity = Number.isInteger(data.capacity) ? data.capacity : 1;
    const sortOrder = Number.isInteger(data.sortOrder) ? data.sortOrder : 0;

    const existing = await prisma.timeSlot.findUnique({
      where: {
        boutiqueId_startTime_endTime: {
          boutiqueId: boutique.id,
          startTime,
          endTime,
        },
      },
    });

    if (existing?.isActive) {
      throw new ValidationError('Такой слот уже существует в этом бутике');
    }

    let slot;

    if (existing) {
      slot = await prisma.timeSlot.update({
        where: { id: existing.id },
        data: {
          label,
          capacity,
          sortOrder,
          isActive: true,
        },
      });
    } else {
      slot = await prisma.timeSlot.create({
        data: {
          boutiqueId: boutique.id,
          label,
          startTime,
          endTime,
          capacity,
          sortOrder,
          isActive: true,
        },
      });
    }

    await prisma.auditLog.create({
      data: {
        action: AUDIT_ACTIONS.TIME_SLOT_CREATED,
        adminId: admin.id,
        actorType: 'ADMIN',
        entityType: 'TimeSlot',
        entityId: slot.id,
        message: `Создан или активирован слот ${slot.label} для бутика ${boutique.name}`,
      },
    });

    await googleSheets.logAdminAction({
      action: AUDIT_ACTIONS.TIME_SLOT_CREATED,
      adminId: admin.user.telegramId,
      comment: `Создан или активирован слот "${slot.label}" для бутика "${boutique.name}"`,
      status: 'active',
    });

    return slot;
  }

  async function removeTimeSlot(slotId, adminActorId) {
    const admin = await adminService.assertPermission(adminActorId, ADMIN_PERMISSIONS.MANAGE_TIME_SLOTS);
    const slot = await requireTimeSlot(slotId, { includeInactive: true });

    await prisma.$transaction([
      prisma.timeSlot.update({
        where: { id: slot.id },
        data: { isActive: false },
      }),
      prisma.slotClosure.updateMany({
        where: { timeSlotId: slot.id },
        data: { isActive: false },
      }),
      prisma.auditLog.create({
        data: {
          action: AUDIT_ACTIONS.TIME_SLOT_REMOVED,
          adminId: admin.id,
          actorType: 'ADMIN',
          entityType: 'TimeSlot',
          entityId: slot.id,
          message: `Слот деактивирован: ${slot.label}`,
        },
      }),
    ]);

    await googleSheets.logAdminAction({
      action: AUDIT_ACTIONS.TIME_SLOT_REMOVED,
      adminId: admin.user.telegramId,
      comment: `Слот деактивирован: "${slot.label}"`,
      status: 'inactive',
    });

    return {
      ...slot,
      isActive: false,
    };
  }

  async function getAvailableSlotsByDate(boutiqueId, date) {
    const boutique = await requireBoutique(boutiqueId);
    const normalizedDate = ensureFutureOrToday(date, 'Дата визита');

    const [slots, closures, bookings] = await Promise.all([
      prisma.timeSlot.findMany({
        where: {
          boutiqueId: boutique.id,
          isActive: true,
        },
        orderBy: [{ sortOrder: 'asc' }, { startTime: 'asc' }],
      }),
      prisma.slotClosure.findMany({
        where: {
          boutiqueId: boutique.id,
          date: startOfDate(normalizedDate),
          isActive: true,
        },
      }),
      prisma.booking.findMany({
        where: {
          visitMode: VisitMode.BOUTIQUE,
          boutiqueId: boutique.id,
          visitDate: startOfDate(normalizedDate),
          status: {
            in: ACTIVE_BOOKING_STATUSES,
          },
        },
        include: {
          user: true,
        },
      }),
    ]);

    const closureBySlotId = new Map(closures.map((closure) => [closure.timeSlotId, closure]));
    const bookingBySlotId = new Map(bookings.map((booking) => [booking.timeSlotId, booking]));

    return slots.map((slot) => {
      const closure = closureBySlotId.get(slot.id);
      const booking = bookingBySlotId.get(slot.id);
      const isAvailable = !closure && !booking;

      return {
        boutique,
        booking,
        closure,
        date: startOfDate(normalizedDate),
        isAvailable,
        slot,
        statusText: isAvailable
          ? 'Свободен'
          : closure
            ? `Закрыт администратором${closure.reason ? `: ${closure.reason}` : ''}`
            : 'Уже занят',
      };
    });
  }

  async function closeSlot(boutiqueId, date, slotId, adminActorId, reason = null) {
    const admin = await adminService.assertPermission(adminActorId, ADMIN_PERMISSIONS.MANAGE_SLOTS);
    const boutique = await requireBoutique(boutiqueId);
    const slot = await requireTimeSlot(slotId);
    const normalizedDate = startOfDate(ensureFutureOrToday(date, 'Дата визита'));

    if (slot.boutiqueId !== boutique.id) {
      throw new ValidationError('Слот не принадлежит выбранному бутику');
    }

    const closure = await prisma.slotClosure.upsert({
      where: {
        timeSlotId_date: {
          timeSlotId: slot.id,
          date: normalizedDate,
        },
      },
      create: {
        boutiqueId: boutique.id,
        timeSlotId: slot.id,
        date: normalizedDate,
        reason: normalizeOptionalText(reason),
        closedByAdminId: admin.id,
        isActive: true,
      },
      update: {
        reason: normalizeOptionalText(reason),
        closedByAdminId: admin.id,
        isActive: true,
      },
    });

    const comment = buildSlotComment({
      boutique,
      date: normalizedDate,
      reason: normalizeOptionalText(reason) ?? '',
      slot,
    });

    await prisma.auditLog.create({
      data: {
        action: AUDIT_ACTIONS.SLOT_CLOSED,
        adminId: admin.id,
        actorType: 'ADMIN',
        entityType: 'SlotClosure',
        entityId: closure.id,
        message: comment,
      },
    });

    await googleSheets.logAdminAction({
      action: AUDIT_ACTIONS.SLOT_CLOSED,
      adminId: admin.user.telegramId,
      comment,
      status: 'closed',
    });

    return closure;
  }

  async function openSlot(boutiqueId, date, slotId, adminActorId) {
    const admin = await adminService.assertPermission(adminActorId, ADMIN_PERMISSIONS.MANAGE_SLOTS);
    const boutique = await requireBoutique(boutiqueId);
    const slot = await requireTimeSlot(slotId);
    const normalizedDate = startOfDate(ensureFutureOrToday(date, 'Дата визита'));

    if (slot.boutiqueId !== boutique.id) {
      throw new ValidationError('Слот не принадлежит выбранному бутику');
    }

    const closure = await prisma.slotClosure.findUnique({
      where: {
        timeSlotId_date: {
          timeSlotId: slot.id,
          date: normalizedDate,
        },
      },
    });

    if (!closure?.isActive) {
      return null;
    }

    const reopenedClosure = await prisma.slotClosure.update({
      where: { id: closure.id },
      data: { isActive: false },
    });

    const comment = buildSlotComment({
      boutique,
      date: normalizedDate,
      slot,
    });

    await prisma.auditLog.create({
      data: {
        action: AUDIT_ACTIONS.SLOT_OPENED,
        adminId: admin.id,
        actorType: 'ADMIN',
        entityType: 'SlotClosure',
        entityId: closure.id,
        message: comment,
      },
    });

    await googleSheets.logAdminAction({
      action: AUDIT_ACTIONS.SLOT_OPENED,
      adminId: admin.user.telegramId,
      comment,
      status: 'opened',
    });

    return reopenedClosure;
  }

  async function isUserBlocked(userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return false;
    }

    if (user.isBlocked && user.blockedUntil && user.blockedUntil <= new Date()) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          isBlocked: false,
          blockedReason: null,
          blockedUntil: null,
          blockedByAdminId: null,
        },
      });

      return false;
    }

    return Boolean(user.isBlocked);
  }

  async function createBookingEmailFailureAudit(booking, errorMessage) {
    try {
      await prisma.auditLog.create({
        data: {
          action: AUDIT_ACTIONS.BOUTIQUE_BOOKING_EMAIL_FAILED,
          actorType: 'SYSTEM',
          entityType: 'Booking',
          entityId: booking.id,
          message: errorMessage,
          userId: booking.userId,
        },
      });
    } catch (auditError) {
      serviceLogger.error(
        {
          bookingId: booking.id,
          err: auditError,
          userId: booking.userId,
        },
        'Failed to write boutique booking email failure audit log',
      );
    }
  }

  async function notifyBoutiqueByEmail(booking) {
    if (booking.visitMode !== VisitMode.BOUTIQUE) {
      return {
        ok: false,
        reason: 'not_boutique_booking',
        skipped: true,
      };
    }

    const mailResult = await emailService.sendBoutiqueBookingNotification({ booking });

    if (mailResult?.ok) {
      serviceLogger.info(
        {
          bookingId: booking.id,
          boutiqueId: booking.boutiqueId,
          messageId: mailResult.messageId,
          to: booking?.boutique?.email ?? undefined,
          userId: booking.userId,
        },
        'Boutique booking email sent',
      );

      return mailResult;
    }

    if (!mailResult?.skipped) {
      const errorMessage = mailResult?.message ?? 'Boutique booking email failed';

      serviceLogger.error(
        {
          bookingId: booking.id,
          boutiqueId: booking.boutiqueId,
          errorMessage,
          userId: booking.userId,
        },
        'Boutique booking email failed',
      );

      await createBookingEmailFailureAudit(booking, errorMessage);
    }

    return mailResult;
  }

  async function blockUser(userId, adminActorId, reason = null) {
    const admin = await adminService.assertPermission(adminActorId, ADMIN_PERMISSIONS.MANAGE_USERS);
    const user = await requireUser(userId);
    const normalizedReason = normalizeOptionalText(reason) ?? 'Пользователь заблокирован администратором';

    const blockedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        isBlocked: true,
        blockedReason: normalizedReason,
        blockedByAdminId: admin.id,
      },
      include: {
        registration: true,
      },
    });

    await prisma.auditLog.create({
      data: {
        action: AUDIT_ACTIONS.USER_BLOCKED,
        adminId: admin.id,
        actorType: 'ADMIN',
        entityType: 'User',
        entityId: user.id,
        userId: user.id,
        message: normalizedReason,
      },
    });

    await googleSheets.logAdminAction({
      action: AUDIT_ACTIONS.USER_BLOCKED,
      adminId: admin.user.telegramId,
      targetUser: blockedUser,
      comment: buildUserComment(blockedUser, normalizedReason),
      status: 'blocked',
    });

    return blockedUser;
  }

  async function unblockUser(userId, adminActorId) {
    const admin = await adminService.assertPermission(adminActorId, ADMIN_PERMISSIONS.MANAGE_USERS);
    const user = await requireUser(userId);

    const unblockedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        isBlocked: false,
        blockedReason: null,
        blockedUntil: null,
        blockedByAdminId: null,
      },
      include: {
        registration: true,
      },
    });

    await prisma.auditLog.create({
      data: {
        action: AUDIT_ACTIONS.USER_UNBLOCKED,
        adminId: admin.id,
        actorType: 'ADMIN',
        entityType: 'User',
        entityId: user.id,
        userId: user.id,
        message: 'Пользователь разблокирован',
      },
    });

    await googleSheets.logAdminAction({
      action: AUDIT_ACTIONS.USER_UNBLOCKED,
      adminId: admin.user.telegramId,
      targetUser: unblockedUser,
      comment: buildUserComment(unblockedUser, 'Пользователь разблокирован'),
      status: 'unblocked',
    });

    return unblockedUser;
  }

  async function ensureCanCreateBooking(userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        registration: true,
      },
    });

    if (!user) {
      throw new AppError('Пользователь не найден', 404);
    }

    if (await isUserBlocked(user.id)) {
      throw new ForbiddenError('Пользователь заблокирован администратором');
    }

    if (!user.registration) {
      throw new ForbiddenError('Сначала пройди регистрацию.');
    }

    return user;
  }

  async function listUserBookings(userId, limit = 5) {
    return prisma.booking.findMany({
      where: { userId },
      include: USER_BOOKING_INCLUDE,
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
    });
  }

  async function getUserBookingById(userId, bookingId, { includeUser = false, prismaClient = prisma } = {}) {
    return prismaClient.booking.findFirst({
      where: {
        id: bookingId,
        userId,
      },
      include: includeUser ? USER_BOOKING_WITH_USER_INCLUDE : USER_BOOKING_INCLUDE,
    });
  }

  async function ensureBookingHasNoOpenTimer(bookingId, prismaClient = prisma) {
    const openTimer = await prismaClient.userItemTimer.findFirst({
      where: {
        bookingId,
        status: {
          in: OPEN_TIMER_STATUSES,
        },
      },
    });

    if (openTimer) {
      throw new ForbiddenError('Эту запись уже нельзя изменить. Напиши администратору.');
    }
  }

  async function requireUserActiveBoutiqueBooking(userId, bookingId, { includeUser = false, prismaClient = prisma } = {}) {
    const booking = await getUserBookingById(userId, bookingId, {
      includeUser,
      prismaClient,
    });

    if (!booking) {
      throw new NotFoundError('Запись не найдена.');
    }

    if (booking.visitMode !== VisitMode.BOUTIQUE) {
      throw new ForbiddenError('Эту заявку пока нельзя изменить.');
    }

    if (!ACTIVE_BOOKING_STATUSES.includes(booking.status)) {
      throw new ForbiddenError('Эта запись уже не активна.');
    }

    await ensureBookingHasNoOpenTimer(booking.id, prismaClient);

    return booking;
  }

  async function getUserActiveBoutiqueBooking(userId, bookingId) {
    return requireUserActiveBoutiqueBooking(userId, bookingId, {
      includeUser: true,
    });
  }

  async function listRecentBookings(limit = 10) {
    return prisma.booking.findMany({
      include: ADMIN_BOOKING_INCLUDE,
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
    });
  }

  async function listBookingsCreatedOnDate(date, limit = 50) {
    const start = dayjs(startOfDate(date));
    const end = start.add(1, 'day').toDate();

    return prisma.booking.findMany({
      where: {
        createdAt: {
          gte: start.toDate(),
          lt: end,
        },
      },
      include: ADMIN_BOOKING_INCLUDE,
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
    });
  }

  async function listTodayBookings(limit = 50) {
    return listBookingsCreatedOnDate(now().toDate(), limit);
  }

  async function findUserByTelegramId(telegramId) {
    const normalizedTelegramId = normalizeTelegramId(telegramId);

    return prisma.user.findUnique({
      where: {
        telegramId: normalizedTelegramId,
      },
      include: ADMIN_USER_INCLUDE,
    });
  }

  async function findUserByUsername(username) {
    const normalized = normalizeUsernameQuery(username);

    return prisma.user.findFirst({
      where: {
        OR: [
          {
            username: normalized.withoutAt,
          },
          {
            registration: {
              telegramUsername: normalized.withAt,
            },
          },
        ],
      },
      include: ADMIN_USER_INCLUDE,
    });
  }

  async function listUsersForAdmin({ blocked = null, limit = 10 } = {}) {
    const where = {};

    if (blocked === true) {
      where.isBlocked = true;
    }

    if (blocked === false) {
      where.isBlocked = false;
    }

    return prisma.user.findMany({
      where,
      include: ADMIN_USER_INCLUDE,
      orderBy: [{ lastSeenAt: 'desc' }, { createdAt: 'desc' }],
      take: limit,
    });
  }

  function getAvailableVisitDates(days = 14) {
    return getNextAvailableBookingDates(days);
  }

  async function listBoutiquesWithSlots() {
    return getBoutiques();
  }

  async function isSlotAvailable({ boutiqueId, slotId, visitDate, prismaClient = prisma }) {
    const normalizedDate = startOfDate(ensureFutureOrToday(visitDate, 'Дата визита'));

    const [existingBooking, closedSlot] = await Promise.all([
      prismaClient.booking.findFirst({
        where: {
          visitMode: VisitMode.BOUTIQUE,
          boutiqueId,
          timeSlotId: slotId,
          visitDate: normalizedDate,
          status: {
            in: ACTIVE_BOOKING_STATUSES,
          },
        },
      }),
      prismaClient.slotClosure.findFirst({
        where: {
          boutiqueId,
          timeSlotId: slotId,
          date: normalizedDate,
          isActive: true,
        },
      }),
    ]);

    return !existingBooking && !closedSlot;
  }

  async function createBooking(data) {
    const user = await ensureCanCreateBooking(data.userId);
    const requestType = normalizeRequestType(data.requestType);
    const visitMode = normalizeVisitMode(data.visitMode);
    const wishText = normalizeOptionalText(data.wishText);
    const deliveryAddress = normalizeOptionalText(data.deliveryAddress);

    if (visitMode === VisitMode.DELIVERY && !deliveryAddress) {
      throw new ValidationError('Напиши адрес доставки.');
    }

    try {
      const booking = await prisma.$transaction(async (tx) => {
        if (visitMode === VisitMode.BOUTIQUE) {
          if (!data.boutiqueId || !data.slotId || !data.visitDate) {
            throw new ValidationError('Выбери бутик, день и время.');
          }

          const normalizedVisitDate = startOfDate(ensureFutureOrToday(data.visitDate, 'Дата визита'));
          const boutique = await tx.boutique.findFirst({
            where: {
              id: data.boutiqueId,
              isActive: true,
            },
          });

          if (!boutique) {
            throw new NotFoundError('Этот бутик сейчас недоступен.');
          }

          const slot = await tx.timeSlot.findFirst({
            where: {
              id: data.slotId,
              boutiqueId: data.boutiqueId,
              isActive: true,
            },
          });

          if (!slot) {
            throw new NotFoundError('Это время сейчас недоступно.');
          }

          const available = await isSlotAvailable({
            boutiqueId: boutique.id,
            slotId: slot.id,
            visitDate: normalizedVisitDate,
            prismaClient: tx,
          });

          if (!available) {
            throw new ForbiddenError('Это время уже занято. Выбери другое.');
          }

          const activeSlotKey = buildActiveSlotKey({
            boutiqueId: boutique.id,
            slotId: slot.id,
            visitDate: normalizedVisitDate,
          });

          return tx.booking.create({
            data: {
              publicId: uuidv4(),
              userId: user.id,
              registrationId: user.registration?.id ?? null,
              requestType,
              visitMode,
              status: BookingStatus.SUBMITTED,
              boutiqueId: boutique.id,
              timeSlotId: slot.id,
              activeSlotKey,
              boutiqueAddress: formatBoutiqueAddress(boutique),
              visitDate: normalizedVisitDate,
              slotLabel: slot.label,
              contactPhone: user.registration?.phone ?? user.phone ?? null,
              wishText,
              submittedAt: new Date(),
            },
            include: {
              boutique: true,
              timeSlot: true,
              user: {
                include: {
                  registration: true,
                },
              },
            },
          });
        }

        return tx.booking.create({
          data: {
            publicId: uuidv4(),
            userId: user.id,
            registrationId: user.registration?.id ?? null,
            requestType,
            visitMode,
            status: BookingStatus.SUBMITTED,
            deliveryAddress,
            contactPhone: user.registration?.phone ?? user.phone ?? null,
            wishText,
            submittedAt: new Date(),
          },
          include: {
            boutique: true,
            timeSlot: true,
            user: {
              include: {
                registration: true,
              },
            },
          },
        });
      });

      const sheetsResult = await googleSheets.logBooking({ booking });

      if (!sheetsResult?.ok) {
        serviceLogger.warn(
          {
            bookingId: booking.id,
            userId: booking.userId,
          },
          'Booking was saved locally, but Google Sheets logging failed',
        );
      }

      serviceLogger.info(
        {
          bookingId: booking.id,
          requestType: booking.requestType,
          visitMode: booking.visitMode,
        },
        'Booking created',
      );

      await notifyBoutiqueByEmail(booking);

      return booking;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      if (isUniqueConstraintError(error, 'activeSlotKey')) {
        throw new ForbiddenError('Это время уже заняли. Выбери другое.');
      }

      throw error;
    }
  }

  async function cancelUserBoutiqueBooking(userId, bookingId) {
    const cancelledAt = new Date();

    const booking = await prisma.$transaction(async (tx) => {
      const activeBooking = await requireUserActiveBoutiqueBooking(userId, bookingId, {
        includeUser: true,
        prismaClient: tx,
      });

      const cancelledBooking = await tx.booking.update({
        where: {
          id: activeBooking.id,
        },
        data: {
          status: BookingStatus.CANCELLED,
          cancelledAt,
          activeSlotKey: null,
        },
        include: USER_BOOKING_WITH_USER_INCLUDE,
      });

      await tx.auditLog.create({
        data: {
          action: 'user_booking_cancelled',
          actorType: 'USER',
          entityType: 'Booking',
          entityId: activeBooking.id,
          userId,
          message: `Пользователь отменил запись ${activeBooking.publicId}`,
        },
      });

      return cancelledBooking;
    });

    const sheetsResult = await googleSheets.logBooking({
      booking,
      comment: buildBookingChangeComment(booking, 'user_cancelled'),
    });

    if (!sheetsResult?.ok) {
      serviceLogger.warn(
        {
          bookingId: booking.id,
          userId,
        },
        'Booking was cancelled locally, but Google Sheets logging failed',
      );
    }

    return booking;
  }

  async function rescheduleBoutiqueBooking({ userId, bookingId, slotId, visitDate }) {
    if (!slotId || !visitDate) {
      throw new ValidationError('Выбери новый день и время.');
    }

    const normalizedVisitDate = startOfDate(ensureFutureOrToday(visitDate, 'Дата визита'));

    try {
      const result = await prisma.$transaction(async (tx) => {
        const activeBooking = await requireUserActiveBoutiqueBooking(userId, bookingId, {
          includeUser: true,
          prismaClient: tx,
        });

        if (!activeBooking.boutiqueId) {
          throw new ValidationError('Эту запись пока нельзя перенести.');
        }

        const boutique = await tx.boutique.findFirst({
          where: {
            id: activeBooking.boutiqueId,
            isActive: true,
          },
        });

        if (!boutique) {
          throw new NotFoundError('Этот бутик сейчас недоступен.');
        }

        const slot = await tx.timeSlot.findFirst({
          where: {
            id: slotId,
            boutiqueId: boutique.id,
            isActive: true,
          },
        });

        if (!slot) {
          throw new NotFoundError('Это время сейчас недоступно.');
        }

        const isSameSlot =
          activeBooking.timeSlotId === slot.id &&
          activeBooking.visitDate &&
          dayjs(activeBooking.visitDate).isSame(normalizedVisitDate, 'day');

        if (isSameSlot) {
          throw new ValidationError('Это уже ваша текущая запись. Выбери другое время.');
        }

        const available = await isSlotAvailable({
          boutiqueId: boutique.id,
          slotId: slot.id,
          visitDate: normalizedVisitDate,
          prismaClient: tx,
        });

        if (!available) {
          throw new ForbiddenError('Это время уже занято. Выбери другое.');
        }

        const submittedAt = new Date();
        const newBooking = await tx.booking.create({
          data: {
            publicId: uuidv4(),
            userId: activeBooking.userId,
            registrationId: activeBooking.registrationId ?? activeBooking.user?.registration?.id ?? null,
            requestType: activeBooking.requestType,
            visitMode: VisitMode.BOUTIQUE,
            status: BookingStatus.SUBMITTED,
            boutiqueId: boutique.id,
            timeSlotId: slot.id,
            activeSlotKey: buildActiveSlotKey({
              boutiqueId: boutique.id,
              slotId: slot.id,
              visitDate: normalizedVisitDate,
            }),
            boutiqueAddress: formatBoutiqueAddress(boutique),
            visitDate: normalizedVisitDate,
            slotLabel: slot.label,
            contactPhone: activeBooking.contactPhone ?? activeBooking.user?.registration?.phone ?? activeBooking.user?.phone ?? null,
            wishText: activeBooking.wishText,
            submittedAt,
          },
          include: USER_BOOKING_WITH_USER_INCLUDE,
        });

        const previousBooking = await tx.booking.update({
          where: {
            id: activeBooking.id,
          },
          data: {
            status: BookingStatus.CANCELLED,
            cancelledAt: submittedAt,
            activeSlotKey: null,
          },
          include: USER_BOOKING_WITH_USER_INCLUDE,
        });

        await tx.auditLog.create({
          data: {
            action: 'user_booking_rescheduled',
            actorType: 'USER',
            entityType: 'Booking',
            entityId: activeBooking.id,
            userId,
            message: `Запись ${activeBooking.publicId} заменена новой записью ${newBooking.publicId}`,
          },
        });

        return {
          newBooking,
          previousBooking,
        };
      });

      const [previousSheetsResult, newSheetsResult] = await Promise.all([
        googleSheets.logBooking({
          booking: result.previousBooking,
          comment: buildBookingChangeComment(
            result.previousBooking,
            'user_rescheduled_previous',
            result.newBooking.publicId ? `replaced_by: ${result.newBooking.publicId}` : '',
          ),
        }),
        googleSheets.logBooking({
          booking: result.newBooking,
          comment: buildBookingChangeComment(
            result.newBooking,
            'user_rescheduled_new',
            result.previousBooking.publicId ? `replaced_from: ${result.previousBooking.publicId}` : '',
          ),
        }),
      ]);

      if (!previousSheetsResult?.ok || !newSheetsResult?.ok) {
        serviceLogger.warn(
          {
            newBookingId: result.newBooking.id,
            previousBookingId: result.previousBooking.id,
            userId,
          },
          'Booking was rescheduled locally, but Google Sheets logging failed',
        );
      }

      await notifyBoutiqueByEmail(result.newBooking);

      return result;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      if (isUniqueConstraintError(error, 'activeSlotKey')) {
        throw new ForbiddenError('Это время уже заняли. Выбери другое.');
      }

      throw error;
    }
  }

  function normalizeRequestType(requestType) {
    if (!Object.values(BookingRequestType).includes(requestType)) {
      throw new ValidationError('Выбери тип заявки.');
    }

    return requestType;
  }

  function normalizeVisitMode(visitMode) {
    if (!Object.values(VisitMode).includes(visitMode)) {
      throw new ValidationError('Выбери формат.');
    }

    return visitMode;
  }

  async function requireBoutique(boutiqueId, { includeInactive = false } = {}) {
    const boutique = await prisma.boutique.findFirst({
      where: {
        id: boutiqueId,
        ...(includeInactive ? {} : { isActive: true }),
      },
    });

    if (!boutique) {
      throw new NotFoundError('Бутик не найден');
    }

    return boutique;
  }

  async function requireTimeSlot(slotId, { includeInactive = false } = {}) {
    const slot = await prisma.timeSlot.findFirst({
      where: {
        id: slotId,
        ...(includeInactive ? {} : { isActive: true }),
      },
      include: {
        boutique: true,
      },
    });

    if (!slot) {
      throw new NotFoundError('Слот не найден');
    }

    return slot;
  }

  async function requireUser(userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundError('Пользователь не найден');
    }

    return user;
  }

  return {
    blockUser,
    cancelUserBoutiqueBooking,
    closeSlot,
    createBooking,
    createBoutique,
    createTimeSlot,
    ensureCanCreateBooking,
    findUserByTelegramId,
    findUserByUsername,
    formatAvailableSlotsList,
    formatBoutiquesList,
    formatTimeSlotsList,
    getAvailableSlotsByDate,
    getAvailableVisitDates,
    getBoutiques,
    getTimeSlots,
    getUserActiveBoutiqueBooking,
    getUserBookingById,
    isSlotAvailable,
    isUserBlocked,
    listBookingsCreatedOnDate,
    listBoutiquesWithSlots,
    listRecentBookings,
    listTodayBookings,
    listUserBookings,
    listUsersForAdmin,
    openSlot,
    removeBoutique,
    removeTimeSlot,
    rescheduleBoutiqueBooking,
    unblockUser,
  };
}

```

## src/bot/scenes/adminBoutiqueScene.js
```js
import { Scenes } from 'telegraf';

import { ADMIN_PERMISSIONS } from '../../utils/constants.js';
import { ValidationError } from '../../utils/errors.js';
import { formatBoutiqueAddress } from '../../utils/formatters.js';
import { formatEmailList, normalizeEmailList, normalizeOptionalEmail } from '../../utils/mail.js';
import {
  ADMIN_CALLBACKS,
  getAdminCancelKeyboard,
  getAdminConfirmKeyboard,
  getAdminOptionKeyboard,
} from '../keyboards/admin.js';
import {
  answerAdminCallback,
  ensureAdminSceneAccess,
  extractCallbackValue,
  getAdminText,
  leaveAdminScene,
  maybeLeaveAdminScene,
  renderAdminPanel,
} from './adminShared.js';

export const ADMIN_BOUTIQUE_SCENE_ID = 'admin-boutique-scene';

const BOUTIQUE_SELECT_PREFIX = 'admin-boutique:select:';

function getSceneState(ctx) {
  ctx.wizard.state.adminBoutique ??= {};
  return ctx.wizard.state.adminBoutique;
}

function buildBoutiquesKeyboard(boutiques) {
  return getAdminOptionKeyboard(
    boutiques.map((boutique) => ({
      text: boutique.name,
      callbackData: `${BOUTIQUE_SELECT_PREFIX}${boutique.id}`,
    })),
  );
}

function buildBoutiqueSummary(boutique) {
  const lines = [
    boutique.name,
    formatBoutiqueAddress(boutique) || 'Адрес не указан',
  ];

  if (boutique.email) {
    lines.push(`Email: ${boutique.email}`);
  }

  if (boutique.ccEmails) {
    lines.push(`Копия: ${formatEmailList(boutique.ccEmails)}`);
  }

  return lines.join('\n');
}

export function createAdminBoutiqueScene() {
  return new Scenes.WizardScene(
    ADMIN_BOUTIQUE_SCENE_ID,
    async (ctx) => {
      const state = getSceneState(ctx);
      const admin = await ensureAdminSceneAccess(ctx, ADMIN_PERMISSIONS.MANAGE_BOUTIQUES);
      const mode = ctx.scene.state?.mode === 'remove' ? 'remove' : 'add';

      state.admin = admin;
      state.mode = mode;

      if (mode === 'remove') {
        const boutiques = await ctx.state.services.bookingService.getBoutiques();

        if (boutiques.length === 0) {
          await leaveAdminScene(ctx, admin, 'Сейчас нет активных бутиков для удаления.');
          return undefined;
        }

        state.boutiques = boutiques;

        await renderAdminPanel(ctx, 'Выберите бутик, который нужно удалить.', buildBoutiquesKeyboard(boutiques));
        return ctx.wizard.next();
      }

      await renderAdminPanel(ctx, 'Укажите город бутика одним сообщением.', getAdminCancelKeyboard());
      return ctx.wizard.next();
    },
    async (ctx) => {
      const state = getSceneState(ctx);

      if (await maybeLeaveAdminScene(ctx, state.admin)) {
        return undefined;
      }

      if (state.mode === 'remove') {
        const boutiqueId = extractCallbackValue(ctx, BOUTIQUE_SELECT_PREFIX);

        if (!boutiqueId) {
          await answerAdminCallback(ctx, 'Выберите бутик кнопкой ниже.', true);
          return undefined;
        }

        const boutique = state.boutiques.find((item) => item.id === boutiqueId);

        if (!boutique) {
          await answerAdminCallback(ctx, 'Бутик не найден. Попробуйте снова.', true);
          return undefined;
        }

        state.boutique = boutique;

        await answerAdminCallback(ctx);
        await renderAdminPanel(
          ctx,
          `Подтвердите удаление бутика.\n\n${buildBoutiqueSummary(boutique)}`,
          getAdminConfirmKeyboard('Удалить бутик'),
        );
        ctx.wizard.selectStep(6);
        return undefined;
      }

      state.city = getAdminText(ctx);

      if (!state.city) {
        await renderAdminPanel(ctx, 'Город не должен быть пустым. Попробуйте еще раз.', getAdminCancelKeyboard());
        return undefined;
      }

      await renderAdminPanel(ctx, 'Теперь укажите название бутика.', getAdminCancelKeyboard());
      return ctx.wizard.next();
    },
    async (ctx) => {
      const state = getSceneState(ctx);

      if (await maybeLeaveAdminScene(ctx, state.admin)) {
        return undefined;
      }

      state.name = getAdminText(ctx);

      if (!state.name) {
        await renderAdminPanel(ctx, 'Название не должно быть пустым. Попробуйте еще раз.', getAdminCancelKeyboard());
        return undefined;
      }

      await renderAdminPanel(ctx, 'Укажите адрес бутика одной строкой.', getAdminCancelKeyboard());
      return ctx.wizard.next();
    },
    async (ctx) => {
      const state = getSceneState(ctx);

      if (await maybeLeaveAdminScene(ctx, state.admin)) {
        return undefined;
      }

      state.addressLine1 = getAdminText(ctx);

      if (!state.addressLine1) {
        await renderAdminPanel(ctx, 'Адрес не должен быть пустым. Попробуйте еще раз.', getAdminCancelKeyboard());
        return undefined;
      }

      await renderAdminPanel(
        ctx,
        'Укажите email бутика или отправьте "-" если уведомления пока не нужны.',
        getAdminCancelKeyboard(),
      );
      return ctx.wizard.next();
    },
    async (ctx) => {
      const state = getSceneState(ctx);

      if (await maybeLeaveAdminScene(ctx, state.admin)) {
        return undefined;
      }

      try {
        state.email = normalizeOptionalEmail(getAdminText(ctx), 'Email бутика');
      } catch (error) {
        if (error instanceof ValidationError) {
          await renderAdminPanel(ctx, `${error.message}\nПопробуйте еще раз.`, getAdminCancelKeyboard());
          return undefined;
        }

        throw error;
      }

      await renderAdminPanel(
        ctx,
        'Укажите дополнительные email через запятую или отправьте "-" если не нужно.',
        getAdminCancelKeyboard(),
      );
      return ctx.wizard.next();
    },
    async (ctx) => {
      const state = getSceneState(ctx);

      if (await maybeLeaveAdminScene(ctx, state.admin)) {
        return undefined;
      }

      try {
        state.ccEmails = normalizeEmailList(getAdminText(ctx), {
          allowEmpty: true,
          fieldName: 'Дополнительные email',
        });
      } catch (error) {
        if (error instanceof ValidationError) {
          await renderAdminPanel(ctx, `${error.message}\nПопробуйте еще раз.`, getAdminCancelKeyboard());
          return undefined;
        }

        throw error;
      }

      const boutique = await ctx.state.services.bookingService.createBoutique(
        {
          city: state.city,
          name: state.name,
          addressLine1: state.addressLine1,
          ccEmails: state.ccEmails,
          email: state.email,
        },
        ctx.from.id,
      );

      await leaveAdminScene(
        ctx,
        state.admin,
        `Бутик успешно добавлен.\n\n${buildBoutiqueSummary(boutique)}`,
      );

      return undefined;
    },
    async (ctx) => {
      const state = getSceneState(ctx);

      if (await maybeLeaveAdminScene(ctx, state.admin)) {
        return undefined;
      }

      if (ctx.callbackQuery?.data !== ADMIN_CALLBACKS.SCENE_CONFIRM) {
        await answerAdminCallback(ctx, 'Подтвердите удаление кнопкой ниже.', true);
        return undefined;
      }

      await answerAdminCallback(ctx);
      await ctx.state.services.bookingService.removeBoutique(state.boutique.id, ctx.from.id);

      await leaveAdminScene(
        ctx,
        state.admin,
        `Бутик "${state.boutique.name}" деактивирован.`,
      );

      return undefined;
    },
  );
}

```

## src/bot/scenes/registrationScene.js
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

export const REGISTRATION_SCENE_ID = 'registration-scene';

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
        await leaveWithMainMenu(
          ctx,
          'Твои данные уже сохранены 💫\nЕсли что-то нужно изменить, напиши администратору.',
        );
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
            await leaveWithMainMenu(
              ctx,
              'Твои данные уже сохранены 💫\nЕсли что-то нужно изменить, напиши администратору.',
            );
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

## src/services/registrationService.js
```js
import { DocumentKind, Prisma, RegistrationStatus } from '@prisma/client';

import { BOT_TEXTS } from '../utils/constants.js';
import { ValidationError } from '../utils/errors.js';
import { formatRegistrationDetails } from '../utils/formatters.js';
import {
  getRegistrationCdekAddress,
  getRegistrationHomeAddress,
  normalizeRegistrationSizes,
} from '../utils/registration.js';
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
  };
}

```

## src/bot/handlers/menuHandlers.js
```js
import { BookingStatus, VisitMode } from '@prisma/client';

import { BOT_TEXTS, MENU_BUTTONS } from '../../utils/constants.js';
import { AppError } from '../../utils/errors.js';
import {
  formatUserBookingArchive,
  formatUserBookingCard,
} from '../../utils/formatters.js';
import { formatRegistrationSizes, getRegistrationCdekAddress, getRegistrationHomeAddress } from '../../utils/registration.js';
import {
  BOOKING_CALLBACKS,
  getUserBookingCancelConfirmKeyboard,
  getUserBookingReschedulePromptKeyboard,
  getUserBoutiqueBookingActionsKeyboard,
} from '../keyboards/booking.js';
import { getMainMenuKeyboard } from '../keyboards/mainMenu.js';
import { BOOKING_RESCHEDULE_SCENE_ID } from '../scenes/bookingRescheduleScene.js';
import { BOOKING_SCENE_ID } from '../scenes/bookingScene.js';
import { REGISTRATION_SCENE_ID } from '../scenes/registrationScene.js';

const ACTIVE_BOOKING_STATUSES = [BookingStatus.CREATED, BookingStatus.SUBMITTED];

function buildBlockedMessage(user, supportContact) {
  const lines = [BOT_TEXTS.BLOCKED];

  if (user.blockedReason) {
    lines.push(`Причина: ${user.blockedReason}`);
  }

  lines.push(`Если нужна помощь: ${supportContact}`);

  return lines.join('\n');
}

function buildRegistrationInfoMessage(registration) {
  const homeAddress = getRegistrationHomeAddress(registration);
  const cdekAddress = getRegistrationCdekAddress(registration);
  const lines = [
    'Твои данные уже сохранены 💫',
    'Если что-то нужно изменить, напиши администратору.',
    '',
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

function isMessageNotModifiedError(error) {
  return error?.description === 'Bad Request: message is not modified' || error?.response?.description === 'Bad Request: message is not modified';
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
  const extra = markup ?? {};

  try {
    await ctx.editMessageText(text, extra);
  } catch (error) {
    if (!isMessageNotModifiedError(error)) {
      throw error;
    }

    if (extra.reply_markup) {
      await ctx.editMessageReplyMarkup(extra.reply_markup).catch(() => undefined);
    }
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

function buildCancelledText(booking) {
  return [
    'Запись отменена.',
    '',
    formatUserBookingCard(booking, {
      includeStatus: false,
    }),
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

    await ctx.reply(buildRegistrationInfoMessage(registration), getMainMenuKeyboard());
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
