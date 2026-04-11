const BOOKING_DAILY_SUMMARY_INTERVAL_MS = 5 * 60 * 1000;

export async function runBookingDailySummaryOnce({ services, bot, logger }) {
  const jobLogger = logger.child({ job: 'bookingDailySummary' });

  const result = await services.bookingDailySummaryService.processDueDailySummary({
    sendMessage: async ({ telegramId, message }) => {
      await bot.telegram.sendMessage(String(telegramId), message);
    },
  });

  const logMethod = result?.sent || result?.empty ? 'info' : 'debug';
  jobLogger[logMethod](result, 'Booking daily summary check completed');

  return result;
}

export function startBookingDailySummaryJob({ services, bot, logger }) {
  const jobLogger = logger.child({ job: 'bookingDailySummary' });
  const intervalMs = BOOKING_DAILY_SUMMARY_INTERVAL_MS;
  let isRunning = false;

  async function runSafely() {
    if (isRunning) {
      jobLogger.warn('Skipping booking daily summary because previous run is still in progress');
      return;
    }

    isRunning = true;

    try {
      await runBookingDailySummaryOnce({
        bot,
        logger: jobLogger,
        services,
      });
    } catch (error) {
      jobLogger.error({ err: error }, 'Booking daily summary failed');
    } finally {
      isRunning = false;
    }
  }

  void runSafely();

  const intervalId = setInterval(() => {
    void runSafely();
  }, intervalMs);

  intervalId.unref?.();

  jobLogger.info(
    {
      hour: services.bookingDailySummaryService.DAILY_SUMMARY_HOUR,
      intervalMs,
      minute: services.bookingDailySummaryService.DAILY_SUMMARY_MINUTE,
    },
    'Booking daily summary job scheduled',
  );

  return () => clearInterval(intervalId);
}
