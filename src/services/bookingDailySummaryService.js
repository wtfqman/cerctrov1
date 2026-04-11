import { AuditActorType } from '@prisma/client';

import { env } from '../config/env.js';
import { AUDIT_ACTIONS } from '../utils/constants.js';
import { dayjs, formatDate } from '../utils/date.js';
import { formatAdminDailyBookingSummary } from '../utils/formatters.js';

const DAILY_SUMMARY_HOUR = 10;
const DAILY_SUMMARY_MINUTE = 0;
const DAILY_SUMMARY_ENTITY_TYPE = 'BookingDailySummary';
const DAILY_SUMMARY_PROCESSED_ACTIONS = Object.freeze([
  AUDIT_ACTIONS.BOOKING_DAILY_SUMMARY_SENT,
  AUDIT_ACTIONS.BOOKING_DAILY_SUMMARY_EMPTY,
]);

function normalizeSummaryMoment(value) {
  return dayjs(value).tz(env.DEFAULT_TIMEZONE);
}

function getScheduledSummaryBoundary(value = new Date()) {
  return normalizeSummaryMoment(value)
    .hour(DAILY_SUMMARY_HOUR)
    .minute(DAILY_SUMMARY_MINUTE)
    .second(0)
    .millisecond(0);
}

function parseAuditMetadata(metadata) {
  if (typeof metadata !== 'string' || metadata.trim() === '') {
    return {};
  }

  try {
    const parsed = JSON.parse(metadata);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function extractWindowEndMoment(auditLog) {
  const metadata = parseAuditMetadata(auditLog?.metadata);

  if (typeof metadata.windowEnd !== 'string' || metadata.windowEnd.trim() === '') {
    return null;
  }

  const parsed = normalizeSummaryMoment(metadata.windowEnd);
  return parsed.isValid() ? parsed : null;
}

function buildSummaryPeriodLabel(windowStart, windowEnd) {
  return `Период: ${formatDate(windowStart.toDate(), 'DD.MM.YYYY HH:mm')} - ${formatDate(windowEnd.toDate(), 'DD.MM.YYYY HH:mm')}`;
}

export function createBookingDailySummaryService({ adminService, bookingService, logger, prisma }) {
  const serviceLogger = logger.child({ service: 'bookingDailySummary' });

  async function getLatestProcessedSummaryAuditLog() {
    return prisma.auditLog.findFirst({
      where: {
        actorType: AuditActorType.SYSTEM,
        action: {
          in: DAILY_SUMMARY_PROCESSED_ACTIONS,
        },
        entityType: DAILY_SUMMARY_ENTITY_TYPE,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async function createProcessedSummaryAuditLog({
    action,
    bookings,
    recipients,
    windowEnd,
    windowStart,
  }) {
    const bookingIds = Array.isArray(bookings) ? bookings.map((booking) => booking.id) : [];
    const bookingCount = bookingIds.length;
    const message =
      action === AUDIT_ACTIONS.BOOKING_DAILY_SUMMARY_EMPTY
        ? 'Ежедневная сводка по новым заявкам обработана: новых заявок нет.'
        : `Ежедневная сводка по новым заявкам отправлена. Заявок: ${bookingCount}.`;

    return prisma.auditLog.create({
      data: {
        action,
        actorType: AuditActorType.SYSTEM,
        entityId: windowEnd.toISOString(),
        entityType: DAILY_SUMMARY_ENTITY_TYPE,
        message,
        metadata: JSON.stringify({
          bookingCount,
          bookingIds,
          recipients,
          scheduledAt: windowEnd.toISOString(),
          timezone: env.DEFAULT_TIMEZONE,
          windowEnd: windowEnd.toISOString(),
          windowStart: windowStart.toISOString(),
        }),
      },
    });
  }

  async function processDueDailySummary({ currentTime = new Date(), sendMessage } = {}) {
    const nowMoment = normalizeSummaryMoment(currentTime);
    const scheduledBoundary = getScheduledSummaryBoundary(nowMoment);

    if (nowMoment.isBefore(scheduledBoundary)) {
      return {
        due: false,
        reason: 'before_schedule_time',
        scheduledFor: scheduledBoundary.toISOString(),
        skipped: true,
      };
    }

    const latestProcessedSummary = await getLatestProcessedSummaryAuditLog();
    const latestWindowEnd = extractWindowEndMoment(latestProcessedSummary);

    if (latestWindowEnd && !latestWindowEnd.isBefore(scheduledBoundary)) {
      return {
        due: false,
        lastProcessedAt: latestWindowEnd.toISOString(),
        reason: 'already_processed_for_boundary',
        scheduledFor: scheduledBoundary.toISOString(),
        skipped: true,
      };
    }

    const windowStart = latestWindowEnd ?? scheduledBoundary.subtract(1, 'day');
    const windowEnd = scheduledBoundary;
    const recipients = await adminService.getBookingNotificationRecipientTelegramIds();

    if (recipients.length === 0) {
      serviceLogger.warn(
        {
          scheduledFor: windowEnd.toISOString(),
          windowStart: windowStart.toISOString(),
        },
        'No booking summary recipients configured',
      );

      return {
        due: true,
        reason: 'no_recipients_configured',
        scheduledFor: windowEnd.toISOString(),
        skipped: true,
        windowEnd: windowEnd.toISOString(),
        windowStart: windowStart.toISOString(),
      };
    }

    const bookings = await bookingService.listVisibleAdminBookingsCreatedBetween(
      windowStart.toDate(),
      windowEnd.toDate(),
    );

    if (!Array.isArray(bookings) || bookings.length === 0) {
      await createProcessedSummaryAuditLog({
        action: AUDIT_ACTIONS.BOOKING_DAILY_SUMMARY_EMPTY,
        bookings: [],
        recipients,
        windowEnd: windowEnd.toDate(),
        windowStart: windowStart.toDate(),
      });

      serviceLogger.info(
        {
          recipients,
          scheduledFor: windowEnd.toISOString(),
          windowStart: windowStart.toISOString(),
        },
        'Daily booking summary skipped because there are no new bookings',
      );

      return {
        due: true,
        empty: true,
        recipients,
        scheduledFor: windowEnd.toISOString(),
        sent: false,
        skipped: true,
        windowEnd: windowEnd.toISOString(),
        windowStart: windowStart.toISOString(),
      };
    }

    const message = formatAdminDailyBookingSummary(bookings, {
      periodLabel: buildSummaryPeriodLabel(windowStart, windowEnd),
    });

    for (const telegramId of recipients) {
      await sendMessage({
        message,
        telegramId,
      });
    }

    await createProcessedSummaryAuditLog({
      action: AUDIT_ACTIONS.BOOKING_DAILY_SUMMARY_SENT,
      bookings,
      recipients,
      windowEnd: windowEnd.toDate(),
      windowStart: windowStart.toDate(),
    });

    serviceLogger.info(
      {
        bookingCount: bookings.length,
        recipients,
        scheduledFor: windowEnd.toISOString(),
        windowStart: windowStart.toISOString(),
      },
      'Daily booking summary sent',
    );

    return {
      bookingCount: bookings.length,
      due: true,
      empty: false,
      recipients,
      scheduledFor: windowEnd.toISOString(),
      sent: true,
      skipped: false,
      windowEnd: windowEnd.toISOString(),
      windowStart: windowStart.toISOString(),
    };
  }

  return {
    DAILY_SUMMARY_HOUR,
    DAILY_SUMMARY_MINUTE,
    processDueDailySummary,
  };
}
