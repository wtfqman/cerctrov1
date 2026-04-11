import { createAdminService } from './adminService.js';
import { createAdminNotificationService } from './adminNotificationService.js';
import { createBookingDailySummaryService } from './bookingDailySummaryService.js';
import { createBookingService } from './bookingService.js';
import { createEmailService } from './email.js';
import { createGoogleSheetsService } from './googleSheets.js';
import { createPdfStorageService } from './pdfStorage.js';
import { createRegistrationService } from './registrationService.js';
import { createTimerService } from './timerService.js';
import { createUserPdfService } from './userPdfService.js';

export function createServices({ prisma, logger, env }) {
  const emailService = createEmailService({ env, logger });
  const googleSheets = createGoogleSheetsService({ env, logger });
  const pdfStorage = createPdfStorageService({ logger, prisma });
  const userPdfService = createUserPdfService({ logger, prisma });
  const adminService = createAdminService({
    env,
    googleSheets,
    logger,
    prisma,
  });
  const adminNotificationService = createAdminNotificationService({
    adminService,
    env,
    logger,
    userPdfService,
  });
  const registrationService = createRegistrationService({
    googleSheets,
    logger,
    pdfStorage,
    prisma,
  });
  const bookingService = createBookingService({
    adminService,
    adminNotificationService,
    emailService,
    env,
    googleSheets,
    logger,
    prisma,
  });
  const timerService = createTimerService({
    env,
    googleSheets,
    logger,
    prisma,
  });
  const bookingDailySummaryService = createBookingDailySummaryService({
    adminService,
    bookingService,
    logger,
    prisma,
  });

  return {
    adminService,
    adminNotificationService,
    bookingDailySummaryService,
    bookingService,
    emailService,
    googleSheets,
    pdfStorage,
    registrationService,
    timerService,
    userPdfService,
  };
}
