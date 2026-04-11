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
