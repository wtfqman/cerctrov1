import { Telegram } from 'telegraf';

import {
  BOOKING_REQUEST_TYPE_LABELS,
  VISIT_MODE_LABELS,
} from '../utils/constants.js';
import { formatDate } from '../utils/date.js';
import { formatAdminUserIdentityLines, formatUserDisplayName } from '../utils/formatters.js';
import { formatSlotLabelForUser } from '../utils/slots.js';

function buildCreatorPhone(booking) {
  return booking?.user?.registration?.phone ?? booking?.contactPhone ?? booking?.user?.phone ?? null;
}

function buildBookingLocation(booking) {
  if (booking?.visitMode === 'BOUTIQUE') {
    return booking?.boutique?.name ?? booking?.boutiqueAddress ?? 'не указан';
  }

  return booking?.deliveryAddress ?? 'не указан';
}

function buildBookingDate(booking) {
  return booking?.visitDate ? formatDate(booking.visitDate, 'DD.MM.YYYY') : null;
}

function buildBookingTime(booking) {
  return formatSlotLabelForUser(booking?.slotLabel ?? booking?.timeSlot?.label) || null;
}

function buildBookingWishText(booking) {
  const wishText = booking?.wishText?.trim();
  return wishText || null;
}

function buildUserPdfStatusLine(hasUserPdf) {
  return `PDF: ${hasUserPdf ? 'загружен' : 'не загружен'}`;
}

function buildBookingNotificationText(booking, { hasUserPdf }) {
  const requestTypeLabel = BOOKING_REQUEST_TYPE_LABELS[booking?.requestType] ?? booking?.requestType ?? 'не указан';
  const visitModeLabel = VISIT_MODE_LABELS[booking?.visitMode] ?? booking?.visitMode ?? 'не указан';
  const creatorPhone = buildCreatorPhone(booking);
  const bookingDate = buildBookingDate(booking);
  const bookingTime = buildBookingTime(booking);
  const wishText = buildBookingWishText(booking);
  const lines = [
    'Новая заявка',
    '',
    ...formatAdminUserIdentityLines(booking?.user, { label: 'Креатор' }),
    creatorPhone ? `Телефон: ${creatorPhone}` : null,
    `Тип: ${requestTypeLabel}`,
    `Формат: ${visitModeLabel}`,
    `Бутик / адрес: ${buildBookingLocation(booking)}`,
    bookingDate ? `Дата: ${bookingDate}` : null,
    bookingTime ? `Время: ${bookingTime}` : null,
    wishText ? `Пожелания: ${wishText}` : null,
  ].filter(Boolean);

  if (!hasUserPdf) {
    lines.push('PDF креатора не загружен.');
  }

  lines.push(buildUserPdfStatusLine(hasUserPdf));

  return lines.join('\n');
}

function buildUserPdfCaption(booking) {
  return `PDF креатора: ${formatUserDisplayName(booking?.user)}`;
}

function getCreatorPdfFileId(userPdf) {
  if (typeof userPdf?.telegramFileId !== 'string') {
    return null;
  }

  const telegramFileId = userPdf.telegramFileId.trim();
  return telegramFileId || null;
}

export function createAdminNotificationService({ adminService, env, logger, userPdfService }) {
  const serviceLogger = logger.child({ service: 'adminNotification' });
  const telegram = env.BOT_TOKEN ? new Telegram(env.BOT_TOKEN) : null;

  function logAdminNotificationEvent(event, extra = {}, level = 'info') {
    serviceLogger[level](
      {
        event,
        ...extra,
      },
      `Admin notification event: ${event}`,
    );
  }

  async function getBookingAdminRecipients() {
    return adminService.getBookingNotificationRecipientTelegramIds();
  }

  async function notifyAdminAboutBooking(booking) {
    try {
      logAdminNotificationEvent('admin_notification_started', {
        bookingId: booking?.id ?? null,
        userId: booking?.userId ?? null,
      });

      if (!telegram) {
        logAdminNotificationEvent(
          'admin_notification_failed',
          {
            bookingId: booking?.id ?? null,
            reason: 'telegram_client_unavailable',
            userId: booking?.userId ?? null,
          },
          'warn',
        );

        return {
          notifiedAdmins: 0,
          pdfSent: false,
          skipped: true,
        };
      }

      const recipients = await getBookingAdminRecipients();

      if (recipients.length === 0) {
        logAdminNotificationEvent(
          'admin_notification_failed',
          {
            bookingId: booking?.id ?? null,
            reason: 'no_booking_notification_recipients_configured',
            userId: booking?.userId ?? null,
          },
          'warn',
        );

        return {
          notifiedAdmins: 0,
          pdfSent: false,
          skipped: true,
        };
      }

      const userPdf = await userPdfService.getUserPdf(booking.userId);
      const creatorPdfFileId = getCreatorPdfFileId(userPdf);
      const hasUserPdf = Boolean(creatorPdfFileId);
      const message = buildBookingNotificationText(booking, {
        hasUserPdf,
      });

      logAdminNotificationEvent('admin_notification_pdf_resolved', {
        bookingId: booking.id,
        hasUserPdf,
        telegramFileId: creatorPdfFileId,
        userId: booking.userId,
      });

      let notifiedAdmins = 0;
      let pdfSent = false;

      for (const telegramId of recipients) {
        try {
          await telegram.sendMessage(telegramId, message);
          notifiedAdmins += 1;
          logAdminNotificationEvent('admin_notification_text_sent', {
            adminTelegramId: telegramId,
            bookingId: booking.id,
            userId: booking.userId,
          });

          if (!creatorPdfFileId) {
            continue;
          }

          try {
            await telegram.sendDocument(telegramId, creatorPdfFileId, {
              caption: buildUserPdfCaption(booking),
            });
            pdfSent = true;
            logAdminNotificationEvent('admin_notification_pdf_sent', {
              adminTelegramId: telegramId,
              bookingId: booking.id,
              telegramFileId: creatorPdfFileId,
              userId: booking.userId,
            });
          } catch (error) {
            logAdminNotificationEvent(
              'admin_notification_failed',
              {
                adminTelegramId: telegramId,
                bookingId: booking.id,
                err: error,
                stage: 'pdf',
                telegramFileId: creatorPdfFileId,
                userId: booking.userId,
              },
              'error',
            );
          }
        } catch (error) {
          logAdminNotificationEvent(
            'admin_notification_failed',
            {
              adminTelegramId: telegramId,
              bookingId: booking.id,
              err: error,
              stage: 'text',
              userId: booking.userId,
            },
            'error',
          );
          continue;
        }
      }

      if (!creatorPdfFileId) {
        logAdminNotificationEvent('admin_notification_pdf_skipped', {
          bookingId: booking.id,
          reason: 'user_pdf_missing',
          userId: booking.userId,
        });
      }

      if (notifiedAdmins === 0) {
        logAdminNotificationEvent('admin_notification_failed', {
          bookingId: booking.id,
          reason: 'no_recipients_delivered',
          recipients,
          userId: booking.userId,
        }, 'error');
      }

      serviceLogger.info(
        {
          bookingId: booking.id,
          notifiedAdmins,
          pdfAttached: pdfSent,
          recipients,
          userId: booking.userId,
        },
        'Admin booking notification completed',
      );

      return {
        notifiedAdmins,
        pdfSent,
        skipped: false,
      };
    } catch (error) {
      logAdminNotificationEvent(
        'admin_notification_failed',
        {
          bookingId: booking?.id ?? null,
          err: error,
          stage: 'unexpected',
          userId: booking?.userId ?? null,
        },
        'error',
      );

      return {
        notifiedAdmins: 0,
        pdfSent: false,
        skipped: true,
      };
    }
  }

  return {
    notifyAdminAboutBooking,
  };
}
