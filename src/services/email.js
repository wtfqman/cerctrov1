import nodemailer from 'nodemailer';

import { BOOKING_REQUEST_TYPE_LABELS } from '../utils/constants.js';
import { formatDate } from '../utils/date.js';
import { normalizeEmailList } from '../utils/mail.js';
import { getRegistrationCdekAddress, getRegistrationHomeAddress } from '../utils/registration.js';
import { formatSlotLabelForEmail } from '../utils/slots.js';

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatTelegramHandle(booking) {
  const registrationUsername = booking?.user?.registration?.telegramUsername;

  if (registrationUsername) {
    return registrationUsername;
  }

  if (booking?.user?.username) {
    return `@${booking.user.username}`;
  }

  if (booking?.user?.telegramId) {
    return booking.user.telegramId;
  }

  return 'не указан';
}

function buildMailFrom(env) {
  if (env.MAIL_FROM_NAME) {
    return {
      address: env.MAIL_FROM,
      name: env.MAIL_FROM_NAME,
    };
  }

  return env.MAIL_FROM;
}

function buildBookingMailRows(booking) {
  const registration = booking?.user?.registration;
  const boutiqueName = booking?.boutique?.name ?? booking?.boutiqueAddress ?? 'Не указан';
  const homeAddress = getRegistrationHomeAddress(registration) || 'не указан';
  const cdekAddress = getRegistrationCdekAddress(registration) || 'не указан';
  const requestTypeLabel = BOOKING_REQUEST_TYPE_LABELS[booking?.requestType] ?? booking?.requestType ?? 'Не указан';
  const fullName =
    registration?.fullName ??
    [booking?.user?.firstName, booking?.user?.lastName].filter(Boolean).join(' ').trim() ??
    'Не указано';

  return [
    ['ФИО', fullName || 'Не указано'],
    ['Телефон', registration?.phone ?? booking?.contactPhone ?? booking?.user?.phone ?? 'Не указан'],
    ['Telegram', formatTelegramHandle(booking)],
    ['Домашний адрес', homeAddress],
    ['Адрес СДЭК', cdekAddress],
    ['Тип заявки', requestTypeLabel],
    ['Бутик', boutiqueName],
    ['Дата', booking?.visitDate ? formatDate(booking.visitDate, 'DD.MM.YYYY') : 'Не указана'],
    ['Время', formatSlotLabelForEmail(booking?.slotLabel ?? booking?.timeSlot?.label) || 'Не указано'],
    ['Пожелание', booking?.wishText?.trim() || 'не указано'],
  ];
}

function buildTextBody(rows) {
  return [
    'Здравствуйте!',
    '',
    'Появилась новая запись в бутик.',
    '',
    ...rows.map(([label, value]) => `${label}: ${value}`),
  ].join('\n');
}

function buildHtmlBody(rows) {
  const tableRows = rows
    .map(
      ([label, value]) => `
        <tr>
          <td style="padding:8px 12px;border:1px solid #d9d9d9;font-weight:600;background:#f7f7f7;">${escapeHtml(label)}</td>
          <td style="padding:8px 12px;border:1px solid #d9d9d9;">${escapeHtml(value)}</td>
        </tr>`,
    )
    .join('');

  return `
    <div style="font-family:Arial,sans-serif;color:#1f1f1f;line-height:1.5;">
      <p>Здравствуйте!</p>
      <p>Появилась новая запись в бутик.</p>
      <table style="border-collapse:collapse;border-spacing:0;">
        <tbody>${tableRows}</tbody>
      </table>
    </div>
  `.trim();
}

function buildBoutiqueBookingMessage(booking) {
  const boutiqueName = booking?.boutique?.name ?? booking?.boutiqueAddress ?? 'Бутик';
  const rows = buildBookingMailRows(booking);

  return {
    html: buildHtmlBody(rows),
    subject: `Новая запись в бутик — ${boutiqueName}`,
    text: buildTextBody(rows),
  };
}

export function createEmailService({ env, logger }) {
  const serviceLogger = logger.child({ service: 'email' });
  const isConfigured = Boolean(env.MAIL_ENABLED);
  const state = {
    initPromise: null,
    initialized: false,
    transporter: null,
  };

  function getTransporter() {
    if (state.transporter) {
      return state.transporter;
    }

    state.transporter = nodemailer.createTransport({
      auth: {
        pass: env.SMTP_PASS,
        user: env.SMTP_USER,
      },
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
    });

    return state.transporter;
  }

  async function runInit() {
    try {
      const transporter = getTransporter();
      await transporter.verify();
      state.initialized = true;

      serviceLogger.info(
        {
          host: env.SMTP_HOST,
          mailFrom: env.MAIL_FROM,
          port: env.SMTP_PORT,
          secure: env.SMTP_SECURE,
          user: env.SMTP_USER,
        },
        'Email service initialized successfully',
      );

      return true;
    } catch (error) {
      state.initialized = false;

      serviceLogger.error(
        {
          err: error,
          host: env.SMTP_HOST,
          mailFrom: env.MAIL_FROM,
          port: env.SMTP_PORT,
          secure: env.SMTP_SECURE,
          user: env.SMTP_USER,
        },
        'Failed to initialize email service',
      );

      return false;
    }
  }

  async function init() {
    if (!isConfigured) {
      serviceLogger.info('Email notifications are disabled');
      return false;
    }

    if (state.initialized) {
      return true;
    }

    if (!state.initPromise) {
      state.initPromise = runInit().finally(() => {
        state.initPromise = null;
      });
    }

    return state.initPromise;
  }

  async function sendMail({ attachments = [], cc = [], html = '', subject, text, to }) {
    if (!isConfigured) {
      return {
        message: 'Email service is disabled',
        ok: false,
        reason: 'mail_disabled',
        skipped: true,
      };
    }

    const transporter = getTransporter();

    try {
      const info = await transporter.sendMail({
        attachments: attachments.length > 0 ? attachments : undefined,
        cc: cc.length > 0 ? cc : undefined,
        from: buildMailFrom(env),
        html: html || undefined,
        subject,
        text,
        to,
      });

      state.initialized = true;

      return {
        accepted: info.accepted,
        messageId: info.messageId,
        ok: true,
        rejected: info.rejected,
      };
    } catch (error) {
      state.initialized = false;

      serviceLogger.error(
        {
          err: error,
          subject,
          to,
        },
        'Failed to send email',
      );

      return {
        message: error?.message ?? 'Failed to send email',
        ok: false,
      };
    }
  }

  async function sendBoutiqueBookingNotification({ attachments = [], booking }) {
    if (!booking || booking.visitMode !== 'BOUTIQUE') {
      return {
        message: 'Only boutique bookings can trigger boutique email notifications',
        ok: false,
        reason: 'not_boutique_booking',
        skipped: true,
      };
    }

    const recipient = booking?.boutique?.email?.trim();

    if (!recipient) {
      serviceLogger.warn(
        {
          bookingId: booking.id,
          boutiqueId: booking.boutiqueId,
          boutiqueName: booking?.boutique?.name ?? booking?.boutiqueAddress,
        },
        'Boutique booking email skipped because boutique email is missing',
      );

      return {
        message: 'Boutique email is missing',
        ok: false,
        reason: 'missing_boutique_email',
        skipped: true,
      };
    }

    let ccRecipients = [];

    try {
      ccRecipients = normalizeEmailList(booking?.boutique?.ccEmails ?? '', {
        allowEmpty: true,
        fieldName: 'ccEmails',
      });
    } catch (error) {
      serviceLogger.warn(
        {
          boutiqueId: booking.boutiqueId,
          ccEmails: booking?.boutique?.ccEmails,
          errorMessage: error?.message,
        },
        'Boutique ccEmails are invalid and will be ignored',
      );
    }

    const message = buildBoutiqueBookingMessage(booking);

    return sendMail({
      attachments,
      cc: ccRecipients,
      html: message.html,
      subject: message.subject,
      text: message.text,
      to: recipient,
    });
  }

  return {
    init,
    isConfigured,
    sendBoutiqueBookingNotification,
    sendMail,
  };
}
