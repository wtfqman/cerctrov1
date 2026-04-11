import { loadEnvFiles } from '../src/config/loadEnv.js';

loadEnvFiles();

let prisma;
let connectPrisma;
let disconnectPrisma;
let logger;

function parseArgs(argv) {
  const options = {
    apply: false,
    dryRun: false,
  };

  for (const arg of argv) {
    if (arg === '--apply') {
      options.apply = true;
      continue;
    }

    if (arg === '--dry-run') {
      options.dryRun = true;
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

function formatDateTime(value) {
  if (!value) {
    return '-';
  }

  return new Date(value).toISOString();
}

function formatPreviewRow(booking, index) {
  const fullName = booking.user?.registration?.fullName ?? '-';
  const username = booking.user?.registration?.telegramUsername ?? (booking.user?.username ? `@${booking.user.username}` : '-');
  const location = booking.visitMode === 'BOUTIQUE'
    ? booking.boutique?.name ?? booking.boutiqueAddress ?? '-'
    : booking.deliveryAddress ?? '-';
  const visitMoment = booking.visitDate
    ? `${formatDateTime(booking.visitDate)}${booking.slotLabel ? ` | ${booking.slotLabel}` : ''}`
    : '-';

  return [
    `${index + 1}. ${booking.publicId || booking.id}`,
    `   user: ${fullName} | ${username} | ${booking.user?.telegramId ?? '-'}`,
    `   status: ${booking.status}`,
    `   mode: ${booking.visitMode}`,
    `   location: ${location}`,
    `   visit: ${visitMoment}`,
    `   created_at: ${formatDateTime(booking.createdAt)}`,
  ].join('\n');
}

async function collectSummary() {
  const [bookingCount, bookingAuditLogCount, linkedTimerCount, linkedPdfCount] = await Promise.all([
    prisma.booking.count(),
    prisma.auditLog.count({
      where: {
        entityType: 'Booking',
      },
    }),
    prisma.userItemTimer.count({
      where: {
        bookingId: {
          not: null,
        },
      },
    }),
    prisma.userPdf.count({
      where: {
        bookingId: {
          not: null,
        },
      },
    }),
  ]);

  return {
    bookingAuditLogCount,
    bookingCount,
    linkedPdfCount,
    linkedTimerCount,
  };
}

async function fetchPreview(limit = 10) {
  return prisma.booking.findMany({
    take: limit,
    include: {
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
}

function printSummary(summary, previewRows, options) {
  console.log(`Mode: ${options.apply ? 'apply' : 'dry-run'}`);
  console.log(`Bookings to delete: ${summary.bookingCount}`);
  console.log(`Booking audit logs to delete: ${summary.bookingAuditLogCount}`);
  console.log(`Linked timers to preserve: ${summary.linkedTimerCount}`);
  console.log(`Linked PDFs to preserve: ${summary.linkedPdfCount}`);

  if (summary.bookingCount === 0) {
    console.log('No bookings found. Nothing to clear.');
    return;
  }

  if (summary.linkedTimerCount > 0 || summary.linkedPdfCount > 0) {
    console.log('');
    console.log('Note: timers and PDFs are not deleted by this script.');
    console.log('Their booking links are expected to be released by the database relation when bookings are removed.');
  }

  console.log('');
  console.log(`Preview (latest ${previewRows.length}):`);
  console.log(previewRows.map(formatPreviewRow).join('\n\n'));
}

async function clearAllBookings() {
  return prisma.$transaction(async (tx) => {
    const deletedAuditLogsResult = await tx.auditLog.deleteMany({
      where: {
        entityType: 'Booking',
      },
    });

    const deletedBookingsResult = await tx.booking.deleteMany({});

    return {
      deletedAuditLogs: deletedAuditLogsResult.count,
      deletedBookings: deletedBookingsResult.count,
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

  const [summary, previewRows] = await Promise.all([
    collectSummary(),
    fetchPreview(),
  ]);

  printSummary(summary, previewRows, options);

  if (options.dryRun || summary.bookingCount === 0) {
    return;
  }

  const result = await clearAllBookings();

  console.log('');
  console.log('Booking cleanup completed.');
  console.log(`Deleted bookings: ${result.deletedBookings}`);
  console.log(`Deleted booking audit logs: ${result.deletedAuditLogs}`);
  console.log('Users, registrations, admins, boutiques, time slots, timers and PDF files were not deleted.');
  console.log('Booking-linked timers and PDFs were not deleted by the script.');
  console.log('All slots are now free because there are no booking records left in occupancy checks.');
}

main().catch(async (error) => {
  if (logger) {
    logger.error({ err: error }, 'Failed to clear all bookings');
  } else {
    console.error('Failed to clear all bookings');
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
