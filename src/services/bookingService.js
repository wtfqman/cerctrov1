import { BookingRequestType, BookingStatus, Prisma, TimerStatus, VisitMode } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

import { ADMIN_PERMISSIONS, AUDIT_ACTIONS, BOT_TEXTS } from '../utils/constants.js';
import {
  dayjs,
  DEFAULT_BOOKING_WORKING_DAYS_WINDOW,
  formatDate,
  getCurrentWeekBookingDates,
  getNextAvailableBookingDates,
  isCurrentWeekBookingDate,
  now,
  startOfDate,
} from '../utils/date.js';
import { AppError, ForbiddenError, NotFoundError, ValidationError } from '../utils/errors.js';
import { filterVisibleBoutiques, isVisibleBoutique } from '../utils/boutiques.js';
import { normalizeEmail, normalizeEmailList, normalizeOptionalEmail } from '../utils/mail.js';
import { isTestBookingUser } from '../utils/testData.js';
import {
  formatAvailableSlotsList,
  formatBoutiqueAddress,
  formatBoutiquesList,
  formatTimeSlotsList,
} from '../utils/formatters.js';
import { ensureFutureOrToday, ensureNonEmptyString, normalizeTelegramId } from '../utils/validators.js';

const ACTIVE_BOOKING_STATUSES = [BookingStatus.CREATED, BookingStatus.SUBMITTED];
const ADMIN_VISIBLE_BOOKING_STATUSES = [BookingStatus.CREATED, BookingStatus.SUBMITTED, BookingStatus.COMPLETED];
const USER_VISIBLE_BOOKING_STATUSES = [BookingStatus.CREATED, BookingStatus.SUBMITTED, BookingStatus.COMPLETED];
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
      personalPdf: {
        select: {
          id: true,
          telegramFileId: true,
        },
      },
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

function isUserVisibleBooking(booking) {
  if (!booking || !USER_VISIBLE_BOOKING_STATUSES.includes(booking.status)) {
    return false;
  }

  if (isTestBookingUser(booking)) {
    return false;
  }

  if (booking.visitMode === VisitMode.BOUTIQUE && booking.boutique) {
    return isVisibleBoutique(booking.boutique);
  }

  return true;
}

function isVisibleAdminBooking(booking) {
  return Boolean(booking) && ADMIN_VISIBLE_BOOKING_STATUSES.includes(booking.status);
}

function normalizeUserCurrentWeekVisitDate(visitDate) {
  const normalizedVisitDate = startOfDate(ensureFutureOrToday(visitDate, 'Дата визита'));

  if (!isCurrentWeekBookingDate(normalizedVisitDate)) {
    throw new ValidationError(BOT_TEXTS.BOOKING_CURRENT_WEEK_ONLY);
  }

  return normalizedVisitDate;
}

function filterVisibleAdminBookings(bookings) {
  return Array.isArray(bookings) ? bookings.filter(isVisibleAdminBooking) : [];
}

function getAdminVisibilityStats(bookings) {
  const normalizedBookings = Array.isArray(bookings) ? bookings : [];
  let hiddenByStatusCount = 0;
  let visibleCount = 0;

  for (const booking of normalizedBookings) {
    if (!booking || !ADMIN_VISIBLE_BOOKING_STATUSES.includes(booking.status)) {
      hiddenByStatusCount += 1;
      continue;
    }

    visibleCount += 1;
  }

  return {
    hiddenByStatusCount,
    rawCount: normalizedBookings.length,
    visibleCount,
  };
}

function buildAdminVisibleBookingsWhere(where = {}) {
  return {
    ...where,
    status: {
      in: ADMIN_VISIBLE_BOOKING_STATUSES,
    },
  };
}

async function findVisibleAdminBookings(prismaClient, {
  limit = 50,
  orderBy = { createdAt: 'desc' },
  where = {},
} = {}) {
  const rawBookings = await prismaClient.booking.findMany({
    where: buildAdminVisibleBookingsWhere(where),
    include: ADMIN_BOOKING_INCLUDE,
    orderBy,
  });

  const visibleBookings = filterVisibleAdminBookings(rawBookings);

  return {
    bookings: Number.isInteger(limit) && limit >= 0 ? visibleBookings.slice(0, limit) : visibleBookings,
    visibilityStats: getAdminVisibilityStats(rawBookings),
  };
}

export function createBookingService({
  prisma,
  logger,
  googleSheets,
  adminService,
  adminNotificationService = null,
  emailService,
}) {
  const serviceLogger = logger.child({ service: 'booking' });

  function logBookingLifecycleEvent(event, extra = {}, level = 'info') {
    serviceLogger[level](
      {
        event,
        ...extra,
      },
      `Booking lifecycle event: ${event}`,
    );
  }

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

  async function getUserVisibleBoutiques({ includeTimeSlots = true } = {}) {
    return getVisibleBoutiques({ includeTimeSlots });
  }

  async function getVisibleBoutiques({ includeTimeSlots = true } = {}) {
    const boutiques = await getBoutiques({
      includeInactive: false,
      includeTimeSlots,
    });

    return filterVisibleBoutiques(boutiques);
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

  async function listUserVisibleBookings(userId, limit = 5) {
    const bookings = await prisma.booking.findMany({
      where: {
        userId,
        status: {
          in: USER_VISIBLE_BOOKING_STATUSES,
        },
      },
      include: USER_BOOKING_INCLUDE,
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
    });

    return bookings.filter(isUserVisibleBooking);
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

  async function getUserVisibleBookingById(userId, bookingId, { includeUser = false, prismaClient = prisma } = {}) {
    const booking = await getUserBookingById(userId, bookingId, {
      includeUser,
      prismaClient,
    });

    return isUserVisibleBooking(booking) ? booking : null;
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

  async function getVisibleAdminBookings(limit = 10) {
    const result = await findVisibleAdminBookings(prisma, {
      limit,
      orderBy: {
        createdAt: 'desc',
      },
    });

    logBookingLifecycleEvent('admin_recent_bookings_count', {
      limit,
      listType: 'recent',
      ...result.visibilityStats,
    });

    return result.bookings;
  }

  async function getVisibleAdminBookingsCreatedOnDate(date, limit = 50) {
    const start = dayjs(startOfDate(date));
    const end = start.add(1, 'day').toDate();

    const result = await findVisibleAdminBookings(prisma, {
      limit,
      orderBy: {
        createdAt: 'desc',
      },
      where: {
        createdAt: {
          gte: start.toDate(),
          lt: end,
        },
      },
    });

    logBookingLifecycleEvent('admin_recent_bookings_count', {
      date: start.toDate().toISOString(),
      limit,
      listType: 'today',
      ...result.visibilityStats,
    });

    return result.bookings;
  }

  async function getVisibleAdminBookingsCreatedBetween(startDate, endDate, limit = null) {
    const start = dayjs(startDate).toDate();
    const end = dayjs(endDate).toDate();

    const result = await findVisibleAdminBookings(prisma, {
      limit,
      orderBy: {
        createdAt: 'asc',
      },
      where: {
        createdAt: {
          gte: start,
          lt: end,
        },
      },
    });

    logBookingLifecycleEvent('admin_range_bookings_count', {
      from: start.toISOString(),
      limit,
      listType: 'range',
      to: end.toISOString(),
      ...result.visibilityStats,
    });

    return result.bookings;
  }

  async function getAdminBookingsForToday(limit = 50) {
    return getVisibleAdminBookingsCreatedOnDate(now().toDate(), limit);
  }

  async function getVisibleAdminBookingById(bookingId) {
    const booking = await prisma.booking.findFirst({
      where: {
        id: bookingId,
        status: {
          in: ADMIN_VISIBLE_BOOKING_STATUSES,
        },
      },
      include: ADMIN_BOOKING_INCLUDE,
    });

    return isVisibleAdminBooking(booking) ? booking : null;
  }

  async function listVisibleAdminRecentBookings(limit = 10) {
    return getVisibleAdminBookings(limit);
  }

  async function listVisibleAdminBookingsCreatedOnDate(date, limit = 50) {
    return getVisibleAdminBookingsCreatedOnDate(date, limit);
  }

  async function listVisibleAdminTodayBookings(limit = 50) {
    return getAdminBookingsForToday(limit);
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

  function getAvailableVisitDates(days = DEFAULT_BOOKING_WORKING_DAYS_WINDOW) {
    return getNextAvailableBookingDates(days);
  }

  function getCurrentWeekVisitDates() {
    return getCurrentWeekBookingDates();
  }

  async function listBoutiquesWithSlots() {
    return getVisibleBoutiques();
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

    logBookingLifecycleEvent('booking_create_started', {
      requestType,
      userId: user.id,
      visitMode,
    });

    if (visitMode === VisitMode.DELIVERY && !deliveryAddress) {
      throw new ValidationError('Напиши адрес доставки.');
    }

    try {
      const booking = await prisma.$transaction(async (tx) => {
        let createdBooking;
        if (visitMode === VisitMode.BOUTIQUE) {
          if (!data.boutiqueId || !data.slotId || !data.visitDate) {
            throw new ValidationError('Выбери бутик, день и время.');
          }

          const normalizedVisitDate = normalizeUserCurrentWeekVisitDate(data.visitDate);
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

          createdBooking = await tx.booking.create({
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
        } else {
          createdBooking = await tx.booking.create({
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
        }

        await tx.auditLog.create({
          data: {
            action: 'user_booking_created',
            actorType: 'USER',
            entityType: 'Booking',
            entityId: createdBooking.id,
            message: buildBookingChangeComment(
              createdBooking,
              'created',
              createdBooking.visitMode === VisitMode.BOUTIQUE
                ? `slot: ${createdBooking.slotLabel ?? 'n/a'}`
                : 'delivery',
            ),
            userId: user.id,
          },
        });

        return createdBooking;
      });

      logBookingLifecycleEvent('booking_saved', {
        bookingId: booking.id,
        publicId: booking.publicId,
        requestType: booking.requestType,
        userId: booking.userId,
        visitMode: booking.visitMode,
      });

      logBookingLifecycleEvent('booking_saved_with_status', {
        bookingId: booking.id,
        publicId: booking.publicId,
        status: booking.status,
        userId: booking.userId,
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
      comment: buildBookingChangeComment(booking, 'user_cancelled_manual'),
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

    serviceLogger.info(
      {
        bookingId: booking.id,
        cancelledAt,
        userId,
      },
      'User booking cancelled',
    );

    return booking;
  }

  async function rescheduleBoutiqueBooking({ userId, bookingId, slotId, visitDate }) {
    if (!slotId || !visitDate) {
      throw new ValidationError('Выбери новый день и время.');
    }

    const normalizedVisitDate = normalizeUserCurrentWeekVisitDate(visitDate);

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
    getAdminBookingsForToday,
    getVisibleAdminBookingById,
    getAvailableSlotsByDate,
    getAvailableVisitDates,
    getCurrentWeekVisitDates,
    getBoutiques,
    getVisibleAdminBookings,
    getVisibleAdminBookingsCreatedBetween,
    getVisibleAdminBookingsCreatedOnDate,
    getVisibleBoutiques,
    getUserVisibleBoutiques,
    getTimeSlots,
    getUserActiveBoutiqueBooking,
    getUserBookingById,
    getUserVisibleBookingById,
    isSlotAvailable,
    isUserBlocked,
    listBookingsCreatedOnDate,
    listBoutiquesWithSlots,
    listRecentBookings,
    listTodayBookings,
    listVisibleAdminBookingsCreatedBetween: getVisibleAdminBookingsCreatedBetween,
    listVisibleAdminBookingsCreatedOnDate,
    listVisibleAdminRecentBookings,
    listVisibleAdminTodayBookings,
    listUserBookings,
    listUserVisibleBookings,
    listUsersForAdmin,
    openSlot,
    removeBoutique,
    removeTimeSlot,
    rescheduleBoutiqueBooking,
    unblockUser,
  };
}
