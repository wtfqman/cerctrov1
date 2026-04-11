# User UI Internal Boutique Filter Fix

[src/utils/boutiques.js](C:\Users\PC\OneDrive\Desktop\cerca trova bot\src\utils\boutiques.js)
```js
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
  /^No Mail\b/iu,
  /^SMTP Fail\b/iu,
  /^Reschedule\s+\d+/iu,
  /^Debug\b/iu,
  /^Internal\b/iu,
  /^Test\b/iu,
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

export function isUserVisibleBoutique(boutique) {
  return Boolean(boutique) && !isInternalBoutique(boutique);
}

export function filterUserVisibleBoutiques(boutiques) {
  return Array.isArray(boutiques) ? boutiques.filter(isUserVisibleBoutique) : [];
}

export function isDisallowedUserBoutiqueLabel(label) {
  return isInternalBoutiqueName(label);
}

export function getUserVisibleBoutiqueLabel(source, fallback = 'Р‘СѓС‚РёРє') {
  const boutique = source?.boutique ?? source;

  if (boutique && isUserVisibleBoutique(boutique)) {
    return normalizeText(boutique.name) || fallback;
  }

  if (!boutique || !boutique.id) {
    const boutiqueAddress = normalizeText(source?.boutiqueAddress);
    return boutiqueAddress || fallback;
  }

  return fallback;
}

```

[src/services/bookingService.js](C:\Users\PC\OneDrive\Desktop\cerca trova bot\src\services\bookingService.js)
```js
import { BookingRequestType, BookingStatus, Prisma, TimerStatus, VisitMode } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

import { ADMIN_PERMISSIONS, AUDIT_ACTIONS } from '../utils/constants.js';
import { dayjs, formatDate, getNextAvailableBookingDates, now, startOfDate } from '../utils/date.js';
import { AppError, ForbiddenError, NotFoundError, ValidationError } from '../utils/errors.js';
import { filterUserVisibleBoutiques } from '../utils/boutiques.js';
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
    return ensureNonEmptyString(code, 'РљРѕРґ Р±СѓС‚РёРєР°').toUpperCase();
  }

  const randomCode = uuidv4().split('-')[0].toUpperCase();
  const cityFragment = String(city ?? '').trim().toUpperCase().slice(0, 3);
  const addressFragment = String(addressLine1 ?? '').replace(/\s+/g, '').slice(0, 6).toUpperCase();
  const nameFragment = String(name ?? '').replace(/\s+/g, '').slice(0, 6).toUpperCase();

  return [cityFragment, nameFragment || addressFragment, randomCode].filter(Boolean).join('_');
}

function buildSlotComment({ boutique, date, slot, reason = '' }) {
  return [
    `Р‘СѓС‚РёРє: ${boutique.name}`,
    `Р”Р°С‚Р°: ${formatDate(date, 'DD.MM.YYYY')}`,
    `РЎР»РѕС‚: ${slot.label}`,
    reason ? `РџСЂРёС‡РёРЅР°: ${reason}` : '',
  ]
    .filter(Boolean)
    .join(' | ');
}

function buildUserComment(user, reason = '') {
  const fullName =
    user?.registration?.fullName ||
    [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim() ||
    'Р‘РµР· РёРјРµРЅРё';
  const username = user?.registration?.telegramUsername ?? (user?.username ? `@${user.username}` : 'Р±РµР· username');

  return [
    `РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ: ${fullName}`,
    `Username: ${username}`,
    `Telegram ID: ${user.telegramId}`,
    reason ? `РљРѕРјРјРµРЅС‚Р°СЂРёР№: ${reason}` : '',
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

  async function getUserVisibleBoutiques({ includeTimeSlots = true } = {}) {
    const boutiques = await getBoutiques({
      includeInactive: false,
      includeTimeSlots,
    });

    return filterUserVisibleBoutiques(boutiques);
  }

  async function createBoutique(data, adminActorId) {
    const admin = await adminService.assertPermission(adminActorId, ADMIN_PERMISSIONS.MANAGE_BOUTIQUES);
    const name = ensureNonEmptyString(data.name, 'РќР°Р·РІР°РЅРёРµ Р±СѓС‚РёРєР°');
    const addressLine1 = ensureNonEmptyString(data.addressLine1, 'РђРґСЂРµСЃ Р±СѓС‚РёРєР°');
    const city = ensureNonEmptyString(data.city, 'Р“РѕСЂРѕРґ');
    const email = normalizeOptionalEmail(data.email, 'Email Р±СѓС‚РёРєР°');
    const ccEmails = Array.isArray(data.ccEmails)
      ? [...new Set(data.ccEmails.map((item) => normalizeEmail(item, 'Р”РѕРїРѕР»РЅРёС‚РµР»СЊРЅС‹Рµ email')))]
      : normalizeEmailList(data.ccEmails ?? '', {
          allowEmpty: true,
          fieldName: 'Р”РѕРїРѕР»РЅРёС‚РµР»СЊРЅС‹Рµ email',
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
      throw new ValidationError('Р‘СѓС‚РёРє СЃ С‚Р°РєРёРјРё РґР°РЅРЅС‹РјРё СѓР¶Рµ СЃСѓС‰РµСЃС‚РІСѓРµС‚');
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
        message: `РЎРѕР·РґР°РЅ РёР»Рё Р°РєС‚РёРІРёСЂРѕРІР°РЅ Р±СѓС‚РёРє ${boutique.name}`,
      },
    });

    await googleSheets.logAdminAction({
      action: AUDIT_ACTIONS.BOUTIQUE_CREATED,
      adminId: admin.user.telegramId,
      comment: `РЎРѕР·РґР°РЅ РёР»Рё Р°РєС‚РёРІРёСЂРѕРІР°РЅ Р±СѓС‚РёРє "${boutique.name}" (${formatBoutiqueAddress(boutique)})`,
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
          message: `Р‘СѓС‚РёРє РґРµР°РєС‚РёРІРёСЂРѕРІР°РЅ: ${boutique.name}`,
        },
      }),
    ]);

    await googleSheets.logAdminAction({
      action: AUDIT_ACTIONS.BOUTIQUE_REMOVED,
      adminId: admin.user.telegramId,
      comment: `Р‘СѓС‚РёРє РґРµР°РєС‚РёРІРёСЂРѕРІР°РЅ: "${boutique.name}" (${formatBoutiqueAddress(boutique)})`,
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
    const startTime = ensureNonEmptyString(data.startTime, 'Р’СЂРµРјСЏ РЅР°С‡Р°Р»Р°');
    const endTime = ensureNonEmptyString(data.endTime, 'Р’СЂРµРјСЏ РѕРєРѕРЅС‡Р°РЅРёСЏ');
    const label = data.label ? ensureNonEmptyString(data.label, 'РџРѕРґРїРёСЃСЊ СЃР»РѕС‚Р°') : `${startTime}-${endTime}`;
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
      throw new ValidationError('РўР°РєРѕР№ СЃР»РѕС‚ СѓР¶Рµ СЃСѓС‰РµСЃС‚РІСѓРµС‚ РІ СЌС‚РѕРј Р±СѓС‚РёРєРµ');
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
        message: `РЎРѕР·РґР°РЅ РёР»Рё Р°РєС‚РёРІРёСЂРѕРІР°РЅ СЃР»РѕС‚ ${slot.label} РґР»СЏ Р±СѓС‚РёРєР° ${boutique.name}`,
      },
    });

    await googleSheets.logAdminAction({
      action: AUDIT_ACTIONS.TIME_SLOT_CREATED,
      adminId: admin.user.telegramId,
      comment: `РЎРѕР·РґР°РЅ РёР»Рё Р°РєС‚РёРІРёСЂРѕРІР°РЅ СЃР»РѕС‚ "${slot.label}" РґР»СЏ Р±СѓС‚РёРєР° "${boutique.name}"`,
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
          message: `РЎР»РѕС‚ РґРµР°РєС‚РёРІРёСЂРѕРІР°РЅ: ${slot.label}`,
        },
      }),
    ]);

    await googleSheets.logAdminAction({
      action: AUDIT_ACTIONS.TIME_SLOT_REMOVED,
      adminId: admin.user.telegramId,
      comment: `РЎР»РѕС‚ РґРµР°РєС‚РёРІРёСЂРѕРІР°РЅ: "${slot.label}"`,
      status: 'inactive',
    });

    return {
      ...slot,
      isActive: false,
    };
  }

  async function getAvailableSlotsByDate(boutiqueId, date) {
    const boutique = await requireBoutique(boutiqueId);
    const normalizedDate = ensureFutureOrToday(date, 'Р”Р°С‚Р° РІРёР·РёС‚Р°');

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
          ? 'РЎРІРѕР±РѕРґРµРЅ'
          : closure
            ? `Р—Р°РєСЂС‹С‚ Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂРѕРј${closure.reason ? `: ${closure.reason}` : ''}`
            : 'РЈР¶Рµ Р·Р°РЅСЏС‚',
      };
    });
  }

  async function closeSlot(boutiqueId, date, slotId, adminActorId, reason = null) {
    const admin = await adminService.assertPermission(adminActorId, ADMIN_PERMISSIONS.MANAGE_SLOTS);
    const boutique = await requireBoutique(boutiqueId);
    const slot = await requireTimeSlot(slotId);
    const normalizedDate = startOfDate(ensureFutureOrToday(date, 'Р”Р°С‚Р° РІРёР·РёС‚Р°'));

    if (slot.boutiqueId !== boutique.id) {
      throw new ValidationError('РЎР»РѕС‚ РЅРµ РїСЂРёРЅР°РґР»РµР¶РёС‚ РІС‹Р±СЂР°РЅРЅРѕРјСѓ Р±СѓС‚РёРєСѓ');
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
    const normalizedDate = startOfDate(ensureFutureOrToday(date, 'Р”Р°С‚Р° РІРёР·РёС‚Р°'));

    if (slot.boutiqueId !== boutique.id) {
      throw new ValidationError('РЎР»РѕС‚ РЅРµ РїСЂРёРЅР°РґР»РµР¶РёС‚ РІС‹Р±СЂР°РЅРЅРѕРјСѓ Р±СѓС‚РёРєСѓ');
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
    const normalizedReason = normalizeOptionalText(reason) ?? 'РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ Р·Р°Р±Р»РѕРєРёСЂРѕРІР°РЅ Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂРѕРј';

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
        message: 'РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ СЂР°Р·Р±Р»РѕРєРёСЂРѕРІР°РЅ',
      },
    });

    await googleSheets.logAdminAction({
      action: AUDIT_ACTIONS.USER_UNBLOCKED,
      adminId: admin.user.telegramId,
      targetUser: unblockedUser,
      comment: buildUserComment(unblockedUser, 'РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ СЂР°Р·Р±Р»РѕРєРёСЂРѕРІР°РЅ'),
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
      throw new AppError('РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ РЅРµ РЅР°Р№РґРµРЅ', 404);
    }

    if (await isUserBlocked(user.id)) {
      throw new ForbiddenError('РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ Р·Р°Р±Р»РѕРєРёСЂРѕРІР°РЅ Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂРѕРј');
    }

    if (!user.registration) {
      throw new ForbiddenError('РЎРЅР°С‡Р°Р»Р° РїСЂРѕР№РґРё СЂРµРіРёСЃС‚СЂР°С†РёСЋ.');
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
      throw new ForbiddenError('Р­С‚Сѓ Р·Р°РїРёСЃСЊ СѓР¶Рµ РЅРµР»СЊР·СЏ РёР·РјРµРЅРёС‚СЊ. РќР°РїРёС€Рё Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂСѓ.');
    }
  }

  async function requireUserActiveBoutiqueBooking(userId, bookingId, { includeUser = false, prismaClient = prisma } = {}) {
    const booking = await getUserBookingById(userId, bookingId, {
      includeUser,
      prismaClient,
    });

    if (!booking) {
      throw new NotFoundError('Р—Р°РїРёСЃСЊ РЅРµ РЅР°Р№РґРµРЅР°.');
    }

    if (booking.visitMode !== VisitMode.BOUTIQUE) {
      throw new ForbiddenError('Р­С‚Сѓ Р·Р°СЏРІРєСѓ РїРѕРєР° РЅРµР»СЊР·СЏ РёР·РјРµРЅРёС‚СЊ.');
    }

    if (!ACTIVE_BOOKING_STATUSES.includes(booking.status)) {
      throw new ForbiddenError('Р­С‚Р° Р·Р°РїРёСЃСЊ СѓР¶Рµ РЅРµ Р°РєС‚РёРІРЅР°.');
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
    return getUserVisibleBoutiques();
  }

  async function isSlotAvailable({ boutiqueId, slotId, visitDate, prismaClient = prisma }) {
    const normalizedDate = startOfDate(ensureFutureOrToday(visitDate, 'Р”Р°С‚Р° РІРёР·РёС‚Р°'));

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
      throw new ValidationError('РќР°РїРёС€Рё Р°РґСЂРµСЃ РґРѕСЃС‚Р°РІРєРё.');
    }

    try {
      const booking = await prisma.$transaction(async (tx) => {
        let createdBooking;
        if (visitMode === VisitMode.BOUTIQUE) {
          if (!data.boutiqueId || !data.slotId || !data.visitDate) {
            throw new ValidationError('Р’С‹Р±РµСЂРё Р±СѓС‚РёРє, РґРµРЅСЊ Рё РІСЂРµРјСЏ.');
          }

          const normalizedVisitDate = startOfDate(ensureFutureOrToday(data.visitDate, 'Р”Р°С‚Р° РІРёР·РёС‚Р°'));
          const boutique = await tx.boutique.findFirst({
            where: {
              id: data.boutiqueId,
              isActive: true,
            },
          });

          if (!boutique) {
            throw new NotFoundError('Р­С‚РѕС‚ Р±СѓС‚РёРє СЃРµР№С‡Р°СЃ РЅРµРґРѕСЃС‚СѓРїРµРЅ.');
          }

          const slot = await tx.timeSlot.findFirst({
            where: {
              id: data.slotId,
              boutiqueId: data.boutiqueId,
              isActive: true,
            },
          });

          if (!slot) {
            throw new NotFoundError('Р­С‚Рѕ РІСЂРµРјСЏ СЃРµР№С‡Р°СЃ РЅРµРґРѕСЃС‚СѓРїРЅРѕ.');
          }

          const available = await isSlotAvailable({
            boutiqueId: boutique.id,
            slotId: slot.id,
            visitDate: normalizedVisitDate,
            prismaClient: tx,
          });

          if (!available) {
            throw new ForbiddenError('Р­С‚Рѕ РІСЂРµРјСЏ СѓР¶Рµ Р·Р°РЅСЏС‚Рѕ. Р’С‹Р±РµСЂРё РґСЂСѓРіРѕРµ.');
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
        throw new ForbiddenError('Р­С‚Рѕ РІСЂРµРјСЏ СѓР¶Рµ Р·Р°РЅСЏР»Рё. Р’С‹Р±РµСЂРё РґСЂСѓРіРѕРµ.');
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
          message: `РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ РѕС‚РјРµРЅРёР» Р·Р°РїРёСЃСЊ ${activeBooking.publicId}`,
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
      throw new ValidationError('Р’С‹Р±РµСЂРё РЅРѕРІС‹Р№ РґРµРЅСЊ Рё РІСЂРµРјСЏ.');
    }

    const normalizedVisitDate = startOfDate(ensureFutureOrToday(visitDate, 'Р”Р°С‚Р° РІРёР·РёС‚Р°'));

    try {
      const result = await prisma.$transaction(async (tx) => {
        const activeBooking = await requireUserActiveBoutiqueBooking(userId, bookingId, {
          includeUser: true,
          prismaClient: tx,
        });

        if (!activeBooking.boutiqueId) {
          throw new ValidationError('Р­С‚Сѓ Р·Р°РїРёСЃСЊ РїРѕРєР° РЅРµР»СЊР·СЏ РїРµСЂРµРЅРµСЃС‚Рё.');
        }

        const boutique = await tx.boutique.findFirst({
          where: {
            id: activeBooking.boutiqueId,
            isActive: true,
          },
        });

        if (!boutique) {
          throw new NotFoundError('Р­С‚РѕС‚ Р±СѓС‚РёРє СЃРµР№С‡Р°СЃ РЅРµРґРѕСЃС‚СѓРїРµРЅ.');
        }

        const slot = await tx.timeSlot.findFirst({
          where: {
            id: slotId,
            boutiqueId: boutique.id,
            isActive: true,
          },
        });

        if (!slot) {
          throw new NotFoundError('Р­С‚Рѕ РІСЂРµРјСЏ СЃРµР№С‡Р°СЃ РЅРµРґРѕСЃС‚СѓРїРЅРѕ.');
        }

        const isSameSlot =
          activeBooking.timeSlotId === slot.id &&
          activeBooking.visitDate &&
          dayjs(activeBooking.visitDate).isSame(normalizedVisitDate, 'day');

        if (isSameSlot) {
          throw new ValidationError('Р­С‚Рѕ СѓР¶Рµ РІР°С€Р° С‚РµРєСѓС‰Р°СЏ Р·Р°РїРёСЃСЊ. Р’С‹Р±РµСЂРё РґСЂСѓРіРѕРµ РІСЂРµРјСЏ.');
        }

        const available = await isSlotAvailable({
          boutiqueId: boutique.id,
          slotId: slot.id,
          visitDate: normalizedVisitDate,
          prismaClient: tx,
        });

        if (!available) {
          throw new ForbiddenError('Р­С‚Рѕ РІСЂРµРјСЏ СѓР¶Рµ Р·Р°РЅСЏС‚Рѕ. Р’С‹Р±РµСЂРё РґСЂСѓРіРѕРµ.');
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
            message: `Р—Р°РїРёСЃСЊ ${activeBooking.publicId} Р·Р°РјРµРЅРµРЅР° РЅРѕРІРѕР№ Р·Р°РїРёСЃСЊСЋ ${newBooking.publicId}`,
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
        throw new ForbiddenError('Р­С‚Рѕ РІСЂРµРјСЏ СѓР¶Рµ Р·Р°РЅСЏР»Рё. Р’С‹Р±РµСЂРё РґСЂСѓРіРѕРµ.');
      }

      throw error;
    }
  }

  function normalizeRequestType(requestType) {
    if (!Object.values(BookingRequestType).includes(requestType)) {
      throw new ValidationError('Р’С‹Р±РµСЂРё С‚РёРї Р·Р°СЏРІРєРё.');
    }

    return requestType;
  }

  function normalizeVisitMode(visitMode) {
    if (!Object.values(VisitMode).includes(visitMode)) {
      throw new ValidationError('Р’С‹Р±РµСЂРё С„РѕСЂРјР°С‚.');
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
      throw new NotFoundError('Р‘СѓС‚РёРє РЅРµ РЅР°Р№РґРµРЅ');
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
      throw new NotFoundError('РЎР»РѕС‚ РЅРµ РЅР°Р№РґРµРЅ');
    }

    return slot;
  }

  async function requireUser(userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundError('РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ РЅРµ РЅР°Р№РґРµРЅ');
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
    getUserVisibleBoutiques,
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

[src/bot/keyboards/booking.js](C:\Users\PC\OneDrive\Desktop\cerca trova bot\src\bot\keyboards\booking.js)
```js
import { Markup } from 'telegraf';
import { isDisallowedUserBoutiqueLabel } from '../../utils/boutiques.js';

export const BOOKING_WIZARD_BUTTONS = Object.freeze({
  BACK: 'РќР°Р·Р°Рґ',
  CANCEL: 'РћС‚РјРµРЅР°',
  CONFIRM: 'РџРѕРґС‚РІРµСЂРґРёС‚СЊ',
});

export const BOOKING_CALLBACKS = Object.freeze({
  BACK: 'booking:back',
  CANCEL: 'booking:cancel',
  CONFIRM: 'booking:confirm',
  MODE_BOUTIQUE: 'booking:mode:boutique',
  MODE_DELIVERY: 'booking:mode:delivery',
  REQUEST_PICKUP: 'booking:request:pickup',
  REQUEST_RETURN: 'booking:request:return',
  REQUEST_RETURN_PICKUP: 'booking:request:return_pickup',
  SKIP_WISH: 'booking:wish:skip',
  BOUTIQUE_PREFIX: 'booking:boutique:',
  DATE_PREFIX: 'booking:date:',
  SLOT_PREFIX: 'booking:slot:',
  USER_CANCEL_PREFIX: 'booking:user:cancel:',
  USER_CANCEL_CONFIRM_PREFIX: 'booking:user:cancel:confirm:',
  USER_CANCEL_BACK_PREFIX: 'booking:user:cancel:back:',
  USER_RESCHEDULE_PREFIX: 'booking:user:reschedule:',
  USER_RESCHEDULE_CONTINUE_PREFIX: 'booking:user:reschedule:continue:',
  USER_RESCHEDULE_BACK_PREFIX: 'booking:user:reschedule:back:',
  RESCHEDULE_DATE_PREFIX: 'booking:reschedule:date:',
  RESCHEDULE_SLOT_PREFIX: 'booking:reschedule:slot:',
  RESCHEDULE_CONFIRM: 'booking:reschedule:confirm',
  RESCHEDULE_BACK: 'booking:reschedule:back',
  RESCHEDULE_CANCEL: 'booking:reschedule:cancel',
});

export const USER_UI_OPTION_KINDS = Object.freeze({
  BOUTIQUE: 'boutique',
  DATE: 'date',
  SLOT: 'slot',
});

function buildReplyKeyboard(rows) {
  return Markup.keyboard(rows).resize();
}

function buildInlineKeyboard(rows) {
  return Markup.inlineKeyboard(rows);
}

function callbackButton(text, callbackData) {
  return Markup.button.callback(text, callbackData);
}

function hasText(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function sanitizeUserUiOptions(options, kind) {
  const normalizedOptions = Array.isArray(options) ? options : [];

  return normalizedOptions.filter((option) => {
    if (option?.kind !== kind || !hasText(option.label)) {
      return false;
    }

    if (kind === USER_UI_OPTION_KINDS.BOUTIQUE) {
      return hasText(option.id) && !isDisallowedUserBoutiqueLabel(option.label);
    }

    if (kind === USER_UI_OPTION_KINDS.DATE) {
      return hasText(option.code);
    }

    if (kind === USER_UI_OPTION_KINDS.SLOT) {
      return hasText(option.id);
    }

    return false;
  });
}

export function getBookingTextStepKeyboard({ includeBack = true } = {}) {
  const rows = [];
  const actions = [];

  if (includeBack) {
    actions.push(BOOKING_WIZARD_BUTTONS.BACK);
  }

  actions.push(BOOKING_WIZARD_BUTTONS.CANCEL);
  rows.push(actions);

  return buildReplyKeyboard(rows);
}

export function getRequestTypeKeyboard() {
  return buildInlineKeyboard([
    [callbackButton('Р’РѕР·РІСЂР°С‚', BOOKING_CALLBACKS.REQUEST_RETURN)],
    [callbackButton('Р—Р°Р±РѕСЂ', BOOKING_CALLBACKS.REQUEST_PICKUP)],
    [callbackButton('Р’РѕР·РІСЂР°С‚ + Р—Р°Р±РѕСЂ', BOOKING_CALLBACKS.REQUEST_RETURN_PICKUP)],
    [callbackButton('РћС‚РјРµРЅР°', BOOKING_CALLBACKS.CANCEL)],
  ]);
}

export function getWishKeyboard() {
  return buildInlineKeyboard([
    [callbackButton('РџСЂРѕРїСѓСЃС‚РёС‚СЊ', BOOKING_CALLBACKS.SKIP_WISH)],
    [
      callbackButton(BOOKING_WIZARD_BUTTONS.BACK, BOOKING_CALLBACKS.BACK),
      callbackButton(BOOKING_WIZARD_BUTTONS.CANCEL, BOOKING_CALLBACKS.CANCEL),
    ],
  ]);
}

export function getVisitModeKeyboard() {
  return buildInlineKeyboard([
    [callbackButton('рџЏ¬ Р‘СѓС‚РёРє', BOOKING_CALLBACKS.MODE_BOUTIQUE)],
    [callbackButton('рџљљ Р”РѕСЃС‚Р°РІРєР°', BOOKING_CALLBACKS.MODE_DELIVERY)],
    [
      callbackButton(BOOKING_WIZARD_BUTTONS.BACK, BOOKING_CALLBACKS.BACK),
      callbackButton(BOOKING_WIZARD_BUTTONS.CANCEL, BOOKING_CALLBACKS.CANCEL),
    ],
  ]);
}

export function getBoutiquesKeyboard(options) {
  const sanitizedOptions = sanitizeUserUiOptions(options, USER_UI_OPTION_KINDS.BOUTIQUE);

  return buildInlineKeyboard([
    ...sanitizedOptions.map((option) => [callbackButton(option.label, `${BOOKING_CALLBACKS.BOUTIQUE_PREFIX}${option.id}`)]),
    [
      callbackButton(BOOKING_WIZARD_BUTTONS.BACK, BOOKING_CALLBACKS.BACK),
      callbackButton(BOOKING_WIZARD_BUTTONS.CANCEL, BOOKING_CALLBACKS.CANCEL),
    ],
  ]);
}

export function getDateKeyboard(options) {
  const sanitizedOptions = sanitizeUserUiOptions(options, USER_UI_OPTION_KINDS.DATE);
  const rows = [];

  for (let index = 0; index < sanitizedOptions.length; index += 2) {
    rows.push(
      sanitizedOptions.slice(index, index + 2).map((option) => (
        callbackButton(option.label, `${BOOKING_CALLBACKS.DATE_PREFIX}${option.code}`)
      )),
    );
  }

  rows.push([
    callbackButton(BOOKING_WIZARD_BUTTONS.BACK, BOOKING_CALLBACKS.BACK),
    callbackButton(BOOKING_WIZARD_BUTTONS.CANCEL, BOOKING_CALLBACKS.CANCEL),
  ]);

  return buildInlineKeyboard(rows);
}

export function getSlotKeyboard(options) {
  const sanitizedOptions = sanitizeUserUiOptions(options, USER_UI_OPTION_KINDS.SLOT);

  return buildInlineKeyboard([
    ...sanitizedOptions.map((option) => [callbackButton(option.label, `${BOOKING_CALLBACKS.SLOT_PREFIX}${option.id}`)]),
    [
      callbackButton(BOOKING_WIZARD_BUTTONS.BACK, BOOKING_CALLBACKS.BACK),
      callbackButton(BOOKING_WIZARD_BUTTONS.CANCEL, BOOKING_CALLBACKS.CANCEL),
    ],
  ]);
}

export function getBookingConfirmKeyboard() {
  return buildInlineKeyboard([
    [callbackButton(BOOKING_WIZARD_BUTTONS.CONFIRM, BOOKING_CALLBACKS.CONFIRM)],
    [
      callbackButton(BOOKING_WIZARD_BUTTONS.BACK, BOOKING_CALLBACKS.BACK),
      callbackButton(BOOKING_WIZARD_BUTTONS.CANCEL, BOOKING_CALLBACKS.CANCEL),
    ],
  ]);
}

export function getUserBoutiqueBookingActionsKeyboard(bookingId) {
  return buildInlineKeyboard([
    [callbackButton('РџРµСЂРµР·Р°РїРёСЃР°С‚СЊСЃСЏ', `${BOOKING_CALLBACKS.USER_RESCHEDULE_PREFIX}${bookingId}`)],
    [callbackButton('РћС‚РјРµРЅРёС‚СЊ', `${BOOKING_CALLBACKS.USER_CANCEL_PREFIX}${bookingId}`)],
  ]);
}

export function getUserBookingCancelConfirmKeyboard(bookingId) {
  return buildInlineKeyboard([
    [callbackButton('Р”Р°, РѕС‚РјРµРЅРёС‚СЊ', `${BOOKING_CALLBACKS.USER_CANCEL_CONFIRM_PREFIX}${bookingId}`)],
    [callbackButton('РќР°Р·Р°Рґ', `${BOOKING_CALLBACKS.USER_CANCEL_BACK_PREFIX}${bookingId}`)],
  ]);
}

export function getUserBookingReschedulePromptKeyboard(bookingId) {
  return buildInlineKeyboard([
    [callbackButton('РџСЂРѕРґРѕР»Р¶РёС‚СЊ', `${BOOKING_CALLBACKS.USER_RESCHEDULE_CONTINUE_PREFIX}${bookingId}`)],
    [callbackButton('РќР°Р·Р°Рґ', `${BOOKING_CALLBACKS.USER_RESCHEDULE_BACK_PREFIX}${bookingId}`)],
  ]);
}

export function getBookingRescheduleDateKeyboard(options) {
  const sanitizedOptions = sanitizeUserUiOptions(options, USER_UI_OPTION_KINDS.DATE);
  const rows = [];

  for (let index = 0; index < sanitizedOptions.length; index += 2) {
    rows.push(
      sanitizedOptions.slice(index, index + 2).map((option) => (
        callbackButton(option.label, `${BOOKING_CALLBACKS.RESCHEDULE_DATE_PREFIX}${option.code}`)
      )),
    );
  }

  rows.push([
    callbackButton('РќР°Р·Р°Рґ', BOOKING_CALLBACKS.RESCHEDULE_BACK),
    callbackButton('РћС‚РјРµРЅР°', BOOKING_CALLBACKS.RESCHEDULE_CANCEL),
  ]);

  return buildInlineKeyboard(rows);
}

export function getBookingRescheduleSlotKeyboard(options) {
  const sanitizedOptions = sanitizeUserUiOptions(options, USER_UI_OPTION_KINDS.SLOT);

  return buildInlineKeyboard([
    ...sanitizedOptions.map((option) => [callbackButton(option.label, `${BOOKING_CALLBACKS.RESCHEDULE_SLOT_PREFIX}${option.id}`)]),
    [
      callbackButton('РќР°Р·Р°Рґ', BOOKING_CALLBACKS.RESCHEDULE_BACK),
      callbackButton('РћС‚РјРµРЅР°', BOOKING_CALLBACKS.RESCHEDULE_CANCEL),
    ],
  ]);
}

export function getBookingRescheduleConfirmKeyboard() {
  return buildInlineKeyboard([
    [callbackButton('РџРѕРґС‚РІРµСЂРґРёС‚СЊ', BOOKING_CALLBACKS.RESCHEDULE_CONFIRM)],
    [
      callbackButton('РќР°Р·Р°Рґ', BOOKING_CALLBACKS.RESCHEDULE_BACK),
      callbackButton('РћС‚РјРµРЅР°', BOOKING_CALLBACKS.RESCHEDULE_CANCEL),
    ],
  ]);
}

```

[src/bot/scenes/bookingScene.js](C:\Users\PC\OneDrive\Desktop\cerca trova bot\src\bot\scenes\bookingScene.js)
```js
import { BookingRequestType, VisitMode } from '@prisma/client';
import { Scenes } from 'telegraf';

import { BOT_TEXTS } from '../../utils/constants.js';
import { getUserVisibleBoutiqueLabel } from '../../utils/boutiques.js';
import { formatDate } from '../../utils/date.js';
import { AppError } from '../../utils/errors.js';
import { formatSlotLabelForUser } from '../../utils/slots.js';
import {
  BOOKING_CALLBACKS,
  BOOKING_WIZARD_BUTTONS,
  USER_UI_OPTION_KINDS,
  getBookingConfirmKeyboard,
  getBookingTextStepKeyboard,
  getBoutiquesKeyboard,
  getDateKeyboard,
  getRequestTypeKeyboard,
  getSlotKeyboard,
  getVisitModeKeyboard,
  getWishKeyboard,
} from '../keyboards/booking.js';
import { getMainMenuKeyboard } from '../keyboards/mainMenu.js';

export const BOOKING_SCENE_ID = 'booking-scene';

const REQUEST_TYPE_BY_CALLBACK = Object.freeze({
  [BOOKING_CALLBACKS.REQUEST_RETURN]: BookingRequestType.RETURN,
  [BOOKING_CALLBACKS.REQUEST_PICKUP]: BookingRequestType.PICKUP,
  [BOOKING_CALLBACKS.REQUEST_RETURN_PICKUP]: BookingRequestType.RETURN_PICKUP,
});

const VISIT_MODE_BY_CALLBACK = Object.freeze({
  [BOOKING_CALLBACKS.MODE_BOUTIQUE]: VisitMode.BOUTIQUE,
  [BOOKING_CALLBACKS.MODE_DELIVERY]: VisitMode.DELIVERY,
});

function getSceneState(ctx) {
  ctx.wizard.state.bookingDraft ??= {};
  return ctx.wizard.state.bookingDraft;
}

function getMessageText(ctx) {
  return ctx.message?.text?.trim() ?? '';
}

function getCallbackData(ctx) {
  return ctx.callbackQuery?.data ?? '';
}

function isCancelAction(ctx) {
  const text = getMessageText(ctx);
  const callbackData = getCallbackData(ctx);

  return (
    text === BOOKING_WIZARD_BUTTONS.CANCEL ||
    text === '/cancel' ||
    callbackData === BOOKING_CALLBACKS.CANCEL
  );
}

function isBackAction(ctx) {
  const text = getMessageText(ctx);
  const callbackData = getCallbackData(ctx);

  return text === BOOKING_WIZARD_BUTTONS.BACK || callbackData === BOOKING_CALLBACKS.BACK;
}

function extractCallbackValue(ctx, prefix) {
  const callbackData = getCallbackData(ctx);
  return callbackData.startsWith(prefix) ? callbackData.slice(prefix.length) : null;
}

async function answerBookingCallback(ctx, text = undefined) {
  if (!ctx.callbackQuery) {
    return;
  }

  try {
    await ctx.answerCbQuery(text);
  } catch {
    // Ignore callback acknowledgement errors.
  }
}

function buildBlockedMessage(user, supportContact) {
  const lines = [BOT_TEXTS.BLOCKED];

  if (user.blockedReason) {
    lines.push(`РџСЂРёС‡РёРЅР°: ${user.blockedReason}`);
  }

  lines.push(`Р•СЃР»Рё РЅСѓР¶РЅР° РїРѕРјРѕС‰СЊ: ${supportContact}`);

  return lines.join('\n');
}

async function leaveWithMainMenu(ctx, message) {
  await ctx.reply(message, getMainMenuKeyboard());
  await ctx.scene.leave();
}

async function cancelFlow(ctx) {
  await leaveWithMainMenu(ctx, 'Р—Р°СЏРІРєСѓ РјРѕР¶РЅРѕ РѕС„РѕСЂРјРёС‚СЊ РїРѕР·Р¶Рµ.');
}

function getRequestTypeLabel(requestType) {
  return {
    [BookingRequestType.RETURN]: 'Р’РѕР·РІСЂР°С‚',
    [BookingRequestType.PICKUP]: 'Р—Р°Р±РѕСЂ',
    [BookingRequestType.RETURN_PICKUP]: 'Р’РѕР·РІСЂР°С‚ + Р—Р°Р±РѕСЂ',
  }[requestType] ?? 'Р—Р°СЏРІРєР°';
}

function buildBoutiqueConfirmationMessage(state) {
  return [
    'РџСЂРѕРІРµСЂСЊ Р·Р°РїРёСЃСЊ:',
    '',
    `РўРёРї: ${getRequestTypeLabel(state.requestType)}`,
    `Р‘СѓС‚РёРє: ${getUserVisibleBoutiqueLabel(state.boutique, 'Р‘СѓС‚РёРє')}`,
    `Р”Р°С‚Р°: ${formatDate(state.visitDate, 'DD.MM.YYYY')}`,
    `Р’СЂРµРјСЏ: ${formatSlotLabelForUser(state.selectedSlot.label)}`,
    '',
    'РџРѕРґС‚РІРµСЂРґРёС‚СЊ?',
  ].join('\n');
}

function buildDeliveryConfirmationMessage(state) {
  const lines = [
    'РџСЂРѕРІРµСЂСЊ Р·Р°СЏРІРєСѓ:',
    '',
    `РўРёРї: ${getRequestTypeLabel(state.requestType)}`,
    'Р¤РѕСЂРјР°С‚: Р”РѕСЃС‚Р°РІРєР°',
    `РђРґСЂРµСЃ: ${state.deliveryAddress}`,
  ];

  if (state.wishText) {
    lines.push(`РџРѕР¶РµР»Р°РЅРёСЏ: ${state.wishText}`);
  }

  lines.push('', 'РџРѕРґС‚РІРµСЂРґРёС‚СЊ?');

  return lines.join('\n');
}

async function ensureBookingAccess(ctx) {
  const user = await ctx.state.services.registrationService.ensureTelegramUser(ctx.from);
  const isBlocked = await ctx.state.services.bookingService.isUserBlocked(user.id);

  if (isBlocked) {
    await leaveWithMainMenu(ctx, buildBlockedMessage(user, ctx.state.env.SUPPORT_CONTACT));
    return null;
  }

  const registrationSummary = await ctx.state.services.registrationService.getRegistrationSummary(user.id);

  if (!registrationSummary.exists) {
    await leaveWithMainMenu(ctx, 'РЎРЅР°С‡Р°Р»Р° РЅР°Р¶РјРё В«Р РµРіРёСЃС‚СЂР°С†РёСЏВ».');
    return null;
  }

  return user;
}

async function promptWishStep(ctx) {
  await ctx.reply(
    'Р•СЃС‚СЊ РїРѕР¶РµР»Р°РЅРёСЏ?\nРњРѕР¶РЅРѕ РЅР°РїРёСЃР°С‚СЊ РёР»Рё РїСЂРѕРїСѓСЃС‚РёС‚СЊ.',
    getWishKeyboard(),
  );
}

async function promptVisitModeStep(ctx) {
  await ctx.reply('Р’С‹Р±РµСЂРё С„РѕСЂРјР°С‚', getVisitModeKeyboard());
}

async function promptBoutiqueStep(ctx) {
  const boutiques = await ctx.state.services.bookingService.getUserVisibleBoutiques();

  if (boutiques.length === 0) {
    await leaveWithMainMenu(ctx, 'РЎРµР№С‡Р°СЃ Р·Р°РїРёСЃСЊ РІ Р±СѓС‚РёРє РЅРµРґРѕСЃС‚СѓРїРЅР°.');
    return false;
  }

  const state = getSceneState(ctx);
  state.boutiqueOptions = boutiques.map((boutique) => ({
    boutique,
    id: boutique.id,
    kind: USER_UI_OPTION_KINDS.BOUTIQUE,
    label: getUserVisibleBoutiqueLabel(boutique, 'Р‘СѓС‚РёРє'),
  }));

  if (state.boutiqueOptions.length === 0) {
    await leaveWithMainMenu(ctx, 'РЎРµР№С‡Р°СЃ Р·Р°РїРёСЃСЊ РІ Р±СѓС‚РёРє РЅРµРґРѕСЃС‚СѓРїРЅР°.');
    return false;
  }

  await ctx.reply(
    'Р’С‹Р±РµСЂРё Р±СѓС‚РёРє',
    getBoutiquesKeyboard(state.boutiqueOptions),
  );

  return true;
}

async function promptDateStep(ctx) {
  const state = getSceneState(ctx);
  const dateOptions = ctx.state.services.bookingService.getAvailableVisitDates(14).map((value) => ({
    code: formatDate(value, 'YYYY-MM-DD'),
    kind: USER_UI_OPTION_KINDS.DATE,
    label: formatDate(value, 'DD.MM dd'),
    value,
  }));

  state.dateOptions = dateOptions;

  if (dateOptions.length === 0) {
    await leaveWithMainMenu(ctx, 'РЎРµР№С‡Р°СЃ РЅРµС‚ РґРѕСЃС‚СѓРїРЅС‹С… РґР°С‚.');
    return false;
  }

  await ctx.reply(
    'Р’С‹Р±РµСЂРё РґРµРЅСЊ',
    getDateKeyboard(dateOptions),
  );

  return true;
}

async function promptSlotStep(ctx) {
  const state = getSceneState(ctx);
  const slots = await ctx.state.services.bookingService.getAvailableSlotsByDate(state.boutique.id, state.visitDate);
  const availableSlots = slots.filter((item) => item.isAvailable);

  if (availableSlots.length === 0) {
    await ctx.reply(
      'РќР° СЌС‚РѕС‚ РґРµРЅСЊ СЃРІРѕР±РѕРґРЅС‹С… СЃР»РѕС‚РѕРІ РЅРµС‚.',
      getDateKeyboard(state.dateOptions),
    );
    ctx.wizard.selectStep(5);
    return false;
  }

  state.slotOptions = availableSlots.map((item) => ({
    id: item.slot.id,
    kind: USER_UI_OPTION_KINDS.SLOT,
    label: formatSlotLabelForUser(item.slot.label),
    slot: item.slot,
  }));

  await ctx.reply(
    'Р’С‹Р±РµСЂРё РІСЂРµРјСЏ',
    getSlotKeyboard(state.slotOptions),
  );

  return true;
}

async function promptDeliveryAddressStep(ctx) {
  await ctx.reply(
    'РќР°РїРёС€Рё Р°РґСЂРµСЃ РЎР”Р­Рљ',
    getBookingTextStepKeyboard(),
  );
}

async function finalizeBooking(ctx, payload) {
  await ctx.state.services.bookingService.createBooking(payload);
  await leaveWithMainMenu(
    ctx,
    payload.visitMode === VisitMode.BOUTIQUE
      ? 'Р“РѕС‚РѕРІРѕ, С‚С‹ Р·Р°РїРёСЃР°РЅ(Р°) вњЁ'
      : 'Р“РѕС‚РѕРІРѕ, Р·Р°СЏРІРєР° РѕС‚РїСЂР°РІР»РµРЅР° вњЁ',
  );
}

export function createBookingScene() {
  return new Scenes.WizardScene(
    BOOKING_SCENE_ID,
    async (ctx) => {
      const user = await ensureBookingAccess(ctx);

      if (!user) {
        return undefined;
      }

      ctx.wizard.state.bookingDraft = {
        userId: user.id,
      };

      await ctx.reply('Р’С‹Р±РµСЂРё РІР°СЂРёР°РЅС‚', getRequestTypeKeyboard());
      return ctx.wizard.next();
    },
    async (ctx) => {
      if (isCancelAction(ctx)) {
        await answerBookingCallback(ctx);
        await cancelFlow(ctx);
        return undefined;
      }

      const requestType = REQUEST_TYPE_BY_CALLBACK[getCallbackData(ctx)];

      if (!requestType) {
        await answerBookingCallback(ctx, 'Р’С‹Р±РµСЂРё РІР°СЂРёР°РЅС‚ РЅРёР¶Рµ.');
        await ctx.reply('Р’С‹Р±РµСЂРё РІР°СЂРёР°РЅС‚', getRequestTypeKeyboard());
        return undefined;
      }

      const state = getSceneState(ctx);
      state.requestType = requestType;

      await answerBookingCallback(ctx);
      await promptWishStep(ctx);
      return ctx.wizard.next();
    },
    async (ctx) => {
      if (isCancelAction(ctx)) {
        await answerBookingCallback(ctx);
        await cancelFlow(ctx);
        return undefined;
      }

      if (isBackAction(ctx)) {
        await answerBookingCallback(ctx);
        await ctx.reply('Р’С‹Р±РµСЂРё РІР°СЂРёР°РЅС‚', getRequestTypeKeyboard());
        ctx.wizard.selectStep(1);
        return undefined;
      }

      const callbackData = getCallbackData(ctx);

      if (callbackData === BOOKING_CALLBACKS.SKIP_WISH) {
        await answerBookingCallback(ctx);
        getSceneState(ctx).wishText = null;
        await promptVisitModeStep(ctx);
        return ctx.wizard.next();
      }

      const wishText = getMessageText(ctx);

      if (!wishText) {
        await answerBookingCallback(ctx);
        await ctx.reply('РњРѕР¶РЅРѕ РЅР°РїРёСЃР°С‚СЊ РїРѕР¶РµР»Р°РЅРёРµ РёР»Рё РЅР°Р¶Р°С‚СЊ В«РџСЂРѕРїСѓСЃС‚РёС‚СЊВ».', getWishKeyboard());
        return undefined;
      }

      getSceneState(ctx).wishText = wishText;
      await promptVisitModeStep(ctx);
      return ctx.wizard.next();
    },
    async (ctx) => {
      if (isCancelAction(ctx)) {
        await answerBookingCallback(ctx);
        await cancelFlow(ctx);
        return undefined;
      }

      if (isBackAction(ctx)) {
        await answerBookingCallback(ctx);
        await promptWishStep(ctx);
        ctx.wizard.selectStep(2);
        return undefined;
      }

      const visitMode = VISIT_MODE_BY_CALLBACK[getCallbackData(ctx)];

      if (!visitMode) {
        await answerBookingCallback(ctx, 'Р’С‹Р±РµСЂРё С„РѕСЂРјР°С‚ РЅРёР¶Рµ.');
        await promptVisitModeStep(ctx);
        return undefined;
      }

      const state = getSceneState(ctx);
      state.visitMode = visitMode;

      await answerBookingCallback(ctx);

      if (visitMode === VisitMode.BOUTIQUE) {
        const prompted = await promptBoutiqueStep(ctx);

        if (!prompted) {
          return undefined;
        }

        return ctx.wizard.next();
      }

      await promptDeliveryAddressStep(ctx);
      ctx.wizard.selectStep(8);
      return undefined;
    },
    async (ctx) => {
      if (isCancelAction(ctx)) {
        await answerBookingCallback(ctx);
        await cancelFlow(ctx);
        return undefined;
      }

      if (isBackAction(ctx)) {
        await answerBookingCallback(ctx);
        await promptVisitModeStep(ctx);
        ctx.wizard.selectStep(3);
        return undefined;
      }

      const state = getSceneState(ctx);
      const boutiqueId = extractCallbackValue(ctx, BOOKING_CALLBACKS.BOUTIQUE_PREFIX);
      const selected = state.boutiqueOptions?.find((item) => item.id === boutiqueId);

      if (!selected) {
        await answerBookingCallback(ctx, 'Р’С‹Р±РµСЂРё Р±СѓС‚РёРє РЅРёР¶Рµ.');
        await ctx.reply('Р’С‹Р±РµСЂРё Р±СѓС‚РёРє', getBoutiquesKeyboard(state.boutiqueOptions ?? []));
        return undefined;
      }

      state.boutique = selected.boutique;

      await answerBookingCallback(ctx);
      const prompted = await promptDateStep(ctx);

      if (prompted) {
        return ctx.wizard.next();
      }

      return undefined;
    },
    async (ctx) => {
      if (isCancelAction(ctx)) {
        await answerBookingCallback(ctx);
        await cancelFlow(ctx);
        return undefined;
      }

      if (isBackAction(ctx)) {
        await answerBookingCallback(ctx);
        const prompted = await promptBoutiqueStep(ctx);

        if (prompted) {
          ctx.wizard.selectStep(4);
        }

        return undefined;
      }

      const state = getSceneState(ctx);
      const dateCode = extractCallbackValue(ctx, BOOKING_CALLBACKS.DATE_PREFIX);
      const selectedDate = state.dateOptions?.find((item) => item.code === dateCode);

      if (!selectedDate) {
        await answerBookingCallback(ctx, 'Р’С‹Р±РµСЂРё РґРµРЅСЊ РЅРёР¶Рµ.');
        await ctx.reply('Р’С‹Р±РµСЂРё РґРµРЅСЊ', getDateKeyboard(state.dateOptions ?? []));
        return undefined;
      }

      state.visitDate = selectedDate.value;

      await answerBookingCallback(ctx);

      const prompted = await promptSlotStep(ctx);

      if (!prompted) {
        return undefined;
      }

      return ctx.wizard.next();
    },
    async (ctx) => {
      if (isCancelAction(ctx)) {
        await answerBookingCallback(ctx);
        await cancelFlow(ctx);
        return undefined;
      }

      if (isBackAction(ctx)) {
        await answerBookingCallback(ctx);
        const prompted = await promptDateStep(ctx);

        if (prompted) {
          ctx.wizard.selectStep(5);
        }

        return undefined;
      }

      const state = getSceneState(ctx);
      const slotId = extractCallbackValue(ctx, BOOKING_CALLBACKS.SLOT_PREFIX);
      const selectedSlot = state.slotOptions?.find((item) => item.id === slotId);

      if (!selectedSlot) {
        await answerBookingCallback(ctx, 'Р’С‹Р±РµСЂРё РІСЂРµРјСЏ РЅРёР¶Рµ.');
        await ctx.reply('Р’С‹Р±РµСЂРё РІСЂРµРјСЏ', getSlotKeyboard(state.slotOptions ?? []));
        return undefined;
      }

      state.selectedSlot = selectedSlot.slot;

      await answerBookingCallback(ctx);
      await ctx.reply(
        buildBoutiqueConfirmationMessage(state),
        getBookingConfirmKeyboard(),
      );

      return ctx.wizard.next();
    },
    async (ctx) => {
      if (isCancelAction(ctx)) {
        await answerBookingCallback(ctx);
        await cancelFlow(ctx);
        return undefined;
      }

      if (isBackAction(ctx)) {
        await answerBookingCallback(ctx);
        const prompted = await promptSlotStep(ctx);

        if (prompted) {
          ctx.wizard.selectStep(6);
        }

        return undefined;
      }

      if (getCallbackData(ctx) !== BOOKING_CALLBACKS.CONFIRM) {
        await answerBookingCallback(ctx, 'Р’С‹Р±РµСЂРё РєРЅРѕРїРєСѓ РЅРёР¶Рµ.');
        await ctx.reply(
          buildBoutiqueConfirmationMessage(getSceneState(ctx)),
          getBookingConfirmKeyboard(),
        );
        return undefined;
      }

      const state = getSceneState(ctx);

      try {
        await answerBookingCallback(ctx);
        await finalizeBooking(ctx, {
          boutiqueId: state.boutique.id,
          requestType: state.requestType,
          slotId: state.selectedSlot.id,
          userId: state.userId,
          visitDate: state.visitDate,
          visitMode: state.visitMode,
          wishText: state.wishText,
        });
      } catch (error) {
        if (error instanceof AppError) {
          await ctx.reply(error.message);

          const prompted = await promptSlotStep(ctx);

          if (prompted) {
            ctx.wizard.selectStep(6);
          }

          return undefined;
        }

        throw error;
      }

      return undefined;
    },
    async (ctx) => {
      if (isCancelAction(ctx)) {
        await answerBookingCallback(ctx);
        await cancelFlow(ctx);
        return undefined;
      }

      if (isBackAction(ctx)) {
        await answerBookingCallback(ctx);
        await promptVisitModeStep(ctx);
        ctx.wizard.selectStep(3);
        return undefined;
      }

      const deliveryAddress = getMessageText(ctx);

      if (!deliveryAddress) {
        await answerBookingCallback(ctx);
        await promptDeliveryAddressStep(ctx);
        return undefined;
      }

      const state = getSceneState(ctx);
      state.deliveryAddress = deliveryAddress;

      await ctx.reply(
        buildDeliveryConfirmationMessage(state),
        getBookingConfirmKeyboard(),
      );

      return ctx.wizard.next();
    },
    async (ctx) => {
      if (isCancelAction(ctx)) {
        await answerBookingCallback(ctx);
        await cancelFlow(ctx);
        return undefined;
      }

      if (isBackAction(ctx)) {
        await answerBookingCallback(ctx);
        await promptDeliveryAddressStep(ctx);
        ctx.wizard.selectStep(8);
        return undefined;
      }

      if (getCallbackData(ctx) !== BOOKING_CALLBACKS.CONFIRM) {
        await answerBookingCallback(ctx, 'Р’С‹Р±РµСЂРё РєРЅРѕРїРєСѓ РЅРёР¶Рµ.');
        await ctx.reply(
          buildDeliveryConfirmationMessage(getSceneState(ctx)),
          getBookingConfirmKeyboard(),
        );
        return undefined;
      }

      const state = getSceneState(ctx);

      try {
        await answerBookingCallback(ctx);
        await finalizeBooking(ctx, {
          deliveryAddress: state.deliveryAddress,
          requestType: state.requestType,
          userId: state.userId,
          visitMode: state.visitMode,
          wishText: state.wishText,
        });
      } catch (error) {
        if (error instanceof AppError) {
          await ctx.reply(error.message, getBookingConfirmKeyboard());
          return undefined;
        }

        throw error;
      }

      return undefined;
    },
  );
}

```

[src/bot/scenes/bookingRescheduleScene.js](C:\Users\PC\OneDrive\Desktop\cerca trova bot\src\bot\scenes\bookingRescheduleScene.js)
```js
import { BookingStatus, VisitMode } from '@prisma/client';
import { Scenes } from 'telegraf';

import { getUserVisibleBoutiqueLabel } from '../../utils/boutiques.js';
import { formatDate } from '../../utils/date.js';
import { AppError } from '../../utils/errors.js';
import { formatUserBookingCard } from '../../utils/formatters.js';
import { formatSlotLabelForUser } from '../../utils/slots.js';
import {
  BOOKING_CALLBACKS,
  USER_UI_OPTION_KINDS,
  getBookingRescheduleConfirmKeyboard,
  getBookingRescheduleDateKeyboard,
  getBookingRescheduleSlotKeyboard,
  getUserBoutiqueBookingActionsKeyboard,
} from '../keyboards/booking.js';
import { getMainMenuKeyboard } from '../keyboards/mainMenu.js';

export const BOOKING_RESCHEDULE_SCENE_ID = 'booking-reschedule-scene';

const ACTIVE_BOOKING_STATUSES = [BookingStatus.CREATED, BookingStatus.SUBMITTED];

function getSceneState(ctx) {
  ctx.wizard.state.bookingReschedule ??= {};
  return ctx.wizard.state.bookingReschedule;
}

function getCallbackData(ctx) {
  return ctx.callbackQuery?.data ?? '';
}

function extractCallbackValue(ctx, prefix) {
  const callbackData = getCallbackData(ctx);
  return callbackData.startsWith(prefix) ? callbackData.slice(prefix.length) : null;
}

function isMessageNotModifiedError(error) {
  return error?.description === 'Bad Request: message is not modified' || error?.response?.description === 'Bad Request: message is not modified';
}

async function answerBookingCallback(ctx, text = undefined) {
  if (!ctx.callbackQuery) {
    return;
  }

  try {
    await ctx.answerCbQuery(text);
  } catch {
    // Ignore callback acknowledgement errors.
  }
}

async function renderSceneMessage(ctx, text, markup = undefined) {
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

function buildBookingReferenceText(booking) {
  return [
    'РџРµСЂРµР·Р°РїРёСЃСЊ',
    `Р‘СѓС‚РёРє: ${getUserVisibleBoutiqueLabel(booking, 'Р‘СѓС‚РёРє')}`,
    `РЎРµР№С‡Р°СЃ: ${booking.visitDate ? formatDate(booking.visitDate, 'DD.MM.YYYY') : 'РќРµ СѓРєР°Р·Р°РЅРѕ'} / ${formatSlotLabelForUser(booking.slotLabel) || 'РќРµ СѓРєР°Р·Р°РЅРѕ'}`,
  ].join('\n');
}

function buildDateStepText(booking, notice = '') {
  return [
    notice,
    buildBookingReferenceText(booking),
    '',
    'Р’С‹Р±РµСЂРё РЅРѕРІС‹Р№ РґРµРЅСЊ',
  ]
    .filter(Boolean)
    .join('\n');
}

function buildSlotStepText(booking, visitDate, notice = '') {
  return [
    notice,
    buildBookingReferenceText(booking),
    `РќРѕРІС‹Р№ РґРµРЅСЊ: ${formatDate(visitDate, 'DD.MM.YYYY')}`,
    '',
    'Р’С‹Р±РµСЂРё РЅРѕРІРѕРµ РІСЂРµРјСЏ',
  ]
    .filter(Boolean)
    .join('\n');
}

function buildConfirmText(booking, state) {
  return [
    buildBookingReferenceText(booking),
    '',
    `РќРѕРІС‹Р№ РґРµРЅСЊ: ${formatDate(state.visitDate, 'DD.MM.YYYY')}`,
    `РќРѕРІРѕРµ РІСЂРµРјСЏ: ${formatSlotLabelForUser(state.selectedSlot.label)}`,
    '',
    'РўРµРєСѓС‰Р°СЏ Р·Р°РїРёСЃСЊ Р±СѓРґРµС‚ Р·Р°РјРµРЅРµРЅР° РЅРѕРІРѕР№. РџСЂРѕРґРѕР»Р¶РёС‚СЊ?',
  ].join('\n');
}

function buildSuccessText(booking) {
  return [
    'Р“РѕС‚РѕРІРѕ, Р·Р°РїРёСЃСЊ РѕР±РЅРѕРІР»РµРЅР° вњЁ',
    '',
    formatUserBookingCard(booking, {
      includeStatus: false,
    }),
  ].join('\n');
}

function isActiveBooking(booking) {
  return ACTIVE_BOOKING_STATUSES.includes(booking.status);
}

function buildBookingCardText(booking, notice = '') {
  return [
    notice,
    formatUserBookingCard(booking, {
      includeStatus: !isActiveBooking(booking),
    }),
  ]
    .filter(Boolean)
    .join('\n\n');
}

function getBookingKeyboard(booking) {
  if (booking.visitMode !== VisitMode.BOUTIQUE || !isActiveBooking(booking)) {
    return undefined;
  }

  return getUserBoutiqueBookingActionsKeyboard(booking.id);
}

async function leaveToMainMenu(ctx, message) {
  await ctx.scene.leave();
  await ctx.reply(message, getMainMenuKeyboard());
}

async function promptDateStep(ctx, notice = '') {
  const state = getSceneState(ctx);
  state.dateOptions = ctx.state.services.bookingService.getAvailableVisitDates(14).map((value) => ({
    code: formatDate(value, 'YYYY-MM-DD'),
    kind: USER_UI_OPTION_KINDS.DATE,
    label: formatDate(value, 'DD.MM dd'),
    value,
  }));

  if (state.dateOptions.length === 0) {
    await leaveBackToCurrentCard(ctx, notice || 'РЎРµР№С‡Р°СЃ РЅРµС‚ РґРѕСЃС‚СѓРїРЅС‹С… РґР°С‚.');
    return false;
  }

  await renderSceneMessage(
    ctx,
    buildDateStepText(state.booking, notice),
    getBookingRescheduleDateKeyboard(state.dateOptions),
  );

  return true;
}

async function promptSlotStep(ctx, notice = '') {
  const state = getSceneState(ctx);
  const slots = await ctx.state.services.bookingService.getAvailableSlotsByDate(
    state.booking.boutiqueId,
    state.visitDate,
  );
  const availableSlots = slots.filter((item) => item.isAvailable);

  if (availableSlots.length === 0) {
    await promptDateStep(ctx, notice || 'РќР° СЌС‚РѕС‚ РґРµРЅСЊ СЃРІРѕР±РѕРґРЅС‹С… СЃР»РѕС‚РѕРІ РЅРµС‚.');
    ctx.wizard.selectStep(1);
    return false;
  }

  state.slotOptions = availableSlots.map((item) => ({
    id: item.slot.id,
    kind: USER_UI_OPTION_KINDS.SLOT,
    label: formatSlotLabelForUser(item.slot.label),
    slot: item.slot,
  }));

  await renderSceneMessage(
    ctx,
    buildSlotStepText(state.booking, state.visitDate, notice),
    getBookingRescheduleSlotKeyboard(state.slotOptions),
  );

  return true;
}

async function leaveBackToCurrentCard(ctx, notice = '') {
  const state = getSceneState(ctx);
  const latestBooking = await ctx.state.services.bookingService.getUserBookingById(
    state.userId,
    state.bookingId,
  );

  await renderSceneMessage(
    ctx,
    buildBookingCardText(latestBooking ?? state.booking, notice),
    getBookingKeyboard(latestBooking ?? state.booking),
  );
  await ctx.scene.leave();
}

export function createBookingRescheduleScene() {
  return new Scenes.WizardScene(
    BOOKING_RESCHEDULE_SCENE_ID,
    async (ctx) => {
      const bookingId = ctx.scene.state?.bookingId;
      const user = await ctx.state.services.registrationService.ensureTelegramUser(ctx.from);

      if (!bookingId) {
        await leaveToMainMenu(ctx, 'Р—Р°РїРёСЃСЊ РЅРµ РЅР°Р№РґРµРЅР°.');
        return undefined;
      }

      const isBlocked = await ctx.state.services.bookingService.isUserBlocked(user.id);

      if (isBlocked) {
        await leaveToMainMenu(ctx, 'РЎРµР№С‡Р°СЃ РґРѕСЃС‚СѓРї РІСЂРµРјРµРЅРЅРѕ РѕРіСЂР°РЅРёС‡РµРЅ.');
        return undefined;
      }

      try {
        const booking = await ctx.state.services.bookingService.getUserActiveBoutiqueBooking(user.id, bookingId);
        const state = getSceneState(ctx);

        state.booking = booking;
        state.bookingId = booking.id;
        state.userId = user.id;

        await answerBookingCallback(ctx);
        const prompted = await promptDateStep(ctx);

        if (prompted) {
          return ctx.wizard.next();
        }

        return undefined;
      } catch (error) {
        if (error instanceof AppError) {
          await answerBookingCallback(ctx, error.message);
          await leaveToMainMenu(ctx, error.message);
          return undefined;
        }

        throw error;
      }
    },
    async (ctx) => {
      const callbackData = getCallbackData(ctx);

      if (
        callbackData === BOOKING_CALLBACKS.RESCHEDULE_BACK ||
        callbackData === BOOKING_CALLBACKS.RESCHEDULE_CANCEL
      ) {
        await answerBookingCallback(ctx);
        await leaveBackToCurrentCard(ctx);
        return undefined;
      }

      const state = getSceneState(ctx);
      const dateCode = extractCallbackValue(ctx, BOOKING_CALLBACKS.RESCHEDULE_DATE_PREFIX);
      const selectedDate = state.dateOptions?.find((item) => item.code === dateCode);

      if (!selectedDate) {
        await answerBookingCallback(ctx, 'Р’С‹Р±РµСЂРё РґРµРЅСЊ РЅРёР¶Рµ.');
        return undefined;
      }

      state.visitDate = selectedDate.value;

      await answerBookingCallback(ctx);
      const prompted = await promptSlotStep(ctx);

      if (prompted) {
        return ctx.wizard.next();
      }

      return undefined;
    },
    async (ctx) => {
      const callbackData = getCallbackData(ctx);

      if (callbackData === BOOKING_CALLBACKS.RESCHEDULE_CANCEL) {
        await answerBookingCallback(ctx);
        await leaveBackToCurrentCard(ctx);
        return undefined;
      }

      if (callbackData === BOOKING_CALLBACKS.RESCHEDULE_BACK) {
        await answerBookingCallback(ctx);
        const prompted = await promptDateStep(ctx);

        if (prompted) {
          ctx.wizard.selectStep(1);
        }

        return undefined;
      }

      const state = getSceneState(ctx);
      const slotId = extractCallbackValue(ctx, BOOKING_CALLBACKS.RESCHEDULE_SLOT_PREFIX);
      const selectedSlot = state.slotOptions?.find((item) => item.id === slotId);

      if (!selectedSlot) {
        await answerBookingCallback(ctx, 'Р’С‹Р±РµСЂРё РІСЂРµРјСЏ РЅРёР¶Рµ.');
        return undefined;
      }

      state.selectedSlot = selectedSlot.slot;

      await answerBookingCallback(ctx);
      await renderSceneMessage(
        ctx,
        buildConfirmText(state.booking, state),
        getBookingRescheduleConfirmKeyboard(),
      );

      return ctx.wizard.next();
    },
    async (ctx) => {
      const callbackData = getCallbackData(ctx);
      const state = getSceneState(ctx);

      if (callbackData === BOOKING_CALLBACKS.RESCHEDULE_CANCEL) {
        await answerBookingCallback(ctx);
        await leaveBackToCurrentCard(ctx);
        return undefined;
      }

      if (callbackData === BOOKING_CALLBACKS.RESCHEDULE_BACK) {
        await answerBookingCallback(ctx);
        const prompted = await promptSlotStep(ctx);

        if (prompted) {
          ctx.wizard.selectStep(2);
        }

        return undefined;
      }

      if (callbackData !== BOOKING_CALLBACKS.RESCHEDULE_CONFIRM) {
        await answerBookingCallback(ctx, 'Р’С‹Р±РµСЂРё РєРЅРѕРїРєСѓ РЅРёР¶Рµ.');
        return undefined;
      }

      try {
        await answerBookingCallback(ctx);
        const result = await ctx.state.services.bookingService.rescheduleBoutiqueBooking({
          bookingId: state.bookingId,
          slotId: state.selectedSlot.id,
          userId: state.userId,
          visitDate: state.visitDate,
        });

        state.booking = result.newBooking;
        state.bookingId = result.newBooking.id;

        await renderSceneMessage(
          ctx,
          buildSuccessText(result.newBooking),
          getUserBoutiqueBookingActionsKeyboard(result.newBooking.id),
        );
        await ctx.scene.leave();
        return undefined;
      } catch (error) {
        if (error instanceof AppError) {
          const latestBooking = await ctx.state.services.bookingService.getUserBookingById(
            state.userId,
            state.bookingId,
          );

          if (
            latestBooking &&
            latestBooking.visitMode === VisitMode.BOUTIQUE &&
            ACTIVE_BOOKING_STATUSES.includes(latestBooking.status)
          ) {
            state.booking = latestBooking;
            const prompted = await promptSlotStep(ctx, error.message);

            if (prompted) {
              ctx.wizard.selectStep(2);
            }

            return undefined;
          }

          await renderSceneMessage(ctx, error.message);
          await ctx.scene.leave();
          return undefined;
        }

        throw error;
      }
    },
  );
}

```

[src/utils/formatters.js](C:\Users\PC\OneDrive\Desktop\cerca trova bot\src\utils\formatters.js)
```js
import {
  BOOKING_REQUEST_TYPE_LABELS,
  BOOKING_STATUS_LABELS,
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

export function formatAdminBookingList(bookings, title, emptyMessage = 'РџРѕРєР° Р·Р°СЏРІРѕРє РЅРµС‚.') {
  if (!Array.isArray(bookings) || bookings.length === 0) {
    return emptyMessage;
  }

  const items = bookings.map((booking, index) => {
    const userLine = `${formatUserDisplayName(booking.user)} | ${getInlineUsername(booking.user)} | ${booking.user?.telegramId ?? 'Р±РµР· id'}`;
    const lines = [
      `${index + 1}. ${userLine}`,
      formatBookingSummary(booking),
      `РЎРѕР·РґР°РЅР°: ${formatDate(booking.createdAt, 'DD.MM.YYYY HH:mm')}`,
    ];

    if (booking.publicId) {
      lines.push(`ID Р·Р°СЏРІРєРё: ${booking.publicId}`);
    }

    return lines.join('\n');
  });

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

