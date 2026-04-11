# Demo Bookings Cleanup Round 2

## src/utils/testData.js

`$(System.Collections.Hashtable.Lang)
function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeUsername(value) {
  return normalizeText(value).replace(/^@/, '').toLowerCase();
}

const INTEGRATION_TEST_FULL_NAMES = new Set(['Integration Test']);
const INTEGRATION_TEST_TELEGRAM_IDS = new Set(['9586763375']);
const INTEGRATION_TEST_USERNAME_PREFIXES = Object.freeze(['itest']);
const DEMO_FULL_NAMES = new Set(['РРІР°РЅРѕРІ РРІР°РЅ РРІР°РЅРѕРІРёС‡']);
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
  const hasIntegrationMarker =
    isTestTelegramId(user.telegramId) ||
    INTEGRATION_TEST_USERNAME_PREFIXES.some((prefix) => normalizeUsername(user.username).startsWith(prefix)) ||
    INTEGRATION_TEST_USERNAME_PREFIXES.some((prefix) => normalizeUsername(registration?.telegramUsername).startsWith(prefix)) ||
    isIntegrationTestFullName(registration?.fullName);
  const hasDemoMarker =
    isExplicitDemoUsername(user.username) ||
    isExplicitDemoUsername(registration?.telegramUsername) ||
    (
      isKnownDemoFullName(registration?.fullName) &&
      (isKnownDemoUsername(user.username) || isKnownDemoUsername(registration?.telegramUsername))
    );

  return (
    hasIntegrationMarker ||
    hasDemoMarker
  );
}

export function isTestBookingUser(booking) {
  return isTestUserRecord(booking?.user);
}
```

## scripts/cleanupTestData.js

`$(System.Collections.Hashtable.Lang)
import { loadEnvFiles } from '../src/config/loadEnv.js';
import { isInternalBoutique } from '../src/utils/boutiques.js';
import {
  isDemoUsername,
  isIntegrationTestFullName,
  isKnownDemoFullName,
  isTestTelegramId,
  isTestUsername,
} from '../src/utils/testData.js';
import { normalizeTelegramId } from '../src/utils/validators.js';

loadEnvFiles();

let prisma;
let connectPrisma;
let disconnectPrisma;
let logger;

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseArgs(argv) {
  const options = {
    apply: false,
    dryRun: false,
    publicIds: new Set(),
    telegramIds: new Set(),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--apply') {
      options.apply = true;
      continue;
    }

    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }

    if (arg === '--telegram-id') {
      const nextValue = argv[index + 1];

      if (!nextValue) {
        throw new Error('Expected Telegram ID after --telegram-id');
      }

      options.telegramIds.add(normalizeTelegramId(nextValue));
      index += 1;
      continue;
    }

    if (arg === '--public-id') {
      const nextValue = argv[index + 1]?.trim();

      if (!nextValue) {
        throw new Error('Expected booking publicId after --public-id');
      }

      options.publicIds.add(nextValue);
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (options.apply && options.dryRun) {
    throw new Error('Use either --dry-run or --apply');
  }

  if (!options.apply) {
    options.dryRun = true;
  }

  return options;
}

function buildCandidateReasons(booking, options) {
  const reasons = [];
  const registration = booking.user?.registration;
  const rawUsername = booking.user?.username;
  const rawRegistrationUsername = registration?.telegramUsername;

  if (booking.boutique && isInternalBoutique(booking.boutique)) {
    reasons.push('internal_boutique');
  }

  if (isIntegrationTestFullName(registration?.fullName)) {
    reasons.push('integration_test_full_name');
  }

  if (isKnownDemoFullName(registration?.fullName)) {
    reasons.push('demo_full_name');
  }

  if (
    !isDemoUsername(rawUsername) &&
    !isDemoUsername(rawRegistrationUsername) &&
    (isTestUsername(rawUsername) || isTestUsername(rawRegistrationUsername))
  ) {
    reasons.push('itest_username');
  }

  if (isDemoUsername(rawUsername) || isDemoUsername(rawRegistrationUsername)) {
    reasons.push('demo_username');
  }

  if (isTestTelegramId(booking.user?.telegramId)) {
    reasons.push('test_telegram_id');
  }

  if (booking.user?.telegramId && options.telegramIds.has(booking.user.telegramId)) {
    reasons.push('explicit_telegram_id_match');
  }

  if (booking.publicId && options.publicIds.has(booking.publicId)) {
    reasons.push('explicit_public_id_match');
  }

  return reasons;
}

function isCleanupCandidate(booking, options) {
  return buildCandidateReasons(booking, options).length > 0;
}

function formatDateTime(value) {
  if (!value) {
    return '-';
  }

  return new Date(value).toISOString();
}

function formatBookingPreview(candidate) {
  const registration = candidate.user?.registration;
  const username = registration?.telegramUsername ?? (candidate.user?.username ? `@${candidate.user.username}` : '-');
  const fullName = registration?.fullName ?? '-';

  return [
    `- ${candidate.publicId || candidate.id}`,
    `  reasons: ${candidate.cleanupReasons.join(', ')}`,
    `  status: ${candidate.status}`,
    `  mode: ${candidate.visitMode}`,
    `  user: ${candidate.user?.telegramId ?? '-'} ${username}`,
    `  full_name: ${fullName}`,
    `  boutique: ${candidate.boutique?.code ?? '-'} / ${candidate.boutique?.name ?? '-'}`,
    `  created_at: ${formatDateTime(candidate.createdAt)}`,
    `  visit_date: ${formatDateTime(candidate.visitDate)}`,
    `  linked_timers: ${candidate._count?.timers ?? 0}`,
    `  linked_documents: ${candidate._count?.documents ?? 0}`,
  ].join('\n');
}

async function countRelatedRecords(bookingIds) {
  if (bookingIds.length === 0) {
    return {
      auditLogs: 0,
      documents: 0,
      timers: 0,
    };
  }

  const [auditLogs, timers, documents] = await Promise.all([
    prisma.auditLog.count({
      where: {
        entityType: 'Booking',
        entityId: {
          in: bookingIds,
        },
      },
    }),
    prisma.userItemTimer.count({
      where: {
        bookingId: {
          in: bookingIds,
        },
      },
    }),
    prisma.userPdf.count({
      where: {
        bookingId: {
          in: bookingIds,
        },
      },
    }),
  ]);

  return {
    auditLogs,
    documents,
    timers,
  };
}

function printSummary(candidates, relatedCounts, options) {
  const activeCount = candidates.filter((candidate) => ['CREATED', 'SUBMITTED'].includes(candidate.status)).length;
  const internalBoutiqueCount = candidates.filter((candidate) => candidate.cleanupReasons.includes('internal_boutique')).length;
  const knownTestUserCount = candidates.filter((candidate) => (
    candidate.cleanupReasons.includes('integration_test_full_name') ||
    candidate.cleanupReasons.includes('itest_username') ||
    candidate.cleanupReasons.includes('test_telegram_id') ||
    candidate.cleanupReasons.includes('demo_full_name') ||
    candidate.cleanupReasons.includes('demo_username')
  )).length;
  const explicitFilterCount = candidates.filter((candidate) => (
    candidate.cleanupReasons.includes('explicit_telegram_id_match') ||
    candidate.cleanupReasons.includes('explicit_public_id_match')
  )).length;

  console.log(`Mode: ${options.apply ? 'apply' : 'dry-run'}`);
  console.log(`Cleanup candidates: ${candidates.length}`);
  console.log(`Active candidates: ${activeCount}`);
  console.log(`Matched by internal boutique: ${internalBoutiqueCount}`);
  console.log(`Matched by known test/demo user markers: ${knownTestUserCount}`);
  console.log(`Matched by explicit CLI filters: ${explicitFilterCount}`);
  console.log(`Related audit logs: ${relatedCounts.auditLogs}`);
  console.log(`Related timers: ${relatedCounts.timers}`);
  console.log(`Related booking PDFs: ${relatedCounts.documents}`);

  if (candidates.length === 0) {
    console.log('No test data matched the cleanup criteria.');
    return;
  }

  console.log('');
  console.log('Candidates:');
  console.log(candidates.map(formatBookingPreview).join('\n\n'));
}

async function fetchCleanupCandidates(options) {
  const bookings = await prisma.booking.findMany({
    include: {
      _count: {
        select: {
          documents: true,
          timers: true,
        },
      },
      boutique: true,
      user: {
        include: {
          registration: true,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  return bookings
    .filter((booking) => isCleanupCandidate(booking, options))
    .map((booking) => ({
      ...booking,
      cleanupReasons: buildCandidateReasons(booking, options),
    }));
}

async function applyCleanup(candidates) {
  const bookingIds = candidates.map((candidate) => candidate.id);

  if (bookingIds.length === 0) {
    return {
      deletedAuditLogs: 0,
      deletedBookings: 0,
      deletedDocuments: 0,
      deletedTimers: 0,
    };
  }

  return prisma.$transaction(async (tx) => {
    const deletedAuditLogsResult = await tx.auditLog.deleteMany({
      where: {
        entityType: 'Booking',
        entityId: {
          in: bookingIds,
        },
      },
    });

    const deletedTimersResult = await tx.userItemTimer.deleteMany({
      where: {
        bookingId: {
          in: bookingIds,
        },
      },
    });

    const deletedDocumentsResult = await tx.userPdf.deleteMany({
      where: {
        bookingId: {
          in: bookingIds,
        },
      },
    });

    const deletedBookingsResult = await tx.booking.deleteMany({
      where: {
        id: {
          in: bookingIds,
        },
      },
    });

    return {
      deletedAuditLogs: deletedAuditLogsResult.count,
      deletedBookings: deletedBookingsResult.count,
      deletedDocuments: deletedDocumentsResult.count,
      deletedTimers: deletedTimersResult.count,
    };
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const dbModule = await import('../src/db/prisma.js');
  const loggerModule = await import('../src/utils/logger.js');

  ({ prisma, connectPrisma, disconnectPrisma } = dbModule);
  ({ logger } = loggerModule);

  await connectPrisma();

  const candidates = await fetchCleanupCandidates(options);
  const relatedCounts = await countRelatedRecords(candidates.map((candidate) => candidate.id));
  printSummary(candidates, relatedCounts, options);

  if (options.dryRun || candidates.length === 0) {
    return;
  }

  const result = await applyCleanup(candidates);

  console.log('');
  console.log('Cleanup completed.');
  console.log(`Deleted bookings: ${result.deletedBookings}`);
  console.log(`Deleted audit logs: ${result.deletedAuditLogs}`);
  console.log(`Deleted timers: ${result.deletedTimers}`);
  console.log(`Deleted booking PDFs: ${result.deletedDocuments}`);
  console.log('Slots are freed automatically because deleted bookings no longer participate in occupancy checks.');
  console.log('Users, registrations and boutiques are left intact.');
}

main().catch(async (error) => {
  if (logger) {
    logger.error({ err: error }, 'Failed to cleanup test data');
  } else {
    console.error('Failed to cleanup test data');
    console.error(error);
  }

  process.exitCode = 1;
}).finally(async () => {
  try {
    await disconnectPrisma();
  } catch {
    // Ignore disconnect errors on script shutdown.
  }
});
```

## src/services/bookingService.js

`$(System.Collections.Hashtable.Lang)
import { BookingRequestType, BookingStatus, Prisma, TimerStatus, VisitMode } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

import { ADMIN_PERMISSIONS, AUDIT_ACTIONS } from '../utils/constants.js';
import { dayjs, formatDate, getNextAvailableBookingDates, now, startOfDate } from '../utils/date.js';
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

  if (isTestBookingUser(booking)) {
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

  if (isTestBookingUser(booking)) {
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

async function findVisibleAdminBookings(prismaClient, {
  limit = 50,
  orderBy = { createdAt: 'desc' },
  where = {},
} = {}) {
  const bookings = await prismaClient.booking.findMany({
    where: buildAdminVisibleBookingsWhere(where),
    include: ADMIN_BOOKING_INCLUDE,
    orderBy,
  });

  return filterVisibleAdminBookings(bookings).slice(0, limit);
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

  async function getVisibleAdminBookings(limit = 10) {
    return findVisibleAdminBookings(prisma, {
      limit,
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async function getVisibleAdminBookingsCreatedOnDate(date, limit = 50) {
    const start = dayjs(startOfDate(date));
    const end = start.add(1, 'day').toDate();

    return findVisibleAdminBookings(prisma, {
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
  }

  async function getAdminBookingsForToday(limit = 50) {
    return getVisibleAdminBookingsCreatedOnDate(now().toDate(), limit);
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
    getAdminBookingsForToday,
    getAvailableSlotsByDate,
    getAvailableVisitDates,
    getBoutiques,
    getVisibleAdminBookings,
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

