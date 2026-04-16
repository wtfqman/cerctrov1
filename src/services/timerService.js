import { BookingRequestType, BookingStatus, Prisma, TimerStatus, VisitMode } from '@prisma/client';

import { BOT_TEXTS } from '../utils/constants.js';
import { addDays, dayjs, formatDate } from '../utils/date.js';
import { formatAdminUserIdentityLines } from '../utils/formatters.js';
import { parseRegistrationSizes } from '../utils/registration.js';

const OPEN_TIMER_STATUSES = [TimerStatus.ACTIVE, TimerStatus.OVERDUE];
const ACTIVE_BOOKING_STATUSES = [BookingStatus.CREATED, BookingStatus.SUBMITTED];
const FOLLOW_UP_BOOKING_REQUEST_TYPES = [BookingRequestType.RETURN, BookingRequestType.RETURN_PICKUP];

function isUniqueConstraintError(error, fieldName) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002' &&
    Array.isArray(error.meta?.target) &&
    error.meta.target.includes(fieldName)
  );
}

function getFollowUpBookingPeriodStart(timer) {
  if (!timer?.booking?.createdAt) {
    return timer.takenAt;
  }

  const bookingCreatedAt = new Date(timer.booking.createdAt);
  const takenAt = new Date(timer.takenAt);

  return bookingCreatedAt < takenAt ? bookingCreatedAt : takenAt;
}

function hasRelevantReturnRequestType(booking) {
  return Boolean(booking?.requestType && FOLLOW_UP_BOOKING_REQUEST_TYPES.includes(booking.requestType));
}

function hasActiveBookingStatus(booking) {
  return Boolean(booking?.status && ACTIVE_BOOKING_STATUSES.includes(booking.status));
}

function resolveReminderVisitMode(timer) {
  const visitMode = timer?.booking?.visitMode;

  if (visitMode === VisitMode.BOUTIQUE || visitMode === VisitMode.DELIVERY) {
    return visitMode;
  }

  return null;
}

function hasMenRegistrationSizes(registration) {
  const sizes = typeof registration?.sizes === 'string' ? registration.sizes.trim() : '';

  if (!sizes) {
    return false;
  }

  return parseRegistrationSizes(sizes).hasStructuredData;
}

function isMenDeliveryBooking(booking) {
  return booking?.visitMode === VisitMode.DELIVERY && hasMenRegistrationSizes(booking?.user?.registration);
}

function getDefaultTimerPolicy(envConfig) {
  return {
    adminAlertDays: envConfig.RETURN_ADMIN_ALERT_DAYS,
    reminderDays: envConfig.RETURN_REMINDER_DAYS,
  };
}

function getTimerPolicyForBooking(booking, envConfig) {
  const defaultPolicy = getDefaultTimerPolicy(envConfig);

  if (isMenDeliveryBooking(booking)) {
    return {
      adminAlertDays: envConfig.MEN_DELIVERY_ADMIN_ALERT_DAY ?? defaultPolicy.adminAlertDays,
      reminderDays: envConfig.MEN_DELIVERY_REMINDER_DAY ?? defaultPolicy.reminderDays,
    };
  }

  return defaultPolicy;
}

export function createTimerService({ prisma, logger, env, googleSheets }) {
  const serviceLogger = logger.child({ service: 'timer' });

  async function getLatestOpenTimerForUser(userId) {
    return prisma.userItemTimer.findFirst({
      where: {
        userId,
        status: {
          in: OPEN_TIMER_STATUSES,
        },
      },
      include: {
        booking: {
          include: {
            boutique: true,
            timeSlot: true,
          },
        },
        user: {
          include: {
            registration: true,
          },
        },
      },
      orderBy: {
        takenAt: 'desc',
      },
    });
  }

  async function getCurrentTimerStatus(userId) {
    const timer = await getLatestOpenTimerForUser(userId);

    if (!timer) {
      return {
        daysPassed: 0,
        hasActiveTimer: false,
        timer: null,
      };
    }

    const daysPassed = Math.max(dayjs().diff(dayjs(timer.takenAt), 'day'), 0);

    return {
      daysPassed,
      hasActiveTimer: true,
      timer,
    };
  }

  async function listActiveTimersForUser(userId) {
    return prisma.userItemTimer.findMany({
      where: {
        userId,
        status: {
          in: OPEN_TIMER_STATUSES,
        },
      },
      include: {
        booking: {
          include: {
            boutique: true,
            timeSlot: true,
          },
        },
        user: {
          include: {
            registration: true,
          },
        },
      },
      orderBy: {
        takenAt: 'desc',
      },
    });
  }

  async function listOverdueTimers(limit = 20) {
    const now = new Date();
    const thresholdDate = dayjs().subtract(env.RETURN_ADMIN_ALERT_DAYS, 'day').toDate();

    return prisma.userItemTimer.findMany({
      where: {
        status: {
          in: OPEN_TIMER_STATUSES,
        },
        returnedAt: null,
        OR: [
          {
            adminAlertAt: {
              lte: now,
            },
          },
          {
            adminAlertAt: null,
            takenAt: {
              lte: thresholdDate,
            },
          },
        ],
      },
      include: {
        booking: {
          include: {
            boutique: true,
            timeSlot: true,
          },
        },
        user: {
          include: {
            registration: true,
          },
        },
      },
      orderBy: {
        takenAt: 'asc',
      },
      take: limit,
    });
  }

  async function startUserItemTimer({ userId, bookingId = null, note = null, timerPolicy = null }) {
    const takenAt = new Date();
    const resolvedTimerPolicy = timerPolicy ?? getDefaultTimerPolicy(env);

    try {
      const timer = await prisma.$transaction(async (tx) => {
        const existingTimer = await tx.userItemTimer.findFirst({
          where: {
            userId,
            status: {
              in: OPEN_TIMER_STATUSES,
            },
          },
        });

        if (existingTimer) {
          return null;
        }

        return tx.userItemTimer.create({
          data: {
            userId,
            bookingId,
            activeTimerKey: userId,
            note,
            status: TimerStatus.ACTIVE,
            takenAt,
            dueAt: addDays(takenAt, resolvedTimerPolicy.adminAlertDays),
            reminderAt: addDays(takenAt, resolvedTimerPolicy.reminderDays),
            adminAlertAt: addDays(takenAt, resolvedTimerPolicy.adminAlertDays),
          },
          include: {
            booking: {
              include: {
                boutique: true,
                timeSlot: true,
              },
            },
            user: {
              include: {
                registration: true,
              },
            },
          },
        });
      });

      if (!timer) {
        return null;
      }

      await googleSheets.logTimerEvent({
        comment: 'Таймер возврата создан',
        event: 'timer_started',
        timer,
        user: timer.user,
      });

      return timer;
    } catch (error) {
      if (isUniqueConstraintError(error, 'activeTimerKey')) {
        return null;
      }

      throw error;
    }
  }

  async function startTimerForUserLatestBooking(userId) {
    const activeTimer = await getLatestOpenTimerForUser(userId);

    if (activeTimer) {
      return {
        alreadyActive: true,
        ...(await getCurrentTimerStatus(userId)),
      };
    }

    const latestBooking = await prisma.booking.findFirst({
      where: {
        userId,
        status: {
          in: ACTIVE_BOOKING_STATUSES,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        user: {
          include: {
            registration: true,
          },
        },
      },
    });

    if (!latestBooking) {
      return {
        alreadyActive: false,
        daysPassed: 0,
        hasActiveTimer: false,
        requiresBooking: true,
        timer: null,
      };
    }

    const timer = await startUserItemTimer({
      userId,
      bookingId: latestBooking?.id ?? null,
      timerPolicy: getTimerPolicyForBooking(latestBooking, env),
    });

    if (!timer) {
      return {
        alreadyActive: true,
        ...(await getCurrentTimerStatus(userId)),
      };
    }

    return {
      alreadyActive: false,
      daysPassed: 0,
      hasActiveTimer: true,
      timer,
    };
  }

  async function completeUserItemTimer(timerId) {
    const timer = await prisma.userItemTimer.update({
      where: { id: timerId },
      data: {
        activeTimerKey: null,
        returnedAt: new Date(),
        status: TimerStatus.RETURNED,
      },
      include: {
        booking: {
          include: {
            boutique: true,
            timeSlot: true,
          },
        },
        user: {
          include: {
            registration: true,
          },
        },
      },
    });

    await googleSheets.logTimerEvent({
      comment: 'Пользователь отметил возврат образов',
      event: 'timer_returned',
      timer,
      user: timer.user,
    });

    return timer;
  }

  async function completeLatestActiveTimerForUser(userId) {
    const activeTimer = await getLatestOpenTimerForUser(userId);

    if (!activeTimer) {
      return null;
    }

    return completeUserItemTimer(activeTimer.id);
  }

  async function findActiveFollowUpBookingForTimer(timer) {
    if (hasActiveBookingStatus(timer.booking) && hasRelevantReturnRequestType(timer.booking)) {
      return {
        createdAt: timer.booking.createdAt,
        id: timer.booking.id,
        publicId: timer.booking.publicId,
        requestType: timer.booking.requestType,
        submittedAt: timer.booking.submittedAt,
        visitMode: timer.booking.visitMode,
      };
    }

    const periodStart = getFollowUpBookingPeriodStart(timer);

    return prisma.booking.findFirst({
      where: {
        userId: timer.userId,
        status: {
          in: ACTIVE_BOOKING_STATUSES,
        },
        requestType: {
          in: FOLLOW_UP_BOOKING_REQUEST_TYPES,
        },
        ...(timer.bookingId ? { id: { not: timer.bookingId } } : {}),
        OR: [
          {
            createdAt: {
              gte: periodStart,
            },
          },
          {
            submittedAt: {
              gte: periodStart,
            },
          },
        ],
      },
      orderBy: [
        {
          submittedAt: 'desc',
        },
        {
          createdAt: 'desc',
        },
      ],
      select: {
        createdAt: true,
        id: true,
        publicId: true,
        requestType: true,
        submittedAt: true,
        visitMode: true,
      },
    });
  }

  async function processOverdueTimers({ notifyUser, notifyAdmin, getAdminRecipient }) {
    const now = new Date();

    const reminderTimers = await prisma.userItemTimer.findMany({
      where: {
        status: {
          in: OPEN_TIMER_STATUSES,
        },
        returnedAt: null,
        reminderAt: {
          lte: now,
        },
        reminderSentAt: null,
      },
      include: {
        user: {
          include: {
            registration: true,
          },
        },
        booking: {
          include: {
            boutique: true,
            timeSlot: true,
          },
        },
      },
    });

    let userRemindersSent = 0;

    for (const timer of reminderTimers) {
      try {
        const followUpBooking = await findActiveFollowUpBookingForTimer(timer);

        if (followUpBooking) {
          serviceLogger.debug(
            {
              bookingId: followUpBooking.id,
              requestType: followUpBooking.requestType,
              timerId: timer.id,
              visitMode: followUpBooking.visitMode,
            },
            'Skipping 5-day reminder because active follow-up booking exists',
          );
          continue;
        }

        if (notifyUser) {
          await notifyUser({
            message: buildUserReminderMessageForTimer(timer),
            telegramId: timer.user.telegramId,
            timer,
          });
        }

        const reminderSentAt = new Date();

        await prisma.userItemTimer.update({
          where: { id: timer.id },
          data: {
            reminderSentAt,
          },
        });

        await googleSheets.logTimerEvent({
          comment: 'Отправлено 5-дневное напоминание пользователю',
          event: 'reminder_5d_sent',
          timer: {
            ...timer,
            reminderSentAt,
          },
          user: timer.user,
        });

        userRemindersSent += 1;
      } catch (error) {
        serviceLogger.error({ err: error, timerId: timer.id }, 'Failed to send user reminder');
      }
    }

    const adminAlertTimers = await prisma.userItemTimer.findMany({
      where: {
        status: {
          in: OPEN_TIMER_STATUSES,
        },
        returnedAt: null,
        adminAlertAt: {
          lte: now,
        },
        adminAlertSentAt: null,
      },
      include: {
        user: {
          include: {
            registration: true,
          },
        },
        booking: {
          include: {
            boutique: true,
            timeSlot: true,
          },
        },
      },
    });

    let adminAlertsSent = 0;
    const adminRecipient = adminAlertTimers.length > 0 ? await getAdminRecipient?.() : null;

    if (adminAlertTimers.length > 0 && !adminRecipient) {
      serviceLogger.warn('No full admin recipient configured for overdue timer alerts');
    }

    for (const timer of adminAlertTimers) {
      try {
        if (notifyAdmin && adminRecipient?.user?.telegramId) {
          const adminTelegramId = adminRecipient.notificationChatId ?? adminRecipient.user.telegramId;

          await notifyAdmin({
            admin: adminRecipient,
            message: buildAdminAlertMessage(timer),
            telegramId: adminTelegramId,
            timer,
          });

          const overdue8dSentAt = new Date();

          await prisma.userItemTimer.update({
            where: { id: timer.id },
            data: {
              adminAlertSentAt: overdue8dSentAt,
              status: TimerStatus.OVERDUE,
            },
          });

          await googleSheets.logTimerEvent({
            adminId: adminTelegramId,
            comment: 'Отправлено 8-дневное уведомление полному админу',
            event: 'overdue_8d_sent',
            timer: {
              ...timer,
              adminAlertSentAt: overdue8dSentAt,
              status: TimerStatus.OVERDUE,
            },
            user: timer.user,
          });

          adminAlertsSent += 1;
        }
      } catch (error) {
        serviceLogger.error({ err: error, timerId: timer.id }, 'Failed to send admin overdue alert');
      }
    }

    return {
      adminAlertsSent,
      userRemindersSent,
    };
  }

  function buildUserReminderMessage() {
    return BOT_TEXTS.RETURN_REMINDER_5D;
  }

  function buildUserReminderMessageForTimer(timer) {
    const visitMode = resolveReminderVisitMode(timer);

    if (visitMode === VisitMode.BOUTIQUE) {
      return BOT_TEXTS.RETURN_REMINDER_5D_BOUTIQUE;
    }

    if (visitMode === VisitMode.DELIVERY) {
      return BOT_TEXTS.RETURN_REMINDER_5D_DELIVERY;
    }

    return buildUserReminderMessage();
  }

  function buildAdminAlertMessage(timer) {
    return [
      'Просрочен возврат образов.',
      ...formatAdminUserIdentityLines(timer?.user, { label: 'Креатор' }),
      `Дата старта: ${formatDate(timer.takenAt, 'DD.MM.YYYY HH:mm')}`,
    ].join('\n');
  }

  return {
    completeLatestActiveTimerForUser,
    completeUserItemTimer,
    getCurrentTimerStatus,
    getLatestActiveTimerForUser: getLatestOpenTimerForUser,
    listActiveTimersForUser,
    listOverdueTimers,
    processOverdueTimers,
    startTimerForUserLatestBooking,
    startUserItemTimer,
  };
}
