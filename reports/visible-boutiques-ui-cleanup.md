# Visible Boutiques UI Cleanup

## src\utils\boutiques.js

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

export function getUserVisibleBoutiqueLabel(source, fallback = 'Р‘СѓС‚РёРє') {
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

export function getVisibleBoutiqueLabel(source, fallback = 'Р‘СѓС‚РёРє') {
  return getUserVisibleBoutiqueLabel(source, fallback);
}

```

## src\services\bookingService.js

```js
import { BookingRequestType, BookingStatus, Prisma, TimerStatus, VisitMode } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

import { ADMIN_PERMISSIONS, AUDIT_ACTIONS } from '../utils/constants.js';
import { dayjs, formatDate, getNextAvailableBookingDates, now, startOfDate } from '../utils/date.js';
import { AppError, ForbiddenError, NotFoundError, ValidationError } from '../utils/errors.js';
import { filterVisibleBoutiques, isVisibleBoutique } from '../utils/boutiques.js';
import { normalizeEmail, normalizeEmailList, normalizeOptionalEmail } from '../utils/mail.js';
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

function isUserVisibleBooking(booking) {
  if (!booking || !USER_VISIBLE_BOOKING_STATUSES.includes(booking.status)) {
    return false;
  }

  if (booking.visitMode === VisitMode.BOUTIQUE && booking.boutique) {
    return isVisibleBoutique(booking.boutique);
  }

  return true;
}

function isVisibleAdminBooking(booking) {
  if (!booking || !ADMIN_VISIBLE_BOOKING_STATUSES.includes(booking.status)) {
    return false;
  }

  if (booking.visitMode === VisitMode.BOUTIQUE && booking.boutique) {
    return isVisibleBoutique(booking.boutique);
  }

  return true;
}

function filterVisibleAdminBookings(bookings) {
  return Array.isArray(bookings) ? bookings.filter(isVisibleAdminBooking) : [];
}

function buildAdminVisibleBookingsWhere(where = {}) {
  return {
    ...where,
    status: {
      in: ADMIN_VISIBLE_BOOKING_STATUSES,
    },
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

  async function listVisibleAdminRecentBookings(limit = 10) {
    const bookings = await prisma.booking.findMany({
      where: buildAdminVisibleBookingsWhere(),
      include: ADMIN_BOOKING_INCLUDE,
      orderBy: {
        createdAt: 'desc',
      },
    });

    return filterVisibleAdminBookings(bookings).slice(0, limit);
  }

  async function listVisibleAdminBookingsCreatedOnDate(date, limit = 50) {
    const start = dayjs(startOfDate(date));
    const end = start.add(1, 'day').toDate();

    const bookings = await prisma.booking.findMany({
      where: buildAdminVisibleBookingsWhere({
        createdAt: {
          gte: start.toDate(),
          lt: end,
        },
      }),
      include: ADMIN_BOOKING_INCLUDE,
      orderBy: {
        createdAt: 'desc',
      },
    });

    return filterVisibleAdminBookings(bookings).slice(0, limit);
  }

  async function listVisibleAdminTodayBookings(limit = 50) {
    return listVisibleAdminBookingsCreatedOnDate(now().toDate(), limit);
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
    return getVisibleBoutiques();
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

```

## src\bot\scenes\adminSlotScene.js

```js
import { Scenes } from 'telegraf';

import { ADMIN_PERMISSIONS } from '../../utils/constants.js';
import { formatDate } from '../../utils/date.js';
import { formatAdminSlotStateList } from '../../utils/formatters.js';
import { formatSlotLabelForUser } from '../../utils/slots.js';
import {
  ADMIN_CALLBACKS,
  getAdminOptionKeyboard,
  getAdminSkipKeyboard,
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

export const ADMIN_SLOT_SCENE_ID = 'admin-slot-scene';

const SLOT_BOUTIQUE_PREFIX = 'admin-slot:boutique:';
const SLOT_DATE_PREFIX = 'admin-slot:date:';
const SLOT_OPTION_PREFIX = 'admin-slot:slot:';

function getSceneState(ctx) {
  ctx.wizard.state.adminSlot ??= {};
  return ctx.wizard.state.adminSlot;
}

function buildDateOptions(services) {
  return services.bookingService.getAvailableVisitDates(14).map((date) => ({
    code: formatDate(date, 'YYYY-MM-DD'),
    label: formatDate(date, 'DD.MM ddd'),
    value: date,
  }));
}

function buildBoutiquePrompt(boutiques) {
  return getAdminOptionKeyboard(
    boutiques.map((boutique) => ({
      text: boutique.name,
      callbackData: `${SLOT_BOUTIQUE_PREFIX}${boutique.id}`,
    })),
  );
}

function buildDatePrompt(options) {
  return getAdminOptionKeyboard(
    options.map((option) => ({
      text: option.label,
      callbackData: `${SLOT_DATE_PREFIX}${option.code}`,
    })),
    {
      columns: 2,
    },
  );
}

function buildSlotPrompt(options) {
  return getAdminOptionKeyboard(
    options.map((option) => ({
      text: formatSlotLabelForUser(option.slot.label),
      callbackData: `${SLOT_OPTION_PREFIX}${option.slot.id}`,
    })),
  );
}

export function createAdminSlotScene() {
  return new Scenes.WizardScene(
    ADMIN_SLOT_SCENE_ID,
    async (ctx) => {
      const state = getSceneState(ctx);
      const admin = await ensureAdminSceneAccess(ctx, ADMIN_PERMISSIONS.MANAGE_SLOTS);
      const mode = ctx.scene.state?.mode === 'open' ? 'open' : 'close';
      const boutiques = await ctx.state.services.bookingService.getVisibleBoutiques();

      if (boutiques.length === 0) {
        await leaveAdminScene(ctx, admin, 'РЎРЅР°С‡Р°Р»Р° РґРѕР±Р°РІСЊС‚Рµ С…РѕС‚СЏ Р±С‹ РѕРґРёРЅ Р±СѓС‚РёРє.');
        return undefined;
      }

      state.admin = admin;
      state.mode = mode;
      state.boutiques = boutiques;

      await renderAdminPanel(
        ctx,
        mode === 'open' ? 'Р’С‹Р±РµСЂРёС‚Рµ Р±СѓС‚РёРє, РІ РєРѕС‚РѕСЂРѕРј РЅСѓР¶РЅРѕ РѕС‚РєСЂС‹С‚СЊ СЃР»РѕС‚.' : 'Р’С‹Р±РµСЂРёС‚Рµ Р±СѓС‚РёРє, РІ РєРѕС‚РѕСЂРѕРј РЅСѓР¶РЅРѕ Р·Р°РєСЂС‹С‚СЊ СЃР»РѕС‚.',
        buildBoutiquePrompt(boutiques),
      );

      return ctx.wizard.next();
    },
    async (ctx) => {
      const state = getSceneState(ctx);

      if (await maybeLeaveAdminScene(ctx, state.admin)) {
        return undefined;
      }

      const boutiqueId = extractCallbackValue(ctx, SLOT_BOUTIQUE_PREFIX);

      if (!boutiqueId) {
        await answerAdminCallback(ctx, 'Р’С‹Р±РµСЂРёС‚Рµ Р±СѓС‚РёРє РєРЅРѕРїРєРѕР№ РЅРёР¶Рµ.', true);
        return undefined;
      }

      const boutique = state.boutiques.find((item) => item.id === boutiqueId);

      if (!boutique) {
        await answerAdminCallback(ctx, 'Р‘СѓС‚РёРє РЅРµ РЅР°Р№РґРµРЅ. РџРѕРїСЂРѕР±СѓР№С‚Рµ РµС‰Рµ СЂР°Р·.', true);
        return undefined;
      }

      state.boutique = boutique;
      state.dateOptions = buildDateOptions(ctx.state.services);

      await answerAdminCallback(ctx);
      await renderAdminPanel(
        ctx,
        `Р‘СѓС‚РёРє: ${boutique.name}\n\nР’С‹Р±РµСЂРёС‚Рµ РґР°С‚Сѓ.`,
        buildDatePrompt(state.dateOptions),
      );

      return ctx.wizard.next();
    },
    async (ctx) => {
      const state = getSceneState(ctx);

      if (await maybeLeaveAdminScene(ctx, state.admin)) {
        return undefined;
      }

      const dateCode = extractCallbackValue(ctx, SLOT_DATE_PREFIX);

      if (!dateCode) {
        await answerAdminCallback(ctx, 'Р’С‹Р±РµСЂРёС‚Рµ РґР°С‚Сѓ РєРЅРѕРїРєРѕР№ РЅРёР¶Рµ.', true);
        return undefined;
      }

      const selectedDate = state.dateOptions.find((item) => item.code === dateCode);

      if (!selectedDate) {
        await answerAdminCallback(ctx, 'Р”Р°С‚Р° РЅРµ РЅР°Р№РґРµРЅР°. РџРѕРїСЂРѕР±СѓР№С‚Рµ РµС‰Рµ СЂР°Р·.', true);
        return undefined;
      }

      const allEntries = await ctx.state.services.bookingService.getAvailableSlotsByDate(
        state.boutique.id,
        selectedDate.value,
      );

      const slotEntries =
        state.mode === 'open'
          ? allEntries.filter((entry) => entry.closure)
          : allEntries;

      state.date = selectedDate.value;
      state.slotEntries = slotEntries;

      if (slotEntries.length === 0) {
        await answerAdminCallback(ctx);
        await renderAdminPanel(
          ctx,
          state.mode === 'open'
            ? 'РќР° СЌС‚Сѓ РґР°С‚Сѓ РЅРµС‚ РІСЂСѓС‡РЅСѓСЋ Р·Р°РєСЂС‹С‚С‹С… СЃР»РѕС‚РѕРІ. Р’С‹Р±РµСЂРёС‚Рµ РґСЂСѓРіСѓСЋ РґР°С‚Сѓ.'
            : 'РќР° СЌС‚Сѓ РґР°С‚Сѓ РЅРµС‚ РґРѕСЃС‚СѓРїРЅС‹С… СЃР»РѕС‚РѕРІ РґР»СЏ СѓРїСЂР°РІР»РµРЅРёСЏ. Р’С‹Р±РµСЂРёС‚Рµ РґСЂСѓРіСѓСЋ РґР°С‚Сѓ.',
          buildDatePrompt(state.dateOptions),
        );
        return undefined;
      }

      await answerAdminCallback(ctx);
      await renderAdminPanel(
        ctx,
        formatAdminSlotStateList(slotEntries, selectedDate.value, state.mode),
        buildSlotPrompt(slotEntries),
      );

      return ctx.wizard.next();
    },
    async (ctx) => {
      const state = getSceneState(ctx);

      if (await maybeLeaveAdminScene(ctx, state.admin)) {
        return undefined;
      }

      const slotId = extractCallbackValue(ctx, SLOT_OPTION_PREFIX);

      if (!slotId) {
        await answerAdminCallback(ctx, 'Р’С‹Р±РµСЂРёС‚Рµ СЃР»РѕС‚ РєРЅРѕРїРєРѕР№ РЅРёР¶Рµ.', true);
        return undefined;
      }

      const selectedEntry = state.slotEntries.find((entry) => entry.slot.id === slotId);

      if (!selectedEntry) {
        await answerAdminCallback(ctx, 'РЎР»РѕС‚ РЅРµ РЅР°Р№РґРµРЅ. РџРѕРїСЂРѕР±СѓР№С‚Рµ РµС‰Рµ СЂР°Р·.', true);
        return undefined;
      }

      state.selectedSlot = selectedEntry.slot;

      if (state.mode === 'open') {
        await answerAdminCallback(ctx);

        const result = await ctx.state.services.bookingService.openSlot(
          state.boutique.id,
          state.date,
          selectedEntry.slot.id,
          ctx.from.id,
        );

        if (!result) {
          await leaveAdminScene(ctx, state.admin, 'Р­С‚РѕС‚ СЃР»РѕС‚ СѓР¶Рµ РѕС‚РєСЂС‹С‚. Р’С‹Р±РµСЂРёС‚Рµ РґСЂСѓРіРѕР№ СЃР»РѕС‚ РёР»Рё РґР°С‚Сѓ.');
          return undefined;
        }

        await leaveAdminScene(
          ctx,
          state.admin,
          'РЎР»РѕС‚ СЃРЅРѕРІР° РґРѕСЃС‚СѓРїРµРЅ.',
        );
        return undefined;
      }

      await answerAdminCallback(ctx);
      await renderAdminPanel(
        ctx,
        [
          `Р‘СѓС‚РёРє: ${state.boutique.name}`,
          `Р”Р°С‚Р°: ${formatDate(state.date, 'DD.MM.YYYY')}`,
          `РЎР»РѕС‚: ${formatSlotLabelForUser(selectedEntry.slot.label)}`,
          '',
          'Р•СЃР»Рё С…РѕС‚РёС‚Рµ, РѕС‚РїСЂР°РІСЊС‚Рµ РїСЂРёС‡РёРЅСѓ Р·Р°РєСЂС‹С‚РёСЏ РѕРґРЅРёРј СЃРѕРѕР±С‰РµРЅРёРµРј.',
        ].join('\n'),
        getAdminSkipKeyboard('Р‘РµР· РїСЂРёС‡РёРЅС‹'),
      );

      return ctx.wizard.next();
    },
    async (ctx) => {
      const state = getSceneState(ctx);

      if (await maybeLeaveAdminScene(ctx, state.admin)) {
        return undefined;
      }

      let reason = null;

      if (ctx.callbackQuery?.data === ADMIN_CALLBACKS.SCENE_SKIP) {
        await answerAdminCallback(ctx);
      } else {
        reason = getAdminText(ctx);

        if (!reason) {
          await renderAdminPanel(
            ctx,
            'РћС‚РїСЂР°РІСЊС‚Рµ РїСЂРёС‡РёРЅСѓ РѕРґРЅРёРј СЃРѕРѕР±С‰РµРЅРёРµРј РёР»Рё РЅР°Р¶РјРёС‚Рµ "Р‘РµР· РїСЂРёС‡РёРЅС‹".',
            getAdminSkipKeyboard('Р‘РµР· РїСЂРёС‡РёРЅС‹'),
          );
          return undefined;
        }
      }

      await ctx.state.services.bookingService.closeSlot(
        state.boutique.id,
        state.date,
        state.selectedSlot.id,
        ctx.from.id,
        reason,
      );

      await leaveAdminScene(
        ctx,
        state.admin,
        'РЎР»РѕС‚ Р·Р°РєСЂС‹С‚.',
      );

      return undefined;
    },
  );
}

```

## src\bot\scenes\adminTimeSlotScene.js

```js
import { Scenes } from 'telegraf';

import { ADMIN_PERMISSIONS } from '../../utils/constants.js';
import { formatSlotLabelForUser } from '../../utils/slots.js';
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

export const ADMIN_TIME_SLOT_SCENE_ID = 'admin-time-slot-scene';

const TIME_SLOT_BOUTIQUE_PREFIX = 'admin-time-slot:boutique:';
const TIME_SLOT_SELECT_PREFIX = 'admin-time-slot:select:';

function getSceneState(ctx) {
  ctx.wizard.state.adminTimeSlot ??= {};
  return ctx.wizard.state.adminTimeSlot;
}

function isValidTimeValue(value) {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);
}

function toMinutes(value) {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

function buildSlotLabel(startTime, endTime) {
  const compact = (value) => (value.endsWith(':00') ? value.slice(0, 2) : value);
  return `${compact(startTime)}-${compact(endTime)}`;
}

function buildSortOrder(startTime) {
  const [hours, minutes] = startTime.split(':').map(Number);
  return hours * 100 + minutes;
}

function buildBoutiquesKeyboard(boutiques) {
  return getAdminOptionKeyboard(
    boutiques.map((boutique) => ({
      text: boutique.name,
      callbackData: `${TIME_SLOT_BOUTIQUE_PREFIX}${boutique.id}`,
    })),
  );
}

function buildSlotsKeyboard(slots) {
  return getAdminOptionKeyboard(
    slots.map((slot) => ({
      text: formatSlotLabelForUser(slot.label),
      callbackData: `${TIME_SLOT_SELECT_PREFIX}${slot.id}`,
    })),
  );
}

export function createAdminTimeSlotScene() {
  return new Scenes.WizardScene(
    ADMIN_TIME_SLOT_SCENE_ID,
    async (ctx) => {
      const state = getSceneState(ctx);
      const admin = await ensureAdminSceneAccess(ctx, ADMIN_PERMISSIONS.MANAGE_TIME_SLOTS);
      const mode = ctx.scene.state?.mode === 'remove' ? 'remove' : 'add';
      const boutiques = await ctx.state.services.bookingService.getVisibleBoutiques();

      if (boutiques.length === 0) {
        await leaveAdminScene(ctx, admin, 'РЎРЅР°С‡Р°Р»Р° РґРѕР±Р°РІСЊС‚Рµ С…РѕС‚СЏ Р±С‹ РѕРґРёРЅ Р±СѓС‚РёРє.');
        return undefined;
      }

      state.admin = admin;
      state.mode = mode;
      state.boutiques = boutiques;

      await renderAdminPanel(
        ctx,
        mode === 'remove'
          ? 'Р’С‹Р±РµСЂРёС‚Рµ Р±СѓС‚РёРє, РёР· РєРѕС‚РѕСЂРѕРіРѕ РЅСѓР¶РЅРѕ СѓРґР°Р»РёС‚СЊ СЃР»РѕС‚.'
          : 'Р’С‹Р±РµСЂРёС‚Рµ Р±СѓС‚РёРє, РІ РєРѕС‚РѕСЂС‹Р№ РЅСѓР¶РЅРѕ РґРѕР±Р°РІРёС‚СЊ СЃР»РѕС‚.',
        buildBoutiquesKeyboard(boutiques),
      );

      return ctx.wizard.next();
    },
    async (ctx) => {
      const state = getSceneState(ctx);

      if (await maybeLeaveAdminScene(ctx, state.admin)) {
        return undefined;
      }

      const boutiqueId = extractCallbackValue(ctx, TIME_SLOT_BOUTIQUE_PREFIX);

      if (!boutiqueId) {
        await answerAdminCallback(ctx, 'Р’С‹Р±РµСЂРёС‚Рµ Р±СѓС‚РёРє РєРЅРѕРїРєРѕР№ РЅРёР¶Рµ.', true);
        return undefined;
      }

      const boutique = state.boutiques.find((item) => item.id === boutiqueId);

      if (!boutique) {
        await answerAdminCallback(ctx, 'Р‘СѓС‚РёРє РЅРµ РЅР°Р№РґРµРЅ. РџРѕРїСЂРѕР±СѓР№С‚Рµ РµС‰Рµ СЂР°Р·.', true);
        return undefined;
      }

      state.boutique = boutique;
      await answerAdminCallback(ctx);

      if (state.mode === 'remove') {
        const slots = await ctx.state.services.bookingService.getTimeSlots(boutique.id);

        if (slots.length === 0) {
          await leaveAdminScene(ctx, state.admin, 'Р’ СЌС‚РѕРј Р±СѓС‚РёРєРµ РЅРµС‚ Р°РєС‚РёРІРЅС‹С… СЃР»РѕС‚РѕРІ.');
          return undefined;
        }

        state.slots = slots;

        await renderAdminPanel(
          ctx,
          `Р‘СѓС‚РёРє: ${boutique.name}\n\nР’С‹Р±РµСЂРёС‚Рµ СЃР»РѕС‚ РґР»СЏ СѓРґР°Р»РµРЅРёСЏ.`,
          buildSlotsKeyboard(slots),
        );
        ctx.wizard.selectStep(4);
        return undefined;
      }

      await renderAdminPanel(ctx, 'РћС‚РїСЂР°РІСЊС‚Рµ РІСЂРµРјСЏ РЅР°С‡Р°Р»Р° РІ С„РѕСЂРјР°С‚Рµ HH:mm. РќР°РїСЂРёРјРµСЂ: 11:00', getAdminCancelKeyboard());
      return ctx.wizard.next();
    },
    async (ctx) => {
      const state = getSceneState(ctx);

      if (await maybeLeaveAdminScene(ctx, state.admin)) {
        return undefined;
      }

      const startTime = getAdminText(ctx);

      if (!isValidTimeValue(startTime)) {
        await renderAdminPanel(ctx, 'РќСѓР¶РµРЅ С„РѕСЂРјР°С‚ РІСЂРµРјРµРЅРё HH:mm. РќР°РїСЂРёРјРµСЂ: 11:00', getAdminCancelKeyboard());
        return undefined;
      }

      state.startTime = startTime;

      await renderAdminPanel(ctx, 'РўРµРїРµСЂСЊ РѕС‚РїСЂР°РІСЊС‚Рµ РІСЂРµРјСЏ РѕРєРѕРЅС‡Р°РЅРёСЏ РІ С„РѕСЂРјР°С‚Рµ HH:mm. РќР°РїСЂРёРјРµСЂ: 12:00', getAdminCancelKeyboard());
      return ctx.wizard.next();
    },
    async (ctx) => {
      const state = getSceneState(ctx);

      if (await maybeLeaveAdminScene(ctx, state.admin)) {
        return undefined;
      }

      const endTime = getAdminText(ctx);

      if (!isValidTimeValue(endTime)) {
        await renderAdminPanel(ctx, 'РќСѓР¶РµРЅ С„РѕСЂРјР°С‚ РІСЂРµРјРµРЅРё HH:mm. РќР°РїСЂРёРјРµСЂ: 12:00', getAdminCancelKeyboard());
        return undefined;
      }

      if (toMinutes(endTime) <= toMinutes(state.startTime)) {
        await renderAdminPanel(ctx, 'Р’СЂРµРјСЏ РѕРєРѕРЅС‡Р°РЅРёСЏ РґРѕР»Р¶РЅРѕ Р±С‹С‚СЊ РїРѕР·Р¶Рµ РІСЂРµРјРµРЅРё РЅР°С‡Р°Р»Р°.', getAdminCancelKeyboard());
        return undefined;
      }

      const slot = await ctx.state.services.bookingService.createTimeSlot(
        state.boutique.id,
        {
          label: buildSlotLabel(state.startTime, endTime),
          startTime: state.startTime,
          endTime,
          sortOrder: buildSortOrder(state.startTime),
        },
        ctx.from.id,
      );

      await leaveAdminScene(
        ctx,
        state.admin,
        `РЎР»РѕС‚ СѓСЃРїРµС€РЅРѕ РґРѕР±Р°РІР»РµРЅ.\n\nР‘СѓС‚РёРє: ${state.boutique.name}\nРЎР»РѕС‚: ${formatSlotLabelForUser(slot.label)}`,
      );

      return undefined;
    },
    async (ctx) => {
      const state = getSceneState(ctx);

      if (await maybeLeaveAdminScene(ctx, state.admin)) {
        return undefined;
      }

      const slotId = extractCallbackValue(ctx, TIME_SLOT_SELECT_PREFIX);

      if (!slotId) {
        await answerAdminCallback(ctx, 'Р’С‹Р±РµСЂРёС‚Рµ СЃР»РѕС‚ РєРЅРѕРїРєРѕР№ РЅРёР¶Рµ.', true);
        return undefined;
      }

      const slot = state.slots.find((item) => item.id === slotId);

      if (!slot) {
        await answerAdminCallback(ctx, 'РЎР»РѕС‚ РЅРµ РЅР°Р№РґРµРЅ. РџРѕРїСЂРѕР±СѓР№С‚Рµ СЃРЅРѕРІР°.', true);
        return undefined;
      }

      state.selectedSlot = slot;

      await answerAdminCallback(ctx);
      await renderAdminPanel(
        ctx,
        `РџРѕРґС‚РІРµСЂРґРёС‚Рµ СѓРґР°Р»РµРЅРёРµ СЃР»РѕС‚Р°.\n\nР‘СѓС‚РёРє: ${state.boutique.name}\nРЎР»РѕС‚: ${formatSlotLabelForUser(slot.label)}`,
        getAdminConfirmKeyboard('РЈРґР°Р»РёС‚СЊ СЃР»РѕС‚'),
      );

      return ctx.wizard.next();
    },
    async (ctx) => {
      const state = getSceneState(ctx);

      if (await maybeLeaveAdminScene(ctx, state.admin)) {
        return undefined;
      }

      if (ctx.callbackQuery?.data !== ADMIN_CALLBACKS.SCENE_CONFIRM) {
        await answerAdminCallback(ctx, 'РџРѕРґС‚РІРµСЂРґРёС‚Рµ СѓРґР°Р»РµРЅРёРµ РєРЅРѕРїРєРѕР№ РЅРёР¶Рµ.', true);
        return undefined;
      }

      await answerAdminCallback(ctx);
      await ctx.state.services.bookingService.removeTimeSlot(state.selectedSlot.id, ctx.from.id);

      await leaveAdminScene(
        ctx,
        state.admin,
        `РЎР»РѕС‚ "${formatSlotLabelForUser(state.selectedSlot.label)}" РґРµР°РєС‚РёРІРёСЂРѕРІР°РЅ.`,
      );

      return undefined;
    },
  );
}

```

## src\bot\scenes\adminBoutiqueScene.js

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
    formatBoutiqueAddress(boutique) || 'РђРґСЂРµСЃ РЅРµ СѓРєР°Р·Р°РЅ',
  ];

  if (boutique.email) {
    lines.push(`Email: ${boutique.email}`);
  }

  if (boutique.ccEmails) {
    lines.push(`РљРѕРїРёСЏ: ${formatEmailList(boutique.ccEmails)}`);
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
        const boutiques = await ctx.state.services.bookingService.getVisibleBoutiques({
          includeTimeSlots: false,
        });

        if (boutiques.length === 0) {
          await leaveAdminScene(ctx, admin, 'РЎРµР№С‡Р°СЃ РЅРµС‚ Р°РєС‚РёРІРЅС‹С… Р±СѓС‚РёРєРѕРІ РґР»СЏ СѓРґР°Р»РµРЅРёСЏ.');
          return undefined;
        }

        state.boutiques = boutiques;

        await renderAdminPanel(ctx, 'Р’С‹Р±РµСЂРёС‚Рµ Р±СѓС‚РёРє, РєРѕС‚РѕСЂС‹Р№ РЅСѓР¶РЅРѕ СѓРґР°Р»РёС‚СЊ.', buildBoutiquesKeyboard(boutiques));
        return ctx.wizard.next();
      }

      await renderAdminPanel(ctx, 'РЈРєР°Р¶РёС‚Рµ РіРѕСЂРѕРґ Р±СѓС‚РёРєР° РѕРґРЅРёРј СЃРѕРѕР±С‰РµРЅРёРµРј.', getAdminCancelKeyboard());
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
          await answerAdminCallback(ctx, 'Р’С‹Р±РµСЂРёС‚Рµ Р±СѓС‚РёРє РєРЅРѕРїРєРѕР№ РЅРёР¶Рµ.', true);
          return undefined;
        }

        const boutique = state.boutiques.find((item) => item.id === boutiqueId);

        if (!boutique) {
          await answerAdminCallback(ctx, 'Р‘СѓС‚РёРє РЅРµ РЅР°Р№РґРµРЅ. РџРѕРїСЂРѕР±СѓР№С‚Рµ СЃРЅРѕРІР°.', true);
          return undefined;
        }

        state.boutique = boutique;

        await answerAdminCallback(ctx);
        await renderAdminPanel(
          ctx,
          `РџРѕРґС‚РІРµСЂРґРёС‚Рµ СѓРґР°Р»РµРЅРёРµ Р±СѓС‚РёРєР°.\n\n${buildBoutiqueSummary(boutique)}`,
          getAdminConfirmKeyboard('РЈРґР°Р»РёС‚СЊ Р±СѓС‚РёРє'),
        );
        ctx.wizard.selectStep(6);
        return undefined;
      }

      state.city = getAdminText(ctx);

      if (!state.city) {
        await renderAdminPanel(ctx, 'Р“РѕСЂРѕРґ РЅРµ РґРѕР»Р¶РµРЅ Р±С‹С‚СЊ РїСѓСЃС‚С‹Рј. РџРѕРїСЂРѕР±СѓР№С‚Рµ РµС‰Рµ СЂР°Р·.', getAdminCancelKeyboard());
        return undefined;
      }

      await renderAdminPanel(ctx, 'РўРµРїРµСЂСЊ СѓРєР°Р¶РёС‚Рµ РЅР°Р·РІР°РЅРёРµ Р±СѓС‚РёРєР°.', getAdminCancelKeyboard());
      return ctx.wizard.next();
    },
    async (ctx) => {
      const state = getSceneState(ctx);

      if (await maybeLeaveAdminScene(ctx, state.admin)) {
        return undefined;
      }

      state.name = getAdminText(ctx);

      if (!state.name) {
        await renderAdminPanel(ctx, 'РќР°Р·РІР°РЅРёРµ РЅРµ РґРѕР»Р¶РЅРѕ Р±С‹С‚СЊ РїСѓСЃС‚С‹Рј. РџРѕРїСЂРѕР±СѓР№С‚Рµ РµС‰Рµ СЂР°Р·.', getAdminCancelKeyboard());
        return undefined;
      }

      await renderAdminPanel(ctx, 'РЈРєР°Р¶РёС‚Рµ Р°РґСЂРµСЃ Р±СѓС‚РёРєР° РѕРґРЅРѕР№ СЃС‚СЂРѕРєРѕР№.', getAdminCancelKeyboard());
      return ctx.wizard.next();
    },
    async (ctx) => {
      const state = getSceneState(ctx);

      if (await maybeLeaveAdminScene(ctx, state.admin)) {
        return undefined;
      }

      state.addressLine1 = getAdminText(ctx);

      if (!state.addressLine1) {
        await renderAdminPanel(ctx, 'РђРґСЂРµСЃ РЅРµ РґРѕР»Р¶РµРЅ Р±С‹С‚СЊ РїСѓСЃС‚С‹Рј. РџРѕРїСЂРѕР±СѓР№С‚Рµ РµС‰Рµ СЂР°Р·.', getAdminCancelKeyboard());
        return undefined;
      }

      await renderAdminPanel(
        ctx,
        'РЈРєР°Р¶РёС‚Рµ email Р±СѓС‚РёРєР° РёР»Рё РѕС‚РїСЂР°РІСЊС‚Рµ "-" РµСЃР»Рё СѓРІРµРґРѕРјР»РµРЅРёСЏ РїРѕРєР° РЅРµ РЅСѓР¶РЅС‹.',
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
        state.email = normalizeOptionalEmail(getAdminText(ctx), 'Email Р±СѓС‚РёРєР°');
      } catch (error) {
        if (error instanceof ValidationError) {
          await renderAdminPanel(ctx, `${error.message}\nРџРѕРїСЂРѕР±СѓР№С‚Рµ РµС‰Рµ СЂР°Р·.`, getAdminCancelKeyboard());
          return undefined;
        }

        throw error;
      }

      await renderAdminPanel(
        ctx,
        'РЈРєР°Р¶РёС‚Рµ РґРѕРїРѕР»РЅРёС‚РµР»СЊРЅС‹Рµ email С‡РµСЂРµР· Р·Р°РїСЏС‚СѓСЋ РёР»Рё РѕС‚РїСЂР°РІСЊС‚Рµ "-" РµСЃР»Рё РЅРµ РЅСѓР¶РЅРѕ.',
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
          fieldName: 'Р”РѕРїРѕР»РЅРёС‚РµР»СЊРЅС‹Рµ email',
        });
      } catch (error) {
        if (error instanceof ValidationError) {
          await renderAdminPanel(ctx, `${error.message}\nРџРѕРїСЂРѕР±СѓР№С‚Рµ РµС‰Рµ СЂР°Р·.`, getAdminCancelKeyboard());
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
        `Р‘СѓС‚РёРє СѓСЃРїРµС€РЅРѕ РґРѕР±Р°РІР»РµРЅ.\n\n${buildBoutiqueSummary(boutique)}`,
      );

      return undefined;
    },
    async (ctx) => {
      const state = getSceneState(ctx);

      if (await maybeLeaveAdminScene(ctx, state.admin)) {
        return undefined;
      }

      if (ctx.callbackQuery?.data !== ADMIN_CALLBACKS.SCENE_CONFIRM) {
        await answerAdminCallback(ctx, 'РџРѕРґС‚РІРµСЂРґРёС‚Рµ СѓРґР°Р»РµРЅРёРµ РєРЅРѕРїРєРѕР№ РЅРёР¶Рµ.', true);
        return undefined;
      }

      await answerAdminCallback(ctx);
      await ctx.state.services.bookingService.removeBoutique(state.boutique.id, ctx.from.id);

      await leaveAdminScene(
        ctx,
        state.admin,
        `Р‘СѓС‚РёРє "${state.boutique.name}" РґРµР°РєС‚РёРІРёСЂРѕРІР°РЅ.`,
      );

      return undefined;
    },
  );
}

```

