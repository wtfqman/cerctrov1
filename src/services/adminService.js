import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { AdminRole } from '@prisma/client';

import {
  ADMIN_PERMISSIONS,
  ADMIN_ROLE_LABELS,
  ADMIN_ROLE_PERMISSIONS,
  AUDIT_ACTIONS,
  BUILTIN_ADMINS,
  ROOT_ADMIN_TELEGRAM_ID,
} from '../utils/constants.js';
import { ForbiddenError, ValidationError } from '../utils/errors.js';
import { getRegistrationCdekAddress, getRegistrationHomeAddress, normalizeRegistrationSizes } from '../utils/registration.js';
import { formatSlotLabelForUser } from '../utils/slots.js';
import { normalizeTelegramId } from '../utils/validators.js';

function normalizeAdminRole(role) {
  const normalizedRole = String(role ?? '').trim().toUpperCase();

  if (!Object.values(AdminRole).includes(normalizedRole)) {
    throw new ValidationError(
      `Роль администратора должна быть одной из: ${Object.values(AdminRole).join(', ')}`,
    );
  }

  return normalizedRole;
}

function getRolePermissions(role) {
  return ADMIN_ROLE_PERMISSIONS[role] ?? [];
}

function getRoleLabel(role) {
  return ADMIN_ROLE_LABELS[role] ?? String(role ?? '').toLowerCase();
}

function buildAdminDisplayName(admin) {
  if (admin?.displayName) {
    return admin.displayName;
  }

  const fullName = [admin?.user?.firstName, admin?.user?.lastName].filter(Boolean).join(' ').trim();

  if (fullName) {
    return fullName;
  }

  if (admin?.user?.username) {
    return `@${admin.user.username}`;
  }

  return `Администратор ${admin?.user?.telegramId ?? ''}`.trim();
}

function csvEscape(value) {
  const normalized = value === null || value === undefined ? '' : String(value);
  return `"${normalized.replace(/"/g, '""')}"`;
}

function buildCsv(rows) {
  return `\uFEFF${rows.map((row) => row.map(csvEscape).join(',')).join('\n')}`;
}

export function createAdminService({ prisma, logger, env, googleSheets = null }) {
  const serviceLogger = logger.child({ service: 'admin' });
  const adminInclude = Object.freeze({
    user: true,
  });

  function isRootAdminRecord(admin) {
    return admin?.user?.telegramId === ROOT_ADMIN_TELEGRAM_ID;
  }

  async function getAdminById(adminId, { includeInactive = false } = {}) {
    if (!adminId) {
      return null;
    }

    return prisma.admin.findFirst({
      where: {
        id: String(adminId),
        ...(includeInactive ? {} : { isActive: true }),
      },
      include: adminInclude,
    });
  }

  async function getAdminByTelegramId(telegramId, { includeInactive = false } = {}) {
    const normalizedTelegramId = normalizeTelegramId(telegramId);

    return prisma.admin.findFirst({
      where: {
        ...(includeInactive ? {} : { isActive: true }),
        user: {
          telegramId: normalizedTelegramId,
        },
      },
      include: adminInclude,
    });
  }

  async function getAdminByActorId(actorId) {
    if (actorId === undefined || actorId === null || actorId === '') {
      return null;
    }

    const rawValue = String(actorId).trim();

    return prisma.admin.findFirst({
      where: {
        isActive: true,
        OR: [
          {
            id: rawValue,
          },
          {
            user: {
              telegramId: rawValue,
            },
          },
        ],
      },
      include: adminInclude,
    });
  }

  function hasPermission(adminOrRole, permission) {
    const role =
      typeof adminOrRole === 'string' ? normalizeAdminRole(adminOrRole) : normalizeAdminRole(adminOrRole?.role);

    return getRolePermissions(role).includes(permission);
  }

  async function assertPermission(actorId, permission) {
    const admin = await getAdminByActorId(actorId);

    if (!admin) {
      throw new ForbiddenError('Админское меню доступно только администраторам');
    }

    if (!hasPermission(admin, permission)) {
      serviceLogger.warn(
        {
          actorId: String(actorId),
          permission,
          role: admin.role,
        },
        'Admin permission denied',
      );

      throw new ForbiddenError('Недостаточно прав для этого действия');
    }

    return admin;
  }

  async function assertRootAdmin(actorId) {
    const admin = await getAdminByActorId(actorId);

    if (!admin) {
      throw new ForbiddenError('Админское меню доступно только администраторам');
    }

    if (!isRootAdminRecord(admin)) {
      throw new ForbiddenError('Этот раздел доступен только главному администратору');
    }

    return admin;
  }

  async function isAdminByTelegramId(telegramId) {
    const admin = await getAdminByTelegramId(telegramId);
    return Boolean(admin);
  }

  async function getPrimaryAlertAdmin() {
    return prisma.admin.findFirst({
      where: {
        isActive: true,
        receivesOverdueAlerts: true,
      },
      include: adminInclude,
      orderBy: {
        createdAt: 'asc',
      },
    });
  }

  async function listBookingNotificationAdmins() {
    return prisma.admin.findMany({
      where: {
        isActive: true,
        receivesBookingNotifications: true,
      },
      include: adminInclude,
      orderBy: [{ createdAt: 'asc' }],
    });
  }

  async function getBookingNotificationRecipientTelegramIds() {
    const bookingAdmins = await listBookingNotificationAdmins();

    return [...new Set(
      bookingAdmins
        .map((admin) => admin?.notificationChatId ?? admin?.user?.telegramId ?? null)
        .map((value) => (value === null || value === undefined ? '' : String(value).trim()))
        .filter(Boolean),
    )];
  }

  async function listAdmins({ includeInactive = false } = {}) {
    return prisma.admin.findMany({
      where: {
        ...(includeInactive ? {} : { isActive: true }),
      },
      include: adminInclude,
      orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
    });
  }

  function assertManageableAdminTarget(admin) {
    if (!admin) {
      throw new ValidationError('Администратор не найден');
    }

    if (isRootAdminRecord(admin)) {
      throw new ValidationError('Этого администратора нельзя изменить.');
    }
  }

  async function logManagedAdminAction({
    action,
    actorAdmin,
    comment,
    status = '',
    targetAdmin = null,
  }) {
    await prisma.auditLog.create({
      data: {
        action,
        adminId: actorAdmin.id,
        actorType: 'ADMIN',
        entityType: 'Admin',
        entityId: targetAdmin?.id ?? null,
        message: comment,
      },
    });

    if (!googleSheets) {
      return;
    }

    await googleSheets.logAdminAction({
      action,
      adminId: actorAdmin.user.telegramId,
      comment,
      status,
      targetUser: targetAdmin?.user ?? null,
    });
  }

  async function listManageableAdmins(actorId, { includeInactive = false } = {}) {
    await assertRootAdmin(actorId);

    return prisma.admin.findMany({
      where: {
        ...(includeInactive ? {} : { isActive: true }),
        NOT: {
          user: {
            telegramId: ROOT_ADMIN_TELEGRAM_ID,
          },
        },
      },
      include: adminInclude,
      orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
    });
  }

  async function createManagedAdmin({ actorId, telegramId, role }) {
    const rootAdmin = await assertRootAdmin(actorId);
    const normalizedTelegramId = normalizeTelegramId(telegramId);
    const normalizedRole = normalizeAdminRole(role);

    if (normalizedTelegramId === ROOT_ADMIN_TELEGRAM_ID) {
      throw new ValidationError('Этого администратора нельзя изменить.');
    }

    const existingAdmin = await getAdminByTelegramId(normalizedTelegramId, { includeInactive: true });

    if (existingAdmin) {
      throw new ValidationError(
        existingAdmin.isActive
          ? 'Такой администратор уже есть.'
          : 'Такой администратор уже есть в системе, но его доступ отключён.',
      );
    }

    const user = await prisma.user.upsert({
      where: {
        telegramId: normalizedTelegramId,
      },
      create: {
        telegramId: normalizedTelegramId,
      },
      update: {},
    });

    const admin = await prisma.admin.create({
      data: {
        userId: user.id,
        role: normalizedRole,
        displayName:
          user.firstName ??
          user.username ??
          `Администратор ${normalizedTelegramId}`,
        notificationChatId: normalizedTelegramId,
        receivesBookingNotifications: false,
        createdByAdminId: rootAdmin.id,
        lastModifiedByAdminId: rootAdmin.id,
      },
      include: adminInclude,
    });

    const comment = [
      `Добавлен администратор ${buildAdminDisplayName(admin)}`,
      `Telegram ID: ${admin.user.telegramId}`,
      `Роль: ${getRoleLabel(admin.role)}`,
    ].join(' | ');

    await logManagedAdminAction({
      action: AUDIT_ACTIONS.ADMIN_CREATED,
      actorAdmin: rootAdmin,
      comment,
      status: 'active',
      targetAdmin: admin,
    });

    return admin;
  }

  async function updateManagedAdminRole({ actorId, adminId, role }) {
    const rootAdmin = await assertRootAdmin(actorId);
    const normalizedRole = normalizeAdminRole(role);
    const targetAdmin = await getAdminById(adminId, { includeInactive: true });

    assertManageableAdminTarget(targetAdmin);

    if (!targetAdmin.isActive) {
      throw new ValidationError('Доступ этого администратора уже отключён.');
    }

    if (targetAdmin.role === normalizedRole) {
      throw new ValidationError('У администратора уже эта роль.');
    }

    const updatedAdmin = await prisma.admin.update({
      where: {
        id: targetAdmin.id,
      },
      data: {
        role: normalizedRole,
        lastModifiedByAdminId: rootAdmin.id,
      },
      include: adminInclude,
    });

    const comment = [
      `Обновлена роль администратора ${buildAdminDisplayName(updatedAdmin)}`,
      `Telegram ID: ${updatedAdmin.user.telegramId}`,
      `Новая роль: ${getRoleLabel(updatedAdmin.role)}`,
    ].join(' | ');

    await logManagedAdminAction({
      action: AUDIT_ACTIONS.ADMIN_ROLE_UPDATED,
      actorAdmin: rootAdmin,
      comment,
      status: 'active',
      targetAdmin: updatedAdmin,
    });

    return updatedAdmin;
  }

  async function deactivateManagedAdmin({ actorId, adminId }) {
    const rootAdmin = await assertRootAdmin(actorId);
    const targetAdmin = await getAdminById(adminId, { includeInactive: true });

    assertManageableAdminTarget(targetAdmin);

    if (!targetAdmin.isActive) {
      throw new ValidationError('Доступ этого администратора уже отключён.');
    }

    const updatedAdmin = await prisma.admin.update({
      where: {
        id: targetAdmin.id,
      },
      data: {
        isActive: false,
        lastModifiedByAdminId: rootAdmin.id,
        receivesOverdueAlerts: false,
        receivesBookingNotifications: false,
      },
      include: adminInclude,
    });

    const comment = [
      `Отключён администратор ${buildAdminDisplayName(updatedAdmin)}`,
      `Telegram ID: ${updatedAdmin.user.telegramId}`,
      `Роль: ${getRoleLabel(updatedAdmin.role)}`,
    ].join(' | ');

    await logManagedAdminAction({
      action: AUDIT_ACTIONS.ADMIN_DEACTIVATED,
      actorAdmin: rootAdmin,
      comment,
      status: 'inactive',
      targetAdmin: updatedAdmin,
    });

    return updatedAdmin;
  }

  async function createOrUpdateAdmin({
    telegramId,
    displayName = 'Администратор',
    role = env.DEFAULT_ADMIN_ROLE,
    receivesOverdueAlerts = false,
    receivesBookingNotifications = false,
    notificationChatId = null,
  }) {
    const normalizedTelegramId = normalizeTelegramId(telegramId);
    const normalizedRole = normalizeAdminRole(role);

    const user = await prisma.user.upsert({
      where: {
        telegramId: normalizedTelegramId,
      },
      create: {
        telegramId: normalizedTelegramId,
        firstName: displayName,
        lastSeenAt: new Date(),
      },
      update: {
        firstName: displayName,
        lastSeenAt: new Date(),
      },
    });

    return prisma.admin.upsert({
      where: {
        userId: user.id,
      },
      create: {
        userId: user.id,
        displayName,
        role: normalizedRole,
        receivesOverdueAlerts,
        receivesBookingNotifications,
        notificationChatId,
      },
      update: {
        displayName,
        isActive: true,
        role: normalizedRole,
        receivesOverdueAlerts,
        receivesBookingNotifications,
        notificationChatId,
      },
      include: adminInclude,
    });
  }

  async function ensureConfiguredAdmins() {
    for (const adminConfig of BUILTIN_ADMINS) {
      await createOrUpdateAdmin({
        telegramId: adminConfig.telegramId,
        displayName: adminConfig.displayName,
        role: adminConfig.role,
        receivesOverdueAlerts: adminConfig.receivesOverdueAlerts,
        receivesBookingNotifications: adminConfig.receivesBookingNotifications ?? false,
        notificationChatId: adminConfig.telegramId,
      });
    }

    const admins = await listAdmins();

    serviceLogger.info(
      {
        admins: admins.map((admin) => ({
          id: admin.id,
          role: admin.role,
          telegramId: admin.user.telegramId,
        })),
      },
      'Configured admins ensured',
    );

    return admins;
  }

  async function exportDataToCsv(actorId) {
    await assertPermission(actorId, ADMIN_PERMISSIONS.EXPORT_DATA);

    const exportDir = path.resolve(process.cwd(), 'storage', 'exports');
    const users = await prisma.user.findMany({
      include: {
        registration: true,
        bookings: {
          orderBy: {
            createdAt: 'desc',
          },
          take: 1,
        },
        timers: {
          orderBy: {
            takenAt: 'desc',
          },
          take: 1,
        },
        _count: {
          select: {
            bookings: true,
            timers: true,
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    const rows = [
      [
        'user_id',
        'telegram_id',
        'username',
        'first_name',
        'last_name',
        'is_blocked',
        'blocked_reason',
        'user_created_at',
        'registration_status',
        'registration_full_name',
        'registration_phone',
        'registration_address',
        'registration_home_address',
        'registration_cdek_address',
        'registration_sizes',
        'bookings_count',
        'latest_booking_public_id',
        'latest_booking_request_type',
        'latest_booking_visit_mode',
        'latest_booking_status',
        'latest_booking_created_at',
        'latest_booking_visit_date',
        'latest_booking_slot_label',
        'latest_booking_delivery_address',
        'timers_count',
        'latest_timer_status',
        'latest_timer_taken_at',
        'latest_timer_returned_at',
        'latest_timer_reminder_sent_at',
        'latest_timer_admin_alert_sent_at',
      ],
      ...users.map((user) => {
        const latestBooking = user.bookings[0] ?? null;
        const latestTimer = user.timers[0] ?? null;

        return [
          user.id,
          user.telegramId,
          user.username ?? '',
          user.firstName ?? '',
          user.lastName ?? '',
          user.isBlocked ? 'true' : 'false',
          user.blockedReason ?? '',
          user.createdAt.toISOString(),
          user.registration?.status ?? '',
          user.registration?.fullName ?? '',
          user.registration?.phone ?? '',
          user.registration?.address ?? getRegistrationHomeAddress(user.registration),
          getRegistrationHomeAddress(user.registration),
          getRegistrationCdekAddress(user.registration),
          normalizeRegistrationSizes(user.registration?.sizes ?? ''),
          String(user._count.bookings),
          latestBooking?.publicId ?? '',
          latestBooking?.requestType ?? '',
          latestBooking?.visitMode ?? '',
          latestBooking?.status ?? '',
          latestBooking?.createdAt?.toISOString?.() ?? '',
          latestBooking?.visitDate?.toISOString?.() ?? '',
          formatSlotLabelForUser(latestBooking?.slotLabel ?? ''),
          latestBooking?.deliveryAddress ?? '',
          String(user._count.timers),
          latestTimer?.status ?? '',
          latestTimer?.takenAt?.toISOString?.() ?? '',
          latestTimer?.returnedAt?.toISOString?.() ?? '',
          latestTimer?.reminderSentAt?.toISOString?.() ?? '',
          latestTimer?.adminAlertSentAt?.toISOString?.() ?? '',
        ];
      }),
    ];

    await mkdir(exportDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `cerca-trova-export-${timestamp}.csv`;
    const filePath = path.join(exportDir, fileName);

    await writeFile(filePath, buildCsv(rows), 'utf8');

    return {
      fileName,
      filePath,
      rowsCount: users.length,
    };
  }

  return {
    assertRootAdmin,
    assertPermission,
    createManagedAdmin,
    createOrUpdateAdmin,
    deactivateManagedAdmin,
    ensureConfiguredAdmins,
    exportDataToCsv,
    getAdminByActorId,
    getAdminById,
    getAdminByTelegramId,
    getBookingNotificationRecipientTelegramIds,
    getPrimaryAlertAdmin,
    hasPermission,
    isAdminByTelegramId,
    isRootAdminRecord,
    listAdmins,
    listBookingNotificationAdmins,
    listManageableAdmins,
    updateManagedAdminRole,
  };
}
