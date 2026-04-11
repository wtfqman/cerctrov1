# Root Admin Management

?????? ?????? ?????????? ??????.

[prisma/schema.prisma](/C:\Users\PC\OneDrive\Desktop\cerca trova bot\prisma\schema.prisma)
`$lang
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

enum RegistrationStatus {
  PENDING
  APPROVED
  REJECTED
  ARCHIVED
}

enum BookingStatus {
  CREATED
  SUBMITTED
  CANCELLED
  COMPLETED
}

enum BookingRequestType {
  RETURN
  PICKUP
  RETURN_PICKUP
}

enum VisitMode {
  BOUTIQUE
  DELIVERY
}

enum TimerStatus {
  ACTIVE
  RETURNED
  OVERDUE
}

enum DocumentKind {
  REGISTRATION_FORM
  BOOKING_CONFIRMATION
  RETURN_ACT
  OTHER
}

enum AdminRole {
  FULL
  LIMITED
}

enum AuditActorType {
  SYSTEM
  USER
  ADMIN
}

model User {
  id                String         @id @default(cuid())
  telegramId        String         @unique
  username          String?
  firstName         String?
  lastName          String?
  phone             String?
  languageCode      String?
  isBot             Boolean        @default(false)
  isBlocked         Boolean        @default(false)
  blockedReason     String?
  blockedUntil      DateTime?
  blockedByAdminId  String?
  lastSeenAt        DateTime?
  createdAt         DateTime       @default(now())
  updatedAt         DateTime       @updatedAt

  registration      Registration?
  bookings          Booking[]
  timers            UserItemTimer[]
  generatedPdfs     UserPdf[]
  adminProfile      Admin?         @relation("AdminUser")
  blockedByAdmin    Admin?         @relation("UserBlockedByAdmin", fields: [blockedByAdminId], references: [id], onDelete: SetNull)
  auditLogs         AuditLog[]     @relation("AuditLogUser")

  @@index([isBlocked])
}

model Registration {
  id                 String             @id @default(cuid())
  userId             String             @unique
  status             RegistrationStatus @default(APPROVED)
  fullName           String
  phone              String             @unique
  telegramUsername   String
  address            String
  homeAddress        String?
  cdekAddress        String?
  sizes              String
  externalSheetRow   String?
  approvedAt         DateTime?
  pdfSentAt          DateTime?
  createdAt          DateTime           @default(now())
  updatedAt          DateTime           @updatedAt

  user               User               @relation(fields: [userId], references: [id], onDelete: Cascade)
  bookings           Booking[]
}

model Booking {
  id                 String         @id @default(cuid())
  publicId           String         @unique
  userId             String
  registrationId     String?
  requestType        BookingRequestType
  visitMode          VisitMode
  status             BookingStatus  @default(CREATED)
  boutiqueId         String?
  timeSlotId         String?
  activeSlotKey      String?        @unique
  boutiqueAddress    String?
  visitDate          DateTime?
  slotLabel          String?
  deliveryAddress    String?
  contactPhone       String?
  wishText           String?
  externalSheetRow   String?
  submittedAt        DateTime?
  cancelledAt        DateTime?
  completedAt        DateTime?
  createdAt          DateTime       @default(now())
  updatedAt          DateTime       @updatedAt

  user               User           @relation(fields: [userId], references: [id], onDelete: Cascade)
  registration       Registration?  @relation(fields: [registrationId], references: [id], onDelete: SetNull)
  boutique           Boutique?      @relation(fields: [boutiqueId], references: [id], onDelete: SetNull)
  timeSlot           TimeSlot?      @relation(fields: [timeSlotId], references: [id], onDelete: SetNull)
  timers             UserItemTimer[]
  documents          UserPdf[]

  @@index([userId, createdAt])
  @@index([visitMode, visitDate])
  @@index([boutiqueId, timeSlotId, visitDate])
}

model Boutique {
  id                 String         @id @default(cuid())
  code               String         @unique
  name               String
  addressLine1       String
  addressLine2       String?
  city               String?
  email              String?
  ccEmails           String?
  notes              String?
  isActive           Boolean        @default(true)
  createdAt          DateTime       @default(now())
  updatedAt          DateTime       @updatedAt

  timeSlots          TimeSlot[]
  bookings           Booking[]
  slotClosures       SlotClosure[]

  @@index([isActive, name])
}

model TimeSlot {
  id                 String         @id @default(cuid())
  boutiqueId         String
  label              String
  startTime          String
  endTime            String
  capacity           Int            @default(1)
  sortOrder          Int            @default(0)
  isActive           Boolean        @default(true)
  createdAt          DateTime       @default(now())
  updatedAt          DateTime       @updatedAt

  boutique           Boutique       @relation(fields: [boutiqueId], references: [id], onDelete: Cascade)
  bookings           Booking[]
  closures           SlotClosure[]

  @@unique([boutiqueId, startTime, endTime])
  @@index([boutiqueId, isActive, sortOrder])
}

model SlotClosure {
  id                 String         @id @default(cuid())
  boutiqueId         String
  timeSlotId         String
  date               DateTime
  reason             String?
  closedByAdminId    String?
  isActive           Boolean        @default(true)
  createdAt          DateTime       @default(now())
  updatedAt          DateTime       @updatedAt

  boutique           Boutique       @relation(fields: [boutiqueId], references: [id], onDelete: Cascade)
  timeSlot           TimeSlot       @relation(fields: [timeSlotId], references: [id], onDelete: Cascade)
  closedByAdmin      Admin?         @relation(fields: [closedByAdminId], references: [id], onDelete: SetNull)

  @@unique([timeSlotId, date])
  @@index([boutiqueId, date])
}

model Admin {
  id                    String      @id @default(cuid())
  userId                String      @unique
  role                  AdminRole   @default(LIMITED)
  displayName           String?
  notificationChatId    String?
  receivesOverdueAlerts Boolean     @default(false)
  isActive              Boolean     @default(true)
  createdByAdminId      String?
  lastModifiedByAdminId String?
  createdAt             DateTime    @default(now())
  updatedAt             DateTime    @updatedAt

  user                  User        @relation("AdminUser", fields: [userId], references: [id], onDelete: Cascade)
  createdByAdmin        Admin?      @relation("AdminCreatedBy", fields: [createdByAdminId], references: [id], onDelete: SetNull)
  lastModifiedByAdmin   Admin?      @relation("AdminLastModifiedBy", fields: [lastModifiedByAdminId], references: [id], onDelete: SetNull)
  createdAdmins         Admin[]     @relation("AdminCreatedBy")
  modifiedAdmins        Admin[]     @relation("AdminLastModifiedBy")
  blockedUsers          User[]      @relation("UserBlockedByAdmin")
  slotClosures          SlotClosure[]
  auditLogs             AuditLog[]  @relation("AuditLogAdmin")

  @@index([isActive, receivesOverdueAlerts])
}

model UserItemTimer {
  id                 String       @id @default(cuid())
  userId             String
  bookingId          String?
  activeTimerKey     String?      @unique
  status             TimerStatus  @default(ACTIVE)
  takenAt            DateTime
  dueAt              DateTime?
  reminderAt         DateTime?
  adminAlertAt       DateTime?
  reminderSentAt     DateTime?
  adminAlertSentAt   DateTime?
  returnedAt         DateTime?
  note               String?
  createdAt          DateTime     @default(now())
  updatedAt          DateTime     @updatedAt

  user               User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  booking            Booking?     @relation(fields: [bookingId], references: [id], onDelete: SetNull)

  @@index([userId, status])
  @@index([status, reminderSentAt, adminAlertSentAt])
}

model PdfTemplate {
  id                 String       @id @default(cuid())
  key                String       @unique
  name               String
  description        String?
  storagePath        String
  fileName           String?
  mimeType           String?
  telegramFileId     String?
  uploadedByAdminId  String?
  isActive           Boolean      @default(true)
  createdAt          DateTime     @default(now())
  updatedAt          DateTime     @updatedAt

  userPdfs           UserPdf[]
}

model UserPdf {
  id                 String       @id @default(cuid())
  userId             String
  bookingId          String?
  templateId         String?
  documentKind       DocumentKind
  fileName           String
  storagePath        String
  telegramFileId     String?
  externalUrl        String?
  createdAt          DateTime     @default(now())
  updatedAt          DateTime     @updatedAt

  user               User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  booking            Booking?     @relation(fields: [bookingId], references: [id], onDelete: SetNull)
  template           PdfTemplate? @relation(fields: [templateId], references: [id], onDelete: SetNull)

  @@index([userId, documentKind])
}

model AuditLog {
  id                 String         @id @default(cuid())
  action             String
  entityType         String
  entityId           String?
  message            String?
  metadata           String?
  actorType          AuditActorType
  userId             String?
  adminId            String?
  createdAt          DateTime       @default(now())

  user               User?          @relation("AuditLogUser", fields: [userId], references: [id], onDelete: SetNull)
  admin              Admin?         @relation("AuditLogAdmin", fields: [adminId], references: [id], onDelete: SetNull)

  @@index([entityType, entityId])
  @@index([createdAt])
}
```

[src/utils/constants.js](/C:\Users\PC\OneDrive\Desktop\cerca trova bot\src\utils\constants.js)
`$lang
export const MENU_BUTTONS = Object.freeze({
  REGISTRATION: 'Р РµРіРёСЃС‚СЂР°С†РёСЏ',
  MY_DATA: 'РњРѕРё РґР°РЅРЅС‹Рµ',
  BOOKING: 'Р—Р°РїРёСЃР°С‚СЊСЃСЏ',
  MY_BOOKINGS: 'РњРѕРё Р·Р°СЏРІРєРё',
  TAKE_ITEMS: 'Р’Р·СЏР» РѕР±СЂР°Р·С‹',
  RETURN_ITEMS: 'РЎРґР°Р» РѕР±СЂР°Р·С‹',
  MAIN_MENU: 'Р“Р»Р°РІРЅРѕРµ РјРµРЅСЋ',
});

export const MAIN_MENU_LAYOUT = [
  [MENU_BUTTONS.REGISTRATION],
  [MENU_BUTTONS.BOOKING],
  [MENU_BUTTONS.TAKE_ITEMS],
  [MENU_BUTTONS.RETURN_ITEMS],
  [MENU_BUTTONS.MY_BOOKINGS],
];

export const BOT_TEXTS = Object.freeze({
  START_NEW_USER:
    'РџСЂРёРІРµС‚! рџ‘‹\nР­С‚Рѕ Р±РѕС‚ Cerca Trova.\n\nРЎРЅР°С‡Р°Р»Р° РЅСѓР¶РЅРѕ Р·Р°РїРѕР»РЅРёС‚СЊ СЂРµРіРёСЃС‚СЂР°С†РёСЋ.\nРќР°Р¶РјРё В«Р РµРіРёСЃС‚СЂР°С†РёСЏВ».',
  START_REGISTERED:
    'РџСЂРёРІРµС‚! рџ‘‹\n\nР’С‹Р±РµСЂРё РЅСѓР¶РЅС‹Р№ СЂР°Р·РґРµР» РЅРёР¶Рµ.',
  MENU_HINT: 'Р’С‹Р±РµСЂРё РЅСѓР¶РЅС‹Р№ СЂР°Р·РґРµР» РЅРёР¶Рµ.',
  BLOCKED:
    'РЎРµР№С‡Р°СЃ РґРѕСЃС‚СѓРї РІСЂРµРјРµРЅРЅРѕ РѕРіСЂР°РЅРёС‡РµРЅ.',
  FEATURE_IN_PROGRESS:
    'РЎРєРѕСЂРѕ Р±СѓРґРµС‚.',
  REGISTRATION_SIZE_TEMPLATE:
    'РўРµРїРµСЂСЊ СЂР°Р·РјРµСЂС‹.\nРћС‚РїСЂР°РІСЊ РёС… РѕРґРЅРёРј СЃРѕРѕР±С‰РµРЅРёРµРј РїРѕ С€Р°Р±Р»РѕРЅСѓ:\n\nРЎРѕСЂРѕС‡РєР°:\nРџРёРґР¶Р°Рє:\nР‘СЂСЋРєРё:\nРўСЂРёРєРѕС‚Р°Р¶:\nРљРѕСЃС‚СЋРј РєР»Р°СЃСЃРёРєР°:\nРљРѕСЃС‚СЋРј power suit:',
  REGISTRATION_DONE:
    'Р“РѕС‚РѕРІРѕ рџ’«\nР РµРіРёСЃС‚СЂР°С†РёСЏ СЃРѕС…СЂР°РЅРµРЅР°.',
  PDF_MISSING:
    'Р‘Р»Р°РЅРє РїРѕРєР° РЅРµ Р·Р°РіСЂСѓР¶РµРЅ.\nР•СЃР»Рё РѕРЅ РЅСѓР¶РµРЅ СЃСЂРѕС‡РЅРѕ, РЅР°РїРёС€Рё Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂСѓ.',
  ADMIN_ONLY: 'РђРґРјРёРЅСЃРєРѕРµ РјРµРЅСЋ РґРѕСЃС‚СѓРїРЅРѕ С‚РѕР»СЊРєРѕ Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂР°Рј.',
});

export const REGISTRATION_STATUS_LABELS = Object.freeze({
  PENDING: 'РћР¶РёРґР°РµС‚ РїСЂРѕРІРµСЂРєРё',
  APPROVED: 'РџРѕРґС‚РІРµСЂР¶РґРµРЅР°',
  REJECTED: 'РћС‚РєР»РѕРЅРµРЅР°',
  ARCHIVED: 'Р’ Р°СЂС…РёРІРµ',
});

export const BOOKING_REQUEST_TYPE_LABELS = Object.freeze({
  RETURN: 'Р’РѕР·РІСЂР°С‚',
  PICKUP: 'Р—Р°Р±РѕСЂ',
  RETURN_PICKUP: 'Р’РѕР·РІСЂР°С‚ + Р—Р°Р±РѕСЂ',
});

export const VISIT_MODE_LABELS = Object.freeze({
  BOUTIQUE: 'Р‘СѓС‚РёРє',
  DELIVERY: 'Р”РѕСЃС‚Р°РІРєР°',
});

export const BOOKING_STATUS_LABELS = Object.freeze({
  CREATED: 'РЎРѕР·РґР°РЅР°',
  SUBMITTED: 'РћС‚РїСЂР°РІР»РµРЅР°',
  CANCELLED: 'РћС‚РјРµРЅРµРЅР°',
  COMPLETED: 'Р—Р°РІРµСЂС€РµРЅР°',
});

export const TIMER_STATUS_LABELS = Object.freeze({
  ACTIVE: 'РђРєС‚РёРІРµРЅ',
  RETURNED: 'Р’РѕР·РІСЂР°С‰РµРЅ',
  OVERDUE: 'РџСЂРѕСЃСЂРѕС‡РµРЅ',
});

export const ADMIN_ROLES = Object.freeze({
  FULL: 'FULL',
  LIMITED: 'LIMITED',
});

export const ADMIN_ROLE_LABELS = Object.freeze({
  [ADMIN_ROLES.FULL]: 'super_admin',
  [ADMIN_ROLES.LIMITED]: 'operator_admin',
});

export const ROOT_ADMIN_TELEGRAM_ID = '1731711996';

export const ADMIN_PERMISSIONS = Object.freeze({
  VIEW_BOOKINGS: 'view_bookings',
  VIEW_DEBTORS: 'view_debtors',
  MANAGE_SLOTS: 'manage_slots',
  MANAGE_USERS: 'manage_users',
  EXPORT_DATA: 'export_data',
  MANAGE_BOUTIQUES: 'manage_boutiques',
  MANAGE_TIME_SLOTS: 'manage_time_slots',
  MANAGE_PDFS: 'manage_pdfs',
});

export const ADMIN_ROLE_PERMISSIONS = Object.freeze({
  [ADMIN_ROLES.FULL]: [
    ADMIN_PERMISSIONS.VIEW_BOOKINGS,
    ADMIN_PERMISSIONS.VIEW_DEBTORS,
    ADMIN_PERMISSIONS.MANAGE_SLOTS,
    ADMIN_PERMISSIONS.MANAGE_USERS,
    ADMIN_PERMISSIONS.EXPORT_DATA,
    ADMIN_PERMISSIONS.MANAGE_BOUTIQUES,
    ADMIN_PERMISSIONS.MANAGE_TIME_SLOTS,
    ADMIN_PERMISSIONS.MANAGE_PDFS,
  ],
  [ADMIN_ROLES.LIMITED]: [
    ADMIN_PERMISSIONS.VIEW_BOOKINGS,
    ADMIN_PERMISSIONS.MANAGE_SLOTS,
  ],
});

export const PDF_TEMPLATE_KEYS = Object.freeze({
  REGISTRATION_WELCOME: 'registration_welcome_pdf',
});

export const BUILTIN_ADMINS = Object.freeze([
  {
    telegramId: ROOT_ADMIN_TELEGRAM_ID,
    displayName: 'Root Admin',
    role: ADMIN_ROLES.FULL,
    receivesOverdueAlerts: true,
  },
]);

export const AUDIT_ACTIONS = Object.freeze({
  USER_BLOCKED: 'user_blocked',
  USER_UNBLOCKED: 'user_unblocked',
  BOUTIQUE_CREATED: 'boutique_created',
  BOUTIQUE_REMOVED: 'boutique_removed',
  BOUTIQUE_BOOKING_EMAIL_FAILED: 'boutique_booking_email_failed',
  TIME_SLOT_CREATED: 'time_slot_created',
  TIME_SLOT_REMOVED: 'time_slot_removed',
  SLOT_CLOSED: 'slot_closed',
  SLOT_OPENED: 'slot_opened',
  VIEW_RECENT_BOOKINGS: 'view_recent_bookings',
  VIEW_TODAY_BOOKINGS: 'view_today_bookings',
  VIEW_DEBTORS: 'view_debtors',
  PDF_UPLOADED: 'pdf_uploaded',
  DATA_EXPORTED: 'data_exported',
  ADMIN_CREATED: 'admin_created',
  ADMIN_ROLE_UPDATED: 'admin_role_updated',
  ADMIN_DEACTIVATED: 'admin_deactivated',
});

export const DEFAULT_BOUTIQUES = Object.freeze([
  {
    city: 'РњРѕСЃРєРІР°',
    code: 'YAKIMANKA_19',
    name: 'Р‘РѕР»СЊС€Р°СЏ РЇРєРёРјР°РЅРєР°, 19 РњРЎРљ',
    addressLine1: 'Р‘РѕР»СЊС€Р°СЏ РЇРєРёРјР°РЅРєР°, 19',
    ccEmails: null,
    email: null,
  },
  {
    city: 'РњРѕСЃРєРІР°',
    code: 'KRASNAYA_PRESNYA_21',
    name: 'РљСЂР°СЃРЅР°СЏ РџСЂРµСЃРЅСЏ, 21 РњРЎРљ',
    addressLine1: 'РљСЂР°СЃРЅР°СЏ РџСЂРµСЃРЅСЏ, 21',
    ccEmails: null,
    email: null,
  },
  {
    city: 'РњРѕСЃРєРІР°',
    code: 'LYALIN_24_26',
    name: 'Р›СЏР»РёРЅ РџРµСЂРµСѓР»РѕРє 24-26СЃ2Р° РњРЎРљ',
    addressLine1: 'Р›СЏР»РёРЅ РџРµСЂРµСѓР»РѕРє 24-26СЃ2Р°',
    ccEmails: null,
    email: null,
  },
  {
    city: 'РЎР°РЅРєС‚-РџРµС‚РµСЂР±СѓСЂРі',
    code: 'MOISEENKO_22',
    name: 'РњРѕРёСЃРµРµРЅРєРѕ 22Р»РёС‚3 РЎРџР‘',
    addressLine1: 'РњРѕРёСЃРµРµРЅРєРѕ 22Р»РёС‚3',
    ccEmails: null,
    email: null,
  },
]);

export const DEFAULT_TIME_SLOTS = Object.freeze([
  {
    label: '11-12',
    startTime: '11:00',
    endTime: '12:00',
    sortOrder: 10,
  },
  {
    label: '12-13',
    startTime: '12:00',
    endTime: '13:00',
    sortOrder: 20,
  },
  {
    label: '13-14',
    startTime: '13:00',
    endTime: '14:00',
    sortOrder: 30,
  },
  {
    label: '14-15',
    startTime: '14:00',
    endTime: '15:00',
    sortOrder: 40,
  },
  {
    label: '15-16',
    startTime: '15:00',
    endTime: '16:00',
    sortOrder: 50,
  },
]);
```

[src/services/adminService.js](/C:\Users\PC\OneDrive\Desktop\cerca trova bot\src\services\adminService.js)
`$lang
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
      `Р РѕР»СЊ Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂР° РґРѕР»Р¶РЅР° Р±С‹С‚СЊ РѕРґРЅРѕР№ РёР·: ${Object.values(AdminRole).join(', ')}`,
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

  return `РђРґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂ ${admin?.user?.telegramId ?? ''}`.trim();
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
      throw new ForbiddenError('РђРґРјРёРЅСЃРєРѕРµ РјРµРЅСЋ РґРѕСЃС‚СѓРїРЅРѕ С‚РѕР»СЊРєРѕ Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂР°Рј');
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

      throw new ForbiddenError('РќРµРґРѕСЃС‚Р°С‚РѕС‡РЅРѕ РїСЂР°РІ РґР»СЏ СЌС‚РѕРіРѕ РґРµР№СЃС‚РІРёСЏ');
    }

    return admin;
  }

  async function assertRootAdmin(actorId) {
    const admin = await getAdminByActorId(actorId);

    if (!admin) {
      throw new ForbiddenError('РђРґРјРёРЅСЃРєРѕРµ РјРµРЅСЋ РґРѕСЃС‚СѓРїРЅРѕ С‚РѕР»СЊРєРѕ Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂР°Рј');
    }

    if (!isRootAdminRecord(admin)) {
      throw new ForbiddenError('Р­С‚РѕС‚ СЂР°Р·РґРµР» РґРѕСЃС‚СѓРїРµРЅ С‚РѕР»СЊРєРѕ РіР»Р°РІРЅРѕРјСѓ Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂСѓ');
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
      throw new ValidationError('РђРґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂ РЅРµ РЅР°Р№РґРµРЅ');
    }

    if (isRootAdminRecord(admin)) {
      throw new ValidationError('Р­С‚РѕРіРѕ Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂР° РЅРµР»СЊР·СЏ РёР·РјРµРЅРёС‚СЊ.');
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
      throw new ValidationError('Р­С‚РѕРіРѕ Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂР° РЅРµР»СЊР·СЏ РёР·РјРµРЅРёС‚СЊ.');
    }

    const existingAdmin = await getAdminByTelegramId(normalizedTelegramId, { includeInactive: true });

    if (existingAdmin) {
      throw new ValidationError(
        existingAdmin.isActive
          ? 'РўР°РєРѕР№ Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂ СѓР¶Рµ РµСЃС‚СЊ.'
          : 'РўР°РєРѕР№ Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂ СѓР¶Рµ РµСЃС‚СЊ РІ СЃРёСЃС‚РµРјРµ, РЅРѕ РµРіРѕ РґРѕСЃС‚СѓРї РѕС‚РєР»СЋС‡С‘РЅ.',
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
          `РђРґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂ ${normalizedTelegramId}`,
        notificationChatId: normalizedTelegramId,
        createdByAdminId: rootAdmin.id,
        lastModifiedByAdminId: rootAdmin.id,
      },
      include: adminInclude,
    });

    const comment = [
      `Р”РѕР±Р°РІР»РµРЅ Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂ ${buildAdminDisplayName(admin)}`,
      `Telegram ID: ${admin.user.telegramId}`,
      `Р РѕР»СЊ: ${getRoleLabel(admin.role)}`,
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
      throw new ValidationError('Р”РѕСЃС‚СѓРї СЌС‚РѕРіРѕ Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂР° СѓР¶Рµ РѕС‚РєР»СЋС‡С‘РЅ.');
    }

    if (targetAdmin.role === normalizedRole) {
      throw new ValidationError('РЈ Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂР° СѓР¶Рµ СЌС‚Р° СЂРѕР»СЊ.');
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
      `РћР±РЅРѕРІР»РµРЅР° СЂРѕР»СЊ Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂР° ${buildAdminDisplayName(updatedAdmin)}`,
      `Telegram ID: ${updatedAdmin.user.telegramId}`,
      `РќРѕРІР°СЏ СЂРѕР»СЊ: ${getRoleLabel(updatedAdmin.role)}`,
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
      throw new ValidationError('Р”РѕСЃС‚СѓРї СЌС‚РѕРіРѕ Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂР° СѓР¶Рµ РѕС‚РєР»СЋС‡С‘РЅ.');
    }

    const updatedAdmin = await prisma.admin.update({
      where: {
        id: targetAdmin.id,
      },
      data: {
        isActive: false,
        lastModifiedByAdminId: rootAdmin.id,
        receivesOverdueAlerts: false,
      },
      include: adminInclude,
    });

    const comment = [
      `РћС‚РєР»СЋС‡С‘РЅ Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂ ${buildAdminDisplayName(updatedAdmin)}`,
      `Telegram ID: ${updatedAdmin.user.telegramId}`,
      `Р РѕР»СЊ: ${getRoleLabel(updatedAdmin.role)}`,
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
    displayName = 'РђРґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂ',
    role = env.DEFAULT_ADMIN_ROLE,
    receivesOverdueAlerts = false,
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
        notificationChatId,
      },
      update: {
        displayName,
        isActive: true,
        role: normalizedRole,
        receivesOverdueAlerts,
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
    getPrimaryAlertAdmin,
    hasPermission,
    isAdminByTelegramId,
    isRootAdminRecord,
    listAdmins,
    listManageableAdmins,
    updateManagedAdminRole,
  };
}
```

[src/services/index.js](/C:\Users\PC\OneDrive\Desktop\cerca trova bot\src\services\index.js)
`$lang
import { createAdminService } from './adminService.js';
import { createBookingService } from './bookingService.js';
import { createEmailService } from './email.js';
import { createGoogleSheetsService } from './googleSheets.js';
import { createPdfStorageService } from './pdfStorage.js';
import { createRegistrationService } from './registrationService.js';
import { createTimerService } from './timerService.js';

export function createServices({ prisma, logger, env }) {
  const emailService = createEmailService({ env, logger });
  const googleSheets = createGoogleSheetsService({ env, logger });
  const pdfStorage = createPdfStorageService({ logger, prisma });
  const adminService = createAdminService({
    env,
    googleSheets,
    logger,
    prisma,
  });
  const registrationService = createRegistrationService({
    googleSheets,
    logger,
    pdfStorage,
    prisma,
  });
  const bookingService = createBookingService({
    adminService,
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

  return {
    adminService,
    bookingService,
    emailService,
    googleSheets,
    pdfStorage,
    registrationService,
    timerService,
  };
}
```

[src/utils/formatters.js](/C:\Users\PC\OneDrive\Desktop\cerca trova bot\src\utils\formatters.js)
`$lang
import {
  ADMIN_ROLE_LABELS,
  BOOKING_REQUEST_TYPE_LABELS,
  BOOKING_STATUS_LABELS,
  ROOT_ADMIN_TELEGRAM_ID,
  VISIT_MODE_LABELS,
} from './constants.js';
import { getUserVisibleBoutiqueLabel } from './boutiques.js';
import { formatDate } from './date.js';
import {
  formatRegistrationSizes,
  getRegistrationCdekAddress,
  getRegistrationHomeAddress,
} from './registration.js';
import { formatSlotLabelForUser } from './slots.js';

function getInlineUsername(user) {
  const username = user?.registration?.telegramUsername ?? (user?.username ? `@${user.username}` : null);
  return username || 'Р±РµР· username';
}

export function formatUserDisplayName(user) {
  const fullName =
    user?.registration?.fullName ||
    [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim();

  if (fullName) {
    return fullName;
  }

  if (user?.username) {
    return `@${user.username}`;
  }

  return `РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ ${user?.telegramId ?? 'Р±РµР· РёРјРµРЅРё'}`;
}

export function formatBoutiqueAddress(boutique) {
  return [boutique?.addressLine1, boutique?.addressLine2, boutique?.city].filter(Boolean).join(', ');
}

export function formatBoutiquesList(boutiques) {
  if (!Array.isArray(boutiques) || boutiques.length === 0) {
    return 'Р‘СѓС‚РёРєРё РїРѕРєР° РЅРµ РґРѕР±Р°РІР»РµРЅС‹.';
  }

  return boutiques
    .map((boutique, index) => {
      const timeSlotsCount = Array.isArray(boutique.timeSlots) ? boutique.timeSlots.length : 0;

      return [
        `${index + 1}. ${boutique.name}`,
        `РђРґСЂРµСЃ: ${formatBoutiqueAddress(boutique) || 'РќРµ СѓРєР°Р·Р°РЅ'}`,
        `РЎР»РѕС‚РѕРІ: ${timeSlotsCount}`,
      ].join('\n');
    })
    .join('\n\n');
}

export function formatTimeSlotsList(timeSlots) {
  if (!Array.isArray(timeSlots) || timeSlots.length === 0) {
    return 'Р’СЂРµРјРµРЅРЅС‹Рµ СЃР»РѕС‚С‹ РїРѕРєР° РЅРµ РґРѕР±Р°РІР»РµРЅС‹.';
  }

  return timeSlots
    .map((slot, index) => {
      const status = slot.isActive === false ? 'РЅРµР°РєС‚РёРІРµРЅ' : 'Р°РєС‚РёРІРµРЅ';

      return `${index + 1}. ${formatSlotLabelForUser(slot.label)} (${status})`;
    })
    .join('\n');
}

export function formatAvailableSlotsList(slots, date = null) {
  if (!Array.isArray(slots) || slots.length === 0) {
    return 'РќР° СЌС‚Сѓ РґР°С‚Сѓ РїРѕРєР° РЅРµС‚ СЃРІРѕР±РѕРґРЅС‹С… СЃР»РѕС‚РѕРІ.';
  }

  const header = date ? `РЎРІРѕР±РѕРґРЅС‹Рµ СЃР»РѕС‚С‹ РЅР° ${formatDate(date, 'DD.MM.YYYY')}:` : 'РЎРІРѕР±РѕРґРЅС‹Рµ СЃР»РѕС‚С‹:';
  const lines = slots.map((entry, index) => {
    const slot = entry.slot ?? entry;
    const statusText =
      entry.statusText ??
      (entry.isAvailable ? 'РЎРІРѕР±РѕРґРЅРѕ' : entry.isClosedByAdmin ? 'Р—Р°РєСЂС‹С‚Рѕ' : 'РќРµРґРѕСЃС‚СѓРїРЅРѕ');

    return `${index + 1}. ${formatSlotLabelForUser(slot.label)} - ${statusText}`;
  });

  return [header, ...lines].join('\n');
}

export function formatBookingSummary(booking, { includeStatus = true, sanitizeBoutique = false } = {}) {
  const requestTypeLabel = BOOKING_REQUEST_TYPE_LABELS[booking.requestType] ?? booking.requestType;
  const visitModeLabel = VISIT_MODE_LABELS[booking.visitMode] ?? booking.visitMode;
  const statusLabel = BOOKING_STATUS_LABELS[booking.status] ?? booking.status;
  const boutiqueLabel = sanitizeBoutique
    ? getUserVisibleBoutiqueLabel(booking, 'РќРµ РІС‹Р±СЂР°РЅ')
    : booking.boutique?.name ?? booking.boutiqueAddress ?? 'РќРµ РІС‹Р±СЂР°РЅ';

  const lines = [`${requestTypeLabel} / ${visitModeLabel}`];

  if (includeStatus) {
    lines.push(`РЎС‚Р°С‚СѓСЃ: ${statusLabel}`);
  }

  if (booking.visitMode === 'BOUTIQUE') {
    lines.push(`Р‘СѓС‚РёРє: ${boutiqueLabel}`);

    if (booking.visitDate) {
      lines.push(`Р”РµРЅСЊ: ${formatDate(booking.visitDate, 'DD.MM.YYYY')}`);
    }

    if (booking.slotLabel) {
      lines.push(`Р’СЂРµРјСЏ: ${formatSlotLabelForUser(booking.slotLabel)}`);
    }
  }

  if (booking.visitMode === 'DELIVERY') {
    lines.push(`РђРґСЂРµСЃ: ${booking.deliveryAddress ?? 'РќРµ СѓРєР°Р·Р°РЅ'}`);
  }

  if (booking.wishText) {
    lines.push(`РџРѕР¶РµР»Р°РЅРёСЏ: ${booking.wishText}`);
  }

  return lines.join('\n');
}

function buildUserBookingDateTimeLine(booking) {
  if (!booking.visitDate && !booking.slotLabel) {
    return '';
  }

  const parts = [];

  if (booking.visitDate) {
    parts.push(formatDate(booking.visitDate, 'DD.MM.YYYY'));
  }

  if (booking.slotLabel) {
    parts.push(formatSlotLabelForUser(booking.slotLabel));
  }

  return parts.join(' вЂў ');
}

function getCompactUserBookingStatus(booking) {
  if (booking.status === 'CANCELLED') {
    return 'РћС‚РјРµРЅРµРЅР°';
  }

  if (booking.status === 'COMPLETED') {
    return 'Р—Р°РІРµСЂС€РµРЅР°';
  }

  return BOOKING_STATUS_LABELS[booking.status] ?? '';
}

export function formatUserBookingCard(booking, { includeStatus = true, title = null } = {}) {
  const lines = [];
  const requestTypeLabel = BOOKING_REQUEST_TYPE_LABELS[booking.requestType] ?? booking.requestType;
  const visitModeLabel = VISIT_MODE_LABELS[booking.visitMode] ?? booking.visitMode;

  if (title) {
    lines.push(title);
  }

  lines.push(`${requestTypeLabel} / ${visitModeLabel}`);

  if (booking.visitMode === 'BOUTIQUE') {
    lines.push(getUserVisibleBoutiqueLabel(booking, 'Р‘СѓС‚РёРє РЅРµ СѓРєР°Р·Р°РЅ'));

    const dateTimeLine = buildUserBookingDateTimeLine(booking);

    if (dateTimeLine) {
      lines.push(dateTimeLine);
    }
  }

  if (booking.visitMode === 'DELIVERY') {
    lines.push(booking.deliveryAddress ?? 'РђРґСЂРµСЃ РґРѕСЃС‚Р°РІРєРё РЅРµ СѓРєР°Р·Р°РЅ');
  }

  if (booking.wishText) {
    lines.push(`РџРѕР¶РµР»Р°РЅРёСЏ: ${booking.wishText}`);
  }

  if (includeStatus) {
    const statusLine = getCompactUserBookingStatus(booking);

    if (statusLine) {
      lines.push(statusLine);
    }
  }

  return lines.join('\n');
}

export function formatUserBookingArchive(bookings, title = 'РџСЂРѕС€Р»С‹Рµ Р·Р°СЏРІРєРё') {
  if (!Array.isArray(bookings) || bookings.length === 0) {
    return '';
  }

  return [
    title,
    ...bookings.map((booking, index) => (
      formatUserBookingCard(booking, {
        includeStatus: true,
        title: `${index + 1}.`,
      })
    )),
  ].join('\n\n');
}

export function formatBookingResult(booking) {
  const requestTypeLabel = BOOKING_REQUEST_TYPE_LABELS[booking.requestType] ?? booking.requestType;
  const visitModeLabel = VISIT_MODE_LABELS[booking.visitMode] ?? booking.visitMode;

  const lines = [
    'Р“РѕС‚РѕРІРѕ рџ’«',
    'Р—Р°СЏРІРєР° СЃРѕС…СЂР°РЅРµРЅР°.',
    '',
    `${requestTypeLabel} / ${visitModeLabel}`,
  ];

  if (booking.visitMode === 'BOUTIQUE') {
    lines.push(`Р‘СѓС‚РёРє: ${getUserVisibleBoutiqueLabel(booking, 'РќРµ СѓРєР°Р·Р°РЅ')}`);
    lines.push(`Р”РµРЅСЊ: ${booking.visitDate ? formatDate(booking.visitDate, 'DD.MM.YYYY') : 'РќРµ СѓРєР°Р·Р°РЅ'}`);
    lines.push(`Р’СЂРµРјСЏ: ${formatSlotLabelForUser(booking.slotLabel) || 'РќРµ СѓРєР°Р·Р°РЅРѕ'}`);
  }

  if (booking.visitMode === 'DELIVERY') {
    lines.push(`РђРґСЂРµСЃ: ${booking.deliveryAddress ?? 'РќРµ СѓРєР°Р·Р°РЅ'}`);
  }

  if (booking.wishText) {
    lines.push(`РџРѕР¶РµР»Р°РЅРёСЏ: ${booking.wishText}`);
  }

  return lines.join('\n');
}

export function formatRegistrationSummary(registration) {
  return `Р РµРіРёСЃС‚СЂР°С†РёСЏ СЃРѕС…СЂР°РЅРµРЅР° рџ’«\n${registration.fullName}`;
}

export function formatRegistrationDetails(registration) {
  const homeAddress = getRegistrationHomeAddress(registration);
  const cdekAddress = getRegistrationCdekAddress(registration);
  const lines = [
    'Р”Р°РЅРЅС‹Рµ:',
    `Р¤РРћ: ${registration.fullName}`,
    `РўРµР»РµС„РѕРЅ: ${registration.phone}`,
    `РќРёРє: ${registration.telegramUsername}`,
    `Р”РѕРјР°С€РЅРёР№ Р°РґСЂРµСЃ: ${homeAddress || 'РЅРµ СѓРєР°Р·Р°РЅ'}`,
    `РђРґСЂРµСЃ РЎР”Р­Рљ: ${cdekAddress || 'РЅРµ СѓРєР°Р·Р°РЅ'}`,
    '',
    formatRegistrationSizes(registration.sizes),
  ];

  return lines.join('\n');
}

export function formatRegistrationConfirmation(data) {
  const homeAddress = getRegistrationHomeAddress(data);
  const cdekAddress = getRegistrationCdekAddress(data);
  const lines = [
    'РџСЂРѕРІРµСЂСЊ РґР°РЅРЅС‹Рµ:',
    '',
    `Р¤РРћ: ${data.fullName}`,
    `РўРµР»РµС„РѕРЅ: ${data.phone}`,
    `РќРёРє: ${data.telegramUsername}`,
    `Р”РѕРјР°С€РЅРёР№ Р°РґСЂРµСЃ: ${homeAddress || 'РЅРµ СѓРєР°Р·Р°РЅ'}`,
    `РђРґСЂРµСЃ РЎР”Р­Рљ: ${cdekAddress || 'РЅРµ СѓРєР°Р·Р°РЅ'}`,
    '',
    formatRegistrationSizes(data.sizes),
    '',
    'Р•СЃР»Рё РІСЃС‘ РІРµСЂРЅРѕ, РЅР°Р¶РјРё В«РџРѕРґС‚РІРµСЂРґРёС‚СЊВ».',
  ];

  return lines.join('\n');
}

export function formatTimerStatusSummary(timerStatus) {
  if (!timerStatus?.hasActiveTimer || !timerStatus.timer) {
    return 'РЎРµР№С‡Р°СЃ Сѓ С‚РµР±СЏ РЅРµС‚ Р°РєС‚РёРІРЅРѕР№ РІС‹РґР°С‡Рё РѕР±СЂР°Р·РѕРІ.';
  }

  const { daysPassed, timer } = timerStatus;
  const statusLabel =
    {
      ACTIVE: 'РѕР±СЂР°Р·С‹ Сѓ РІР°СЃ',
      RETURNED: 'РѕР±СЂР°Р·С‹ РІРѕР·РІСЂР°С‰РµРЅС‹',
      OVERDUE: 'РїРѕСЂР° РѕС„РѕСЂРјРёС‚СЊ РІРѕР·РІСЂР°С‚',
    }[timer.status] ?? 'РѕР±СЂР°Р·С‹ Сѓ РІР°СЃ';

  return [
    'РџРѕ РІРµС‰Р°Рј:',
    `РЎРµР№С‡Р°СЃ: ${statusLabel}`,
    `Р’Р·СЏС‚Рѕ: ${formatDate(timer.takenAt, 'DD.MM.YYYY HH:mm')}`,
    `РџСЂРѕС€Р»Рѕ РґРЅРµР№: ${daysPassed}`,
  ].join('\n');
}

export function formatAdminWelcome() {
  return [
    'РђРґРјРёРЅ-РјРµРЅСЋ',
    'Р’С‹Р±РµСЂРё РґРµР№СЃС‚РІРёРµ:',
  ].join('\n');
}

export function formatAdminRoleLabel(role) {
  return ADMIN_ROLE_LABELS[role] ?? String(role ?? '').toLowerCase();
}

export function formatAdminAccountSummary(admin, { includeStatus = true } = {}) {
  const lines = [
    admin?.displayName || formatUserDisplayName(admin?.user),
    `Telegram ID: ${admin?.user?.telegramId ?? '\u043d\u0435 \u0443\u043a\u0430\u0437\u0430\u043d'}`,
    `\u0420\u043e\u043b\u044c: ${formatAdminRoleLabel(admin?.role)}`,
  ];

  if (admin?.user?.username) {
    lines.push(`Username: @${admin.user.username}`);
  }

  if (includeStatus) {
    lines.push(
      `\u0421\u0442\u0430\u0442\u0443\u0441: ${
        admin?.isActive === false ? '\u043e\u0442\u043a\u043b\u044e\u0447\u0451\u043d' : '\u0430\u043a\u0442\u0438\u0432\u0435\u043d'
      }`,
    );
  }

  if (admin?.user?.telegramId === ROOT_ADMIN_TELEGRAM_ID) {
    lines.push('\u0414\u043e\u0441\u0442\u0443\u043f: root admin');
  }

  return lines.join('\n');
}

export function formatAdminAccountsList(admins, title = '\u0410\u0434\u043c\u0438\u043d\u044b') {
  if (!Array.isArray(admins) || admins.length === 0) {
    return '\u0421\u043f\u0438\u0441\u043e\u043a \u0430\u0434\u043c\u0438\u043d\u043e\u0432 \u043f\u043e\u043a\u0430 \u043f\u0443\u0441\u0442.';
  }

  return [
    title,
    '',
    ...admins.map((admin, index) => (
      [`${index + 1}.`, formatAdminAccountSummary(admin)].join('\n')
    )),
  ].join('\n\n');
}

export function formatAdminUserSummary(user) {
  const homeAddress = getRegistrationHomeAddress(user.registration);
  const cdekAddress = getRegistrationCdekAddress(user.registration);
  const lines = [
    `${formatUserDisplayName(user)}`,
    `Username: ${getInlineUsername(user)}`,
    `Telegram ID: ${user.telegramId}`,
    `РЎС‚Р°С‚СѓСЃ: ${user.isBlocked ? 'Р·Р°Р±Р»РѕРєРёСЂРѕРІР°РЅ' : 'Р°РєС‚РёРІРµРЅ'}`,
  ];

  if (user.registration?.phone) {
    lines.push(`РўРµР»РµС„РѕРЅ: ${user.registration.phone}`);
  }

  if (homeAddress) {
    lines.push(`Р”РѕРјР°С€РЅРёР№ Р°РґСЂРµСЃ: ${homeAddress}`);
  }

  if (cdekAddress) {
    lines.push(`РђРґСЂРµСЃ РЎР”Р­Рљ: ${cdekAddress}`);
  }

  return lines.join('\n');
}

export function formatAdminBookingList(bookings, title, emptyMessage = 'РџРѕРєР° Р·Р°СЏРІРѕРє РЅРµС‚.') {
  if (!Array.isArray(bookings) || bookings.length === 0) {
    return emptyMessage;
  }

  const items = bookings.map((booking, index) => {
    const userLine = `${formatUserDisplayName(booking.user)} | ${getInlineUsername(booking.user)} | ${booking.user?.telegramId ?? 'Р±РµР· id'}`;
    const lines = [
      `${index + 1}. ${userLine}`,
      formatBookingSummary(booking),
      `РЎРѕР·РґР°РЅР°: ${formatDate(booking.createdAt, 'DD.MM.YYYY HH:mm')}`,
    ];

    if (booking.publicId) {
      lines.push(`ID Р·Р°СЏРІРєРё: ${booking.publicId}`);
    }

    return lines.join('\n');
  });

  return [title, '', ...items].join('\n\n');
}

export function formatAdminDebtorsList(timers, daysThreshold) {
  if (!Array.isArray(timers) || timers.length === 0) {
    return 'РЎРµР№С‡Р°СЃ РґРѕР»Р¶РЅРёРєРѕРІ РЅРµС‚.';
  }

  const items = timers.map((timer, index) => {
    const daysPassed = Math.max(
      Math.floor((Date.now() - new Date(timer.takenAt).getTime()) / (24 * 60 * 60 * 1000)),
      0,
    );

    const lines = [
      `${index + 1}. ${formatUserDisplayName(timer.user)}`,
      `Username: ${getInlineUsername(timer.user)}`,
      `Telegram ID: ${timer.user.telegramId}`,
      `Р’Р·СЏР» РѕР±СЂР°Р·С‹: ${formatDate(timer.takenAt, 'DD.MM.YYYY HH:mm')}`,
      `РџСЂРѕС€Р»Рѕ РґРЅРµР№: ${daysPassed}`,
      `РџРѕСЂРѕРі РїСЂРѕСЃСЂРѕС‡РєРё: ${daysThreshold} РґРЅРµР№`,
    ];

    if (timer.booking) {
      lines.push(`РЎРІСЏР·СЊ СЃ Р·Р°СЏРІРєРѕР№: ${formatBookingSummary(timer.booking)}`);
    }

    return lines.join('\n');
  });

  return ['Р”РѕР»Р¶РЅРёРєРё РїРѕ РІРµС‰Р°Рј', '', ...items].join('\n\n');
}

export function formatAdminSlotStateList(entries, date, mode = 'close') {
  if (!Array.isArray(entries) || entries.length === 0) {
    return mode === 'open'
      ? 'РќР° РІС‹Р±СЂР°РЅРЅСѓСЋ РґР°С‚Сѓ РЅРµС‚ Р·Р°РєСЂС‹С‚С‹С… СЃР»РѕС‚РѕРІ.'
      : 'РќР° РІС‹Р±СЂР°РЅРЅСѓСЋ РґР°С‚Сѓ РЅРµС‚ СЃР»РѕС‚РѕРІ.';
  }

  const header =
    mode === 'open'
      ? `Р—Р°РєСЂС‹С‚С‹Рµ СЃР»РѕС‚С‹ РЅР° ${formatDate(date, 'DD.MM.YYYY')}:`
      : `РЎР»РѕС‚С‹ РЅР° ${formatDate(date, 'DD.MM.YYYY')}:`;

  const lines = entries.map((entry, index) => {
    const status = entry.closure
      ? `Р·Р°РєСЂС‹С‚${entry.closure.reason ? `: ${entry.closure.reason}` : ''}`
      : entry.booking
        ? 'Р·Р°РЅСЏС‚ РїРѕР»СЊР·РѕРІР°С‚РµР»РµРј'
        : 'СЃРІРѕР±РѕРґРµРЅ';

    return `${index + 1}. ${formatSlotLabelForUser(entry.slot.label)} - ${status}`;
  });

  return [header, ...lines].join('\n');
}
```

[src/bot/keyboards/admin.js](/C:\Users\PC\OneDrive\Desktop\cerca trova bot\src\bot\keyboards\admin.js)
`$lang
import { Markup } from 'telegraf';

import { ADMIN_PERMISSIONS } from '../../utils/constants.js';

export const ADMIN_CALLBACKS = Object.freeze({
  MENU: 'admin:menu',
  REFRESH: 'admin:refresh',
  BOOKINGS_RECENT: 'admin:bookings:recent',
  BOOKINGS_TODAY: 'admin:bookings:today',
  DEBTORS: 'admin:debtors',
  SLOT_CLOSE: 'admin:scene:slot:close',
  SLOT_OPEN: 'admin:scene:slot:open',
  USERS_MENU: 'admin:users:menu',
  USER_BLOCK: 'admin:scene:user:block',
  USER_UNBLOCK: 'admin:scene:user:unblock',
  ADMINS_MENU: 'admin:admins:menu',
  PDF_UPLOAD: 'admin:pdf:upload',
  EXPORT_DATA: 'admin:export:data',
  BOUTIQUES_MENU: 'admin:boutiques:menu',
  BOUTIQUE_ADD: 'admin:scene:boutique:add',
  BOUTIQUE_REMOVE: 'admin:scene:boutique:remove',
  TIME_SLOTS_MENU: 'admin:timeslots:menu',
  TIME_SLOT_ADD: 'admin:scene:timeslot:add',
  TIME_SLOT_REMOVE: 'admin:scene:timeslot:remove',
  SCENE_CANCEL: 'admin:scene:cancel',
  SCENE_SKIP: 'admin:scene:skip',
  SCENE_CONFIRM: 'admin:scene:confirm',
});

function chunkButtons(buttons, columns = 1) {
  const rows = [];

  for (let index = 0; index < buttons.length; index += columns) {
    rows.push(buttons.slice(index, index + columns));
  }

  return rows;
}

function menuButton(text, callbackData) {
  return Markup.button.callback(text, callbackData);
}

export function getAdminMenuKeyboard({ admin, hasPermission, isRootAdmin }) {
  const rows = [];

  if (hasPermission(admin, ADMIN_PERMISSIONS.VIEW_BOOKINGS)) {
    rows.push([
      menuButton('РџРѕСЃР»РµРґРЅРёРµ Р·Р°СЏРІРєРё', ADMIN_CALLBACKS.BOOKINGS_RECENT),
      menuButton('Р—Р°СЏРІРєРё Р·Р° СЃРµРіРѕРґРЅСЏ', ADMIN_CALLBACKS.BOOKINGS_TODAY),
    ]);
  }

  if (hasPermission(admin, ADMIN_PERMISSIONS.MANAGE_SLOTS)) {
    rows.push([
      menuButton('Р—Р°РєСЂС‹С‚СЊ СЃР»РѕС‚', ADMIN_CALLBACKS.SLOT_CLOSE),
      menuButton('РћС‚РєСЂС‹С‚СЊ СЃР»РѕС‚', ADMIN_CALLBACKS.SLOT_OPEN),
    ]);
  }

  if (hasPermission(admin, ADMIN_PERMISSIONS.VIEW_DEBTORS)) {
    rows.push([menuButton('Р”РѕР»Р¶РЅРёРєРё', ADMIN_CALLBACKS.DEBTORS)]);
  }

  if (hasPermission(admin, ADMIN_PERMISSIONS.EXPORT_DATA)) {
    rows.push([menuButton('Р’С‹РіСЂСѓР·РєР°', ADMIN_CALLBACKS.EXPORT_DATA)]);
  }

  if (hasPermission(admin, ADMIN_PERMISSIONS.MANAGE_PDFS)) {
    rows.push([menuButton('Р—Р°РіСЂСѓР·РёС‚СЊ PDF', ADMIN_CALLBACKS.PDF_UPLOAD)]);
  }

  if (hasPermission(admin, ADMIN_PERMISSIONS.MANAGE_USERS)) {
    rows.push([menuButton('РџРѕР»СЊР·РѕРІР°С‚РµР»Рё', ADMIN_CALLBACKS.USERS_MENU)]);
  }

  if (hasPermission(admin, ADMIN_PERMISSIONS.MANAGE_BOUTIQUES)) {
    rows.push([menuButton('Р‘СѓС‚РёРєРё', ADMIN_CALLBACKS.BOUTIQUES_MENU)]);
  }

  if (hasPermission(admin, ADMIN_PERMISSIONS.MANAGE_TIME_SLOTS)) {
    rows.push([menuButton('РЎР»РѕС‚С‹', ADMIN_CALLBACKS.TIME_SLOTS_MENU)]);
  }

  if (isRootAdmin?.(admin)) {
    rows.push([menuButton('РђРґРјРёРЅС‹', ADMIN_CALLBACKS.ADMINS_MENU)]);
  }

  return Markup.inlineKeyboard(rows);
}

export function getAdminOptionKeyboard(
  options,
  { columns = 1, cancelCallbackData = ADMIN_CALLBACKS.SCENE_CANCEL, cancelText = 'РќР°Р·Р°Рґ' } = {},
) {
  const buttons = options.map((option) => menuButton(option.text, option.callbackData));
  const rows = chunkButtons(buttons, columns);

  rows.push([menuButton(cancelText, cancelCallbackData)]);

  return Markup.inlineKeyboard(rows);
}

export function getAdminBackKeyboard(
  callbackData = ADMIN_CALLBACKS.MENU,
  buttonText = 'РќР°Р·Р°Рґ',
) {
  return Markup.inlineKeyboard([[menuButton(buttonText, callbackData)]]);
}

export function getAdminCancelKeyboard(cancelText = 'РќР°Р·Р°Рґ') {
  return Markup.inlineKeyboard([[menuButton(cancelText, ADMIN_CALLBACKS.SCENE_CANCEL)]]);
}

export function getAdminSkipKeyboard(skipText = 'РџСЂРѕРїСѓСЃС‚РёС‚СЊ') {
  return Markup.inlineKeyboard([
    [menuButton(skipText, ADMIN_CALLBACKS.SCENE_SKIP)],
    [menuButton('РќР°Р·Р°Рґ', ADMIN_CALLBACKS.SCENE_CANCEL)],
  ]);
}

export function getAdminConfirmKeyboard(confirmText = 'РџРѕРґС‚РІРµСЂРґРёС‚СЊ') {
  return Markup.inlineKeyboard([
    [menuButton(confirmText, ADMIN_CALLBACKS.SCENE_CONFIRM)],
    [menuButton('РќР°Р·Р°Рґ', ADMIN_CALLBACKS.SCENE_CANCEL)],
  ]);
}
```

[src/bot/scenes/adminShared.js](/C:\Users\PC\OneDrive\Desktop\cerca trova bot\src\bot\scenes\adminShared.js)
`$lang
import { BOT_TEXTS } from '../../utils/constants.js';
import { ForbiddenError } from '../../utils/errors.js';
import { formatAdminWelcome } from '../../utils/formatters.js';
import { ADMIN_CALLBACKS, getAdminMenuKeyboard } from '../keyboards/admin.js';
import {
  isMessageNotModifiedError,
  isUnavailableMessageError,
  normalizeInlineMarkup,
} from '../utils/inlineKeyboard.js';

export const ADMIN_TEXT_CANCEL = 'РћС‚РјРµРЅР°';
export const ADMIN_TEXT_BACK = 'РќР°Р·Р°Рґ';

function getCallbackPanel(ctx) {
  const message = ctx.callbackQuery?.message;

  if (!message?.chat?.id || !message?.message_id) {
    return null;
  }

  return {
    chatId: message.chat.id,
    messageId: message.message_id,
  };
}

function getStoredPanel(ctx) {
  const chatId = ctx.session?.adminPanel?.chatId;
  const messageId = ctx.session?.adminPanel?.messageId;

  if (!chatId || !messageId) {
    return null;
  }

  return { chatId, messageId };
}

function rememberAdminPanel(ctx, target) {
  if (!target?.chatId || !target?.messageId) {
    return;
  }

  ctx.session ??= {};
  ctx.session.adminPanel = {
    chatId: target.chatId,
    messageId: target.messageId,
  };
}

function getAdminPanelTarget(ctx) {
  return getCallbackPanel(ctx) ?? getStoredPanel(ctx);
}

function clearStoredPanel(ctx) {
  if (!ctx.session?.adminPanel) {
    return;
  }

  delete ctx.session.adminPanel;
}

export function getAdminText(ctx) {
  return ctx.message?.text?.trim() ?? '';
}

export function getAdminCallbackData(ctx) {
  return ctx.callbackQuery?.data ?? '';
}

export function extractCallbackValue(ctx, prefix) {
  const data = getAdminCallbackData(ctx);
  return data.startsWith(prefix) ? data.slice(prefix.length) : null;
}

export async function answerAdminCallback(ctx, text = null, showAlert = false) {
  if (!ctx.callbackQuery) {
    return;
  }

  try {
    await ctx.answerCbQuery(text ?? undefined, {
      show_alert: showAlert,
    });
  } catch {
    // Ignore callback acknowledgement errors.
  }
}

export async function ensureAdminSceneAccess(ctx, permission = null) {
  const adminService = ctx.state.services.adminService;

  if (permission) {
    return adminService.assertPermission(ctx.from.id, permission);
  }

  const admin = await adminService.getAdminByActorId(ctx.from.id);

  if (!admin) {
    throw new ForbiddenError(BOT_TEXTS.ADMIN_ONLY);
  }

  return admin;
}

export async function renderAdminPanel(ctx, text, markup = undefined) {
  const target = getAdminPanelTarget(ctx);
  const extra = normalizeInlineMarkup(markup);

  if (target) {
    rememberAdminPanel(ctx, target);

    try {
      await ctx.telegram.editMessageText(
        target.chatId,
        target.messageId,
        undefined,
        text,
        extra,
      );

      return target;
    } catch (error) {
      if (isUnavailableMessageError(error)) {
        clearStoredPanel(ctx);
      } else if (!isMessageNotModifiedError(error)) {
        throw error;
      } else {
        try {
          await ctx.telegram.editMessageReplyMarkup(
            target.chatId,
            target.messageId,
            undefined,
            extra.reply_markup,
          );
        } catch (replyMarkupError) {
          if (isUnavailableMessageError(replyMarkupError)) {
            clearStoredPanel(ctx);
          } else if (!isMessageNotModifiedError(replyMarkupError)) {
            throw replyMarkupError;
          }
        }

        if (ctx.session?.adminPanel) {
          return target;
        }
      }
    }
  }

  const sentMessage = await ctx.reply(text, extra);

  rememberAdminPanel(ctx, {
    chatId: sentMessage.chat.id,
    messageId: sentMessage.message_id,
  });

  return {
    chatId: sentMessage.chat.id,
    messageId: sentMessage.message_id,
  };
}

export async function showAdminMenu(ctx, admin, text = null) {
  await renderAdminPanel(
    ctx,
    text ?? formatAdminWelcome(admin),
    getAdminMenuKeyboard({
      admin,
      hasPermission: ctx.state.services.adminService.hasPermission,
      isRootAdmin: ctx.state.services.adminService.isRootAdminRecord,
    }),
  );
}

export async function leaveAdminScene(ctx, admin, message = 'Р”РµР№СЃС‚РІРёРµ РѕС‚РјРµРЅРµРЅРѕ.') {
  await ctx.scene.leave();
  await showAdminMenu(ctx, admin, message);
}

export async function maybeLeaveAdminScene(ctx, admin, message = 'Р”РµР№СЃС‚РІРёРµ РѕС‚РјРµРЅРµРЅРѕ.') {
  const text = getAdminText(ctx);
  const callbackData = getAdminCallbackData(ctx);

  if (
    text === ADMIN_TEXT_CANCEL ||
    text === ADMIN_TEXT_BACK ||
    text === '/cancel' ||
    callbackData === ADMIN_CALLBACKS.SCENE_CANCEL ||
    callbackData === ADMIN_CALLBACKS.MENU
  ) {
    await answerAdminCallback(ctx);
    await leaveAdminScene(ctx, admin, message);
    return true;
  }

  return false;
}
```

[src/bot/scenes/adminAdminScene.js](/C:\Users\PC\OneDrive\Desktop\cerca trova bot\src\bot\scenes\adminAdminScene.js)
`$lang
import { AdminRole } from '@prisma/client';
import { Scenes } from 'telegraf';

import { formatAdminAccountSummary, formatAdminAccountsList, formatAdminRoleLabel } from '../../utils/formatters.js';
import { ValidationError } from '../../utils/errors.js';
import { normalizeTelegramId } from '../../utils/validators.js';
import {
  ADMIN_CALLBACKS,
  getAdminBackKeyboard,
  getAdminCancelKeyboard,
  getAdminConfirmKeyboard,
  getAdminOptionKeyboard,
} from '../keyboards/admin.js';
import {
  answerAdminCallback,
  getAdminCallbackData,
  getAdminText,
  leaveAdminScene,
  maybeLeaveAdminScene,
  renderAdminPanel,
} from './adminShared.js';

export const ADMIN_ADMIN_SCENE_ID = 'admin-admin-scene';

const ADMIN_MANAGEMENT_ACTIONS = Object.freeze({
  ADD: 'add',
  CHANGE_ROLE: 'change_role',
  DEACTIVATE: 'deactivate',
  LIST: 'list',
});

const ACTION_PREFIX = 'admin-admin:action:';
const TARGET_PREFIX = 'admin-admin:target:';
const ROLE_PREFIX = 'admin-admin:role:';

function getSceneState(ctx) {
  ctx.wizard.state.adminAdmin ??= {};
  return ctx.wizard.state.adminAdmin;
}

function extractCallbackValue(ctx, prefix) {
  const callbackData = getAdminCallbackData(ctx);
  return callbackData.startsWith(prefix) ? callbackData.slice(prefix.length) : null;
}

function buildActionKeyboard() {
  return getAdminOptionKeyboard(
    [
      { text: 'РЎРїРёСЃРѕРє Р°РґРјРёРЅРѕРІ', callbackData: `${ACTION_PREFIX}${ADMIN_MANAGEMENT_ACTIONS.LIST}` },
      { text: 'Р”РѕР±Р°РІРёС‚СЊ Р°РґРјРёРЅР°', callbackData: `${ACTION_PREFIX}${ADMIN_MANAGEMENT_ACTIONS.ADD}` },
      { text: 'РР·РјРµРЅРёС‚СЊ СЂРѕР»СЊ', callbackData: `${ACTION_PREFIX}${ADMIN_MANAGEMENT_ACTIONS.CHANGE_ROLE}` },
      { text: 'РћС‚РєР»СЋС‡РёС‚СЊ Р°РґРјРёРЅР°', callbackData: `${ACTION_PREFIX}${ADMIN_MANAGEMENT_ACTIONS.DEACTIVATE}` },
    ],
    {
      cancelCallbackData: ADMIN_CALLBACKS.MENU,
      cancelText: 'РќР°Р·Р°Рґ',
    },
  );
}

function buildAdminTargetKeyboard(admins) {
  return getAdminOptionKeyboard(
    admins.map((admin) => ({
      text: buildAdminTargetLabel(admin),
      callbackData: `${TARGET_PREFIX}${admin.id}`,
    })),
    {
      cancelCallbackData: ADMIN_CALLBACKS.MENU,
      cancelText: 'РќР°Р·Р°Рґ',
    },
  );
}

function buildAdminTargetLabel(admin) {
  const baseLabel =
    admin.displayName ||
    admin.user?.username ||
    admin.user?.firstName ||
    admin.user?.telegramId ||
    'РђРґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂ';
  const roleLabel = formatAdminRoleLabel(admin.role);
  const label = `${baseLabel} / ${roleLabel}`;

  return label.length > 55 ? `${label.slice(0, 52)}...` : label;
}

function buildRoleKeyboard() {
  return getAdminOptionKeyboard(
    [
      { text: 'super_admin', callbackData: `${ROLE_PREFIX}${AdminRole.FULL}` },
      { text: 'operator_admin', callbackData: `${ROLE_PREFIX}${AdminRole.LIMITED}` },
    ],
    {
      cancelCallbackData: ADMIN_CALLBACKS.MENU,
      cancelText: 'РќР°Р·Р°Рґ',
    },
  );
}

function buildActionMenuText() {
  return [
    'РђРґРјРёРЅС‹',
    'Р’С‹Р±РµСЂРё РґРµР№СЃС‚РІРёРµ.',
  ].join('\n');
}

function buildAddConfirmText(state) {
  return [
    'РџРѕРґС‚РІРµСЂРґРёС‚СЊ РґРѕР±Р°РІР»РµРЅРёРµ Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂР°?',
    '',
    `Telegram ID: ${state.targetTelegramId}`,
    `Р РѕР»СЊ: ${formatAdminRoleLabel(state.selectedRole)}`,
  ].join('\n');
}

function buildChangeRoleConfirmText(state) {
  return [
    'РџРѕРґС‚РІРµСЂРґРёС‚СЊ РёР·РјРµРЅРµРЅРёРµ СЂРѕР»Рё?',
    '',
    formatAdminAccountSummary(state.targetAdmin),
    `РќРѕРІР°СЏ СЂРѕР»СЊ: ${formatAdminRoleLabel(state.selectedRole)}`,
  ].join('\n');
}

function buildDeactivateConfirmText(admin) {
  return [
    'РћС‚РєР»СЋС‡РёС‚СЊ РґРѕСЃС‚СѓРї Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂР°?',
    '',
    formatAdminAccountSummary(admin),
  ].join('\n');
}

async function showActionMenu(ctx) {
  await renderAdminPanel(ctx, buildActionMenuText(), buildActionKeyboard());
}

export function createAdminAdminScene() {
  return new Scenes.WizardScene(
    ADMIN_ADMIN_SCENE_ID,
    async (ctx) => {
      const state = getSceneState(ctx);
      const rootAdmin = await ctx.state.services.adminService.assertRootAdmin(ctx.from.id);

      state.rootAdmin = rootAdmin;
      state.action = null;
      state.targetAdmin = null;
      state.targetOptions = [];
      state.targetTelegramId = null;
      state.selectedRole = null;

      await showActionMenu(ctx);
      return ctx.wizard.next();
    },
    async (ctx) => {
      const state = getSceneState(ctx);

      if (await maybeLeaveAdminScene(ctx, state.rootAdmin)) {
        return undefined;
      }

      const action = extractCallbackValue(ctx, ACTION_PREFIX);

      if (!action) {
        await answerAdminCallback(ctx, 'Р’С‹Р±РµСЂРё РґРµР№СЃС‚РІРёРµ РєРЅРѕРїРєРѕР№ РЅРёР¶Рµ.', true);
        return undefined;
      }

      state.action = action;

      if (action === ADMIN_MANAGEMENT_ACTIONS.LIST) {
        const admins = await ctx.state.services.adminService.listAdmins({ includeInactive: true });

        await answerAdminCallback(ctx);
        await renderAdminPanel(
          ctx,
          formatAdminAccountsList(admins, 'РђРґРјРёРЅС‹'),
          getAdminBackKeyboard(ADMIN_CALLBACKS.ADMINS_MENU, 'РќР°Р·Р°Рґ'),
        );
        await ctx.scene.leave();
        return undefined;
      }

      if (action === ADMIN_MANAGEMENT_ACTIONS.ADD) {
        await answerAdminCallback(ctx);
        await renderAdminPanel(
          ctx,
          'Р’РІРµРґРё Telegram ID РЅРѕРІРѕРіРѕ Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂР°.',
          getAdminCancelKeyboard(),
        );
        return ctx.wizard.selectStep(2);
      }

      const targetOptions = await ctx.state.services.adminService.listManageableAdmins(ctx.from.id);

      if (targetOptions.length === 0) {
        await answerAdminCallback(ctx);
        await leaveAdminScene(
          ctx,
          state.rootAdmin,
          action === ADMIN_MANAGEMENT_ACTIONS.CHANGE_ROLE
            ? 'РЎРµР№С‡Р°СЃ РЅРµС‚ Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂРѕРІ РґР»СЏ РёР·РјРµРЅРµРЅРёСЏ СЂРѕР»Рё.'
            : 'РЎРµР№С‡Р°СЃ РЅРµС‚ Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂРѕРІ РґР»СЏ РѕС‚РєР»СЋС‡РµРЅРёСЏ.',
        );
        return undefined;
      }

      state.targetOptions = targetOptions;

      await answerAdminCallback(ctx);
      await renderAdminPanel(
        ctx,
        action === ADMIN_MANAGEMENT_ACTIONS.CHANGE_ROLE
          ? 'Р’С‹Р±РµСЂРё Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂР° РґР»СЏ РёР·РјРµРЅРµРЅРёСЏ СЂРѕР»Рё.'
          : 'Р’С‹Р±РµСЂРё Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂР° РґР»СЏ РѕС‚РєР»СЋС‡РµРЅРёСЏ.',
        buildAdminTargetKeyboard(targetOptions),
      );

      return ctx.wizard.selectStep(3);
    },
    async (ctx) => {
      const state = getSceneState(ctx);

      if (await maybeLeaveAdminScene(ctx, state.rootAdmin)) {
        return undefined;
      }

      const text = getAdminText(ctx);

      if (!text) {
        await renderAdminPanel(
          ctx,
          'Р’РІРµРґРё Telegram ID РЅРѕРІРѕРіРѕ Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂР°.',
          getAdminCancelKeyboard(),
        );
        return undefined;
      }

      try {
        state.targetTelegramId = normalizeTelegramId(text);
      } catch (error) {
        if (error instanceof ValidationError) {
          await renderAdminPanel(ctx, error.message, getAdminCancelKeyboard());
          return undefined;
        }

        throw error;
      }

      await renderAdminPanel(
        ctx,
        'Р’С‹Р±РµСЂРё СЂРѕР»СЊ.',
        buildRoleKeyboard(),
      );

      return ctx.wizard.selectStep(4);
    },
    async (ctx) => {
      const state = getSceneState(ctx);

      if (await maybeLeaveAdminScene(ctx, state.rootAdmin)) {
        return undefined;
      }

      const targetAdminId = extractCallbackValue(ctx, TARGET_PREFIX);

      if (!targetAdminId) {
        await answerAdminCallback(ctx, 'Р’С‹Р±РµСЂРё Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂР° РєРЅРѕРїРєРѕР№ РЅРёР¶Рµ.', true);
        return undefined;
      }

      const targetAdmin = state.targetOptions.find((admin) => admin.id === targetAdminId);

      if (!targetAdmin) {
        await answerAdminCallback(ctx, 'РђРґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂ РЅРµ РЅР°Р№РґРµРЅ.', true);
        return undefined;
      }

      state.targetAdmin = targetAdmin;

      await answerAdminCallback(ctx);

      if (state.action === ADMIN_MANAGEMENT_ACTIONS.DEACTIVATE) {
        await renderAdminPanel(
          ctx,
          buildDeactivateConfirmText(targetAdmin),
          getAdminConfirmKeyboard('РћС‚РєР»СЋС‡РёС‚СЊ РґРѕСЃС‚СѓРї'),
        );

        return ctx.wizard.selectStep(5);
      }

      await renderAdminPanel(
        ctx,
        [
          formatAdminAccountSummary(targetAdmin),
          '',
          'Р’С‹Р±РµСЂРё РЅРѕРІСѓСЋ СЂРѕР»СЊ.',
        ].join('\n'),
        buildRoleKeyboard(),
      );

      return ctx.wizard.selectStep(4);
    },
    async (ctx) => {
      const state = getSceneState(ctx);

      if (await maybeLeaveAdminScene(ctx, state.rootAdmin)) {
        return undefined;
      }

      const selectedRole = extractCallbackValue(ctx, ROLE_PREFIX);

      if (!selectedRole) {
        await answerAdminCallback(ctx, 'Р’С‹Р±РµСЂРё СЂРѕР»СЊ РєРЅРѕРїРєРѕР№ РЅРёР¶Рµ.', true);
        return undefined;
      }

      state.selectedRole = selectedRole;

      await answerAdminCallback(ctx);
      await renderAdminPanel(
        ctx,
        state.action === ADMIN_MANAGEMENT_ACTIONS.ADD
          ? buildAddConfirmText(state)
          : buildChangeRoleConfirmText(state),
        getAdminConfirmKeyboard(
          state.action === ADMIN_MANAGEMENT_ACTIONS.ADD ? 'Р”РѕР±Р°РІРёС‚СЊ Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂР°' : 'РР·РјРµРЅРёС‚СЊ СЂРѕР»СЊ',
        ),
      );

      return ctx.wizard.selectStep(5);
    },
    async (ctx) => {
      const state = getSceneState(ctx);

      if (await maybeLeaveAdminScene(ctx, state.rootAdmin)) {
        return undefined;
      }

      if (getAdminCallbackData(ctx) !== ADMIN_CALLBACKS.SCENE_CONFIRM) {
        await answerAdminCallback(ctx, 'РџРѕРґС‚РІРµСЂРґРё РґРµР№СЃС‚РІРёРµ РєРЅРѕРїРєРѕР№ РЅРёР¶Рµ.', true);
        return undefined;
      }

      try {
        await answerAdminCallback(ctx);

        if (state.action === ADMIN_MANAGEMENT_ACTIONS.ADD) {
          const admin = await ctx.state.services.adminService.createManagedAdmin({
            actorId: ctx.from.id,
            telegramId: state.targetTelegramId,
            role: state.selectedRole,
          });

          await leaveAdminScene(
            ctx,
            state.rootAdmin,
            `РђРґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂ РґРѕР±Р°РІР»РµРЅ.\n\n${formatAdminAccountSummary(admin)}`,
          );
          return undefined;
        }

        if (state.action === ADMIN_MANAGEMENT_ACTIONS.CHANGE_ROLE) {
          const admin = await ctx.state.services.adminService.updateManagedAdminRole({
            actorId: ctx.from.id,
            adminId: state.targetAdmin.id,
            role: state.selectedRole,
          });

          await leaveAdminScene(
            ctx,
            state.rootAdmin,
            `Р РѕР»СЊ РѕР±РЅРѕРІР»РµРЅР°.\n\n${formatAdminAccountSummary(admin)}`,
          );
          return undefined;
        }

        const admin = await ctx.state.services.adminService.deactivateManagedAdmin({
          actorId: ctx.from.id,
          adminId: state.targetAdmin.id,
        });

        await leaveAdminScene(
          ctx,
          state.rootAdmin,
          `Р”РѕСЃС‚СѓРї Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂР° РѕС‚РєР»СЋС‡С‘РЅ.\n\n${formatAdminAccountSummary(admin)}`,
        );
        return undefined;
      } catch (error) {
        if (error instanceof ValidationError) {
          if (state.action === ADMIN_MANAGEMENT_ACTIONS.ADD) {
            await renderAdminPanel(
              ctx,
              `${error.message}\n\nР’РІРµРґРё Telegram ID РЅРѕРІРѕРіРѕ Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂР°.`,
              getAdminCancelKeyboard(),
            );
            ctx.wizard.selectStep(2);
            return undefined;
          }

          await leaveAdminScene(ctx, state.rootAdmin, error.message);
          return undefined;
        }

        throw error;
      }
    },
  );
}
```

[src/bot/handlers/adminHandlers.js](/C:\Users\PC\OneDrive\Desktop\cerca trova bot\src\bot\handlers\adminHandlers.js)
`$lang
import { createReadStream } from 'node:fs';

import {
  ADMIN_PERMISSIONS,
  AUDIT_ACTIONS,
  BOT_TEXTS,
} from '../../utils/constants.js';
import { ForbiddenError } from '../../utils/errors.js';
import {
  formatAdminBookingList,
  formatAdminDebtorsList,
} from '../../utils/formatters.js';
import {
  ADMIN_CALLBACKS,
  getAdminBackKeyboard,
  getAdminOptionKeyboard,
} from '../keyboards/admin.js';
import { getMainMenuKeyboard } from '../keyboards/mainMenu.js';
import { ADMIN_ADMIN_SCENE_ID } from '../scenes/adminAdminScene.js';
import { ADMIN_BOUTIQUE_SCENE_ID } from '../scenes/adminBoutiqueScene.js';
import {
  renderAdminPanel,
  showAdminMenu,
} from '../scenes/adminShared.js';
import { ADMIN_SLOT_SCENE_ID } from '../scenes/adminSlotScene.js';
import { ADMIN_TIME_SLOT_SCENE_ID } from '../scenes/adminTimeSlotScene.js';
import { ADMIN_USER_SCENE_ID } from '../scenes/adminUserScene.js';

const AWAITING_PDF_UPLOAD_KEY = 'registration_welcome_pdf';

function getBackToMenuKeyboard() {
  return getAdminBackKeyboard(ADMIN_CALLBACKS.MENU, 'РќР°Р·Р°Рґ');
}

function buildPdfUploadText(prefix = '') {
  const lines = [];

  if (prefix) {
    lines.push(prefix, '');
  }

  lines.push('РћС‚РїСЂР°РІСЊС‚Рµ PDF РѕРґРЅРёРј СЃРѕРѕР±С‰РµРЅРёРµРј.');
  lines.push('РџРѕСЃР»Рµ Р·Р°РіСЂСѓР·РєРё РѕРЅ СЃС‚Р°РЅРµС‚ Р°РєС‚РёРІРЅС‹Рј.');

  return lines.join('\n');
}

async function rejectAccess(ctx, message = BOT_TEXTS.ADMIN_ONLY) {
  if (ctx.callbackQuery) {
    await ctx.answerCbQuery(message, {
      show_alert: true,
    });
    return;
  }

  await ctx.reply(message, getMainMenuKeyboard());
}

async function resolveAdmin(ctx, permission = null) {
  try {
    if (permission) {
      return await ctx.state.services.adminService.assertPermission(ctx.from.id, permission);
    }

    return await ctx.state.services.adminService.getAdminByActorId(ctx.from.id);
  } catch (error) {
    if (error instanceof ForbiddenError) {
      await rejectAccess(ctx, error.message);
      return null;
    }

    throw error;
  }
}

async function resolveRootAdmin(ctx) {
  try {
    return await ctx.state.services.adminService.assertRootAdmin(ctx.from.id);
  } catch (error) {
    if (error instanceof ForbiddenError) {
      await rejectAccess(ctx, error.message);
      return null;
    }

    throw error;
  }
}

async function logAdminAction(services, admin, action, comment, extra = {}) {
  await services.googleSheets.logAdminAction({
    action,
    adminId: admin.user.telegramId,
    comment,
    ...extra,
  });
}

export function registerAdminHandlers(bot, { services, env }) {
  bot.command('admin', async (ctx) => {
    const admin = await resolveAdmin(ctx);

    if (!admin) {
      return;
    }

    await showAdminMenu(ctx, admin);
  });

  bot.command('upload_registration_pdf', async (ctx) => {
    const admin = await resolveAdmin(ctx, ADMIN_PERMISSIONS.MANAGE_PDFS);

    if (!admin) {
      return;
    }

    ctx.session ??= {};
    ctx.session.awaitingPdfUpload = AWAITING_PDF_UPLOAD_KEY;

    await renderAdminPanel(
      ctx,
      buildPdfUploadText(),
      getBackToMenuKeyboard(),
    );
  });

  const openMenuHandler = async (ctx) => {
    const admin = await resolveAdmin(ctx);

    if (!admin) {
      return;
    }

    await ctx.answerCbQuery();
    await showAdminMenu(ctx, admin);
  };

  bot.action(ADMIN_CALLBACKS.MENU, openMenuHandler);
  bot.action(ADMIN_CALLBACKS.REFRESH, openMenuHandler);

  bot.action(ADMIN_CALLBACKS.BOOKINGS_RECENT, async (ctx) => {
    const admin = await resolveAdmin(ctx, ADMIN_PERMISSIONS.VIEW_BOOKINGS);

    if (!admin) {
      return;
    }

    await ctx.answerCbQuery();

    const bookings = await services.bookingService.listRecentBookings(20);

    await renderAdminPanel(
      ctx,
      formatAdminBookingList(bookings, 'РџРѕСЃР»РµРґРЅРёРµ Р·Р°СЏРІРєРё', 'РџРѕРєР° Р·Р°СЏРІРѕРє РЅРµС‚.'),
      getBackToMenuKeyboard(),
    );

    await logAdminAction(
      services,
      admin,
      AUDIT_ACTIONS.VIEW_RECENT_BOOKINGS,
      'РџСЂРѕСЃРјРѕС‚СЂ РїРѕСЃР»РµРґРЅРёС… Р·Р°СЏРІРѕРє',
    );
  });

  bot.action(ADMIN_CALLBACKS.BOOKINGS_TODAY, async (ctx) => {
    const admin = await resolveAdmin(ctx, ADMIN_PERMISSIONS.VIEW_BOOKINGS);

    if (!admin) {
      return;
    }

    await ctx.answerCbQuery();

    const bookings = await services.bookingService.listTodayBookings(50);

    await renderAdminPanel(
      ctx,
      formatAdminBookingList(bookings, 'Р—Р°СЏРІРєРё Р·Р° СЃРµРіРѕРґРЅСЏ', 'РЎРµРіРѕРґРЅСЏ Р·Р°СЏРІРѕРє РїРѕРєР° РЅРµС‚.'),
      getBackToMenuKeyboard(),
    );

    await logAdminAction(
      services,
      admin,
      AUDIT_ACTIONS.VIEW_TODAY_BOOKINGS,
      'РџСЂРѕСЃРјРѕС‚СЂ Р·Р°СЏРІРѕРє Р·Р° СЃРµРіРѕРґРЅСЏ',
    );
  });

  bot.action(ADMIN_CALLBACKS.DEBTORS, async (ctx) => {
    const admin = await resolveAdmin(ctx, ADMIN_PERMISSIONS.VIEW_DEBTORS);

    if (!admin) {
      return;
    }

    await ctx.answerCbQuery();

    const timers = await services.timerService.listOverdueTimers(20);

    await renderAdminPanel(
      ctx,
      formatAdminDebtorsList(timers, env.RETURN_ADMIN_ALERT_DAYS),
      getBackToMenuKeyboard(),
    );

    await logAdminAction(
      services,
      admin,
      AUDIT_ACTIONS.VIEW_DEBTORS,
      'РџСЂРѕСЃРјРѕС‚СЂ РґРѕР»Р¶РЅРёРєРѕРІ РїРѕ РІРµС‰Р°Рј',
    );
  });

  bot.action(ADMIN_CALLBACKS.USERS_MENU, async (ctx) => {
    const admin = await resolveAdmin(ctx, ADMIN_PERMISSIONS.MANAGE_USERS);

    if (!admin) {
      return;
    }

    await ctx.answerCbQuery();
    await renderAdminPanel(
      ctx,
      'РџРѕР»СЊР·РѕРІР°С‚РµР»Рё\nР’С‹Р±РµСЂРё РґРµР№СЃС‚РІРёРµ.',
      getAdminOptionKeyboard(
        [
          { text: 'Р—Р°Р±Р»РѕРєРёСЂРѕРІР°С‚СЊ', callbackData: ADMIN_CALLBACKS.USER_BLOCK },
          { text: 'Р Р°Р·Р±Р»РѕРєРёСЂРѕРІР°С‚СЊ', callbackData: ADMIN_CALLBACKS.USER_UNBLOCK },
        ],
        {
          cancelCallbackData: ADMIN_CALLBACKS.MENU,
          cancelText: 'РќР°Р·Р°Рґ',
        },
      ),
    );
  });

  bot.action(ADMIN_CALLBACKS.BOUTIQUES_MENU, async (ctx) => {
    const admin = await resolveAdmin(ctx, ADMIN_PERMISSIONS.MANAGE_BOUTIQUES);

    if (!admin) {
      return;
    }

    await ctx.answerCbQuery();
    await renderAdminPanel(
      ctx,
      'Р‘СѓС‚РёРєРё\nР’С‹Р±РµСЂРё РґРµР№СЃС‚РІРёРµ.',
      getAdminOptionKeyboard(
        [
          { text: 'Р”РѕР±Р°РІРёС‚СЊ Р±СѓС‚РёРє', callbackData: ADMIN_CALLBACKS.BOUTIQUE_ADD },
          { text: 'РЈРґР°Р»РёС‚СЊ Р±СѓС‚РёРє', callbackData: ADMIN_CALLBACKS.BOUTIQUE_REMOVE },
        ],
        {
          cancelCallbackData: ADMIN_CALLBACKS.MENU,
          cancelText: 'РќР°Р·Р°Рґ',
        },
      ),
    );
  });

  bot.action(ADMIN_CALLBACKS.TIME_SLOTS_MENU, async (ctx) => {
    const admin = await resolveAdmin(ctx, ADMIN_PERMISSIONS.MANAGE_TIME_SLOTS);

    if (!admin) {
      return;
    }

    await ctx.answerCbQuery();
    await renderAdminPanel(
      ctx,
      'РЎР»РѕС‚С‹\nР’С‹Р±РµСЂРё РґРµР№СЃС‚РІРёРµ.',
      getAdminOptionKeyboard(
        [
          { text: 'Р”РѕР±Р°РІРёС‚СЊ СЃР»РѕС‚', callbackData: ADMIN_CALLBACKS.TIME_SLOT_ADD },
          { text: 'РЈРґР°Р»РёС‚СЊ СЃР»РѕС‚', callbackData: ADMIN_CALLBACKS.TIME_SLOT_REMOVE },
        ],
        {
          cancelCallbackData: ADMIN_CALLBACKS.MENU,
          cancelText: 'РќР°Р·Р°Рґ',
        },
      ),
    );
  });

  bot.action(ADMIN_CALLBACKS.ADMINS_MENU, async (ctx) => {
    const admin = await resolveRootAdmin(ctx);

    if (!admin) {
      return;
    }

    await ctx.answerCbQuery();
    await ctx.scene.enter(ADMIN_ADMIN_SCENE_ID);
  });

  bot.action(ADMIN_CALLBACKS.SLOT_CLOSE, async (ctx) => {
    const admin = await resolveAdmin(ctx, ADMIN_PERMISSIONS.MANAGE_SLOTS);

    if (!admin) {
      return;
    }

    await ctx.answerCbQuery();
    await ctx.scene.enter(ADMIN_SLOT_SCENE_ID, { mode: 'close' });
  });

  bot.action(ADMIN_CALLBACKS.SLOT_OPEN, async (ctx) => {
    const admin = await resolveAdmin(ctx, ADMIN_PERMISSIONS.MANAGE_SLOTS);

    if (!admin) {
      return;
    }

    await ctx.answerCbQuery();
    await ctx.scene.enter(ADMIN_SLOT_SCENE_ID, { mode: 'open' });
  });

  bot.action(ADMIN_CALLBACKS.USER_BLOCK, async (ctx) => {
    const admin = await resolveAdmin(ctx, ADMIN_PERMISSIONS.MANAGE_USERS);

    if (!admin) {
      return;
    }

    await ctx.answerCbQuery();
    await ctx.scene.enter(ADMIN_USER_SCENE_ID, { mode: 'block' });
  });

  bot.action(ADMIN_CALLBACKS.USER_UNBLOCK, async (ctx) => {
    const admin = await resolveAdmin(ctx, ADMIN_PERMISSIONS.MANAGE_USERS);

    if (!admin) {
      return;
    }

    await ctx.answerCbQuery();
    await ctx.scene.enter(ADMIN_USER_SCENE_ID, { mode: 'unblock' });
  });

  bot.action(ADMIN_CALLBACKS.PDF_UPLOAD, async (ctx) => {
    const admin = await resolveAdmin(ctx, ADMIN_PERMISSIONS.MANAGE_PDFS);

    if (!admin) {
      return;
    }

    ctx.session ??= {};
    ctx.session.awaitingPdfUpload = AWAITING_PDF_UPLOAD_KEY;

    await ctx.answerCbQuery();
    await renderAdminPanel(
      ctx,
      buildPdfUploadText(),
      getBackToMenuKeyboard(),
    );
  });

  bot.action(ADMIN_CALLBACKS.EXPORT_DATA, async (ctx) => {
    const admin = await resolveAdmin(ctx, ADMIN_PERMISSIONS.EXPORT_DATA);

    if (!admin) {
      return;
    }

    await ctx.answerCbQuery('Р“РѕС‚РѕРІР»СЋ CSV...');

    const exportResult = await services.adminService.exportDataToCsv(ctx.from.id);

    await ctx.replyWithDocument(
      {
        source: createReadStream(exportResult.filePath),
        filename: exportResult.fileName,
      },
      {
        caption: `Р“РѕС‚РѕРІРѕ. Р’ РІС‹РіСЂСѓР·РєРµ ${exportResult.rowsCount} СЃС‚СЂРѕРє.`,
      },
    );

    await showAdminMenu(ctx, admin, 'Р’С‹РіСЂСѓР·РєР° РѕС‚РїСЂР°РІР»РµРЅР°.');
    await logAdminAction(
      services,
      admin,
      AUDIT_ACTIONS.DATA_EXPORTED,
      `Р’С‹РіСЂСѓР¶РµРЅ CSV ${exportResult.fileName}, СЃС‚СЂРѕРє: ${exportResult.rowsCount}`,
    );
  });

  bot.action(ADMIN_CALLBACKS.BOUTIQUE_ADD, async (ctx) => {
    const admin = await resolveAdmin(ctx, ADMIN_PERMISSIONS.MANAGE_BOUTIQUES);

    if (!admin) {
      return;
    }

    await ctx.answerCbQuery();
    await ctx.scene.enter(ADMIN_BOUTIQUE_SCENE_ID, { mode: 'add' });
  });

  bot.action(ADMIN_CALLBACKS.BOUTIQUE_REMOVE, async (ctx) => {
    const admin = await resolveAdmin(ctx, ADMIN_PERMISSIONS.MANAGE_BOUTIQUES);

    if (!admin) {
      return;
    }

    await ctx.answerCbQuery();
    await ctx.scene.enter(ADMIN_BOUTIQUE_SCENE_ID, { mode: 'remove' });
  });

  bot.action(ADMIN_CALLBACKS.TIME_SLOT_ADD, async (ctx) => {
    const admin = await resolveAdmin(ctx, ADMIN_PERMISSIONS.MANAGE_TIME_SLOTS);

    if (!admin) {
      return;
    }

    await ctx.answerCbQuery();
    await ctx.scene.enter(ADMIN_TIME_SLOT_SCENE_ID, { mode: 'add' });
  });

  bot.action(ADMIN_CALLBACKS.TIME_SLOT_REMOVE, async (ctx) => {
    const admin = await resolveAdmin(ctx, ADMIN_PERMISSIONS.MANAGE_TIME_SLOTS);

    if (!admin) {
      return;
    }

    await ctx.answerCbQuery();
    await ctx.scene.enter(ADMIN_TIME_SLOT_SCENE_ID, { mode: 'remove' });
  });

  bot.on('document', async (ctx, next) => {
    const awaitingUpload = ctx.session?.awaitingPdfUpload === AWAITING_PDF_UPLOAD_KEY;

    if (!awaitingUpload) {
      return next();
    }

    const admin = await resolveAdmin(ctx, ADMIN_PERMISSIONS.MANAGE_PDFS);

    if (!admin) {
      return undefined;
    }

    const document = ctx.message.document;

    if (document.mime_type !== 'application/pdf') {
      await renderAdminPanel(
        ctx,
        buildPdfUploadText('РќСѓР¶РµРЅ РёРјРµРЅРЅРѕ PDF-С„Р°Р№Р». РџРѕРїСЂРѕР±СѓР№С‚Рµ РµС‰Рµ СЂР°Р·.'),
        getBackToMenuKeyboard(),
      );
      return undefined;
    }

    await services.pdfStorage.saveRegistrationTemplatePdf({
      adminId: admin.id,
      fileId: document.file_id,
      fileName: document.file_name ?? 'registration.pdf',
      mimeType: document.mime_type,
    });

    ctx.session ??= {};
    delete ctx.session.awaitingPdfUpload;

    await showAdminMenu(
      ctx,
      admin,
      'PDF СЃРѕС…СЂР°РЅС‘РЅ.',
    );

    await logAdminAction(
      services,
      admin,
      AUDIT_ACTIONS.PDF_UPLOADED,
      `Р—Р°РіСЂСѓР¶РµРЅ PDF ${document.file_name ?? 'registration.pdf'}`,
      {
        pdfFileId: document.file_id,
      },
    );

    return undefined;
  });
}
```

[src/bot/index.js](/C:\Users\PC\OneDrive\Desktop\cerca trova bot\src\bot\index.js)
`$lang
import { Scenes, Telegraf, session } from 'telegraf';

import { registerCommands } from './commands.js';
import { registerAdminHandlers } from './handlers/adminHandlers.js';
import { registerMenuHandlers } from './handlers/menuHandlers.js';
import { createContextMiddleware } from './middlewares/context.js';
import { registerErrorHandler } from './middlewares/errorHandler.js';
import { createLoggingMiddleware } from './middlewares/logging.js';
import { createAdminBoutiqueScene } from './scenes/adminBoutiqueScene.js';
import { createAdminAdminScene } from './scenes/adminAdminScene.js';
import { createAdminSlotScene } from './scenes/adminSlotScene.js';
import { createAdminTimeSlotScene } from './scenes/adminTimeSlotScene.js';
import { createAdminUserScene } from './scenes/adminUserScene.js';
import { createBookingRescheduleScene } from './scenes/bookingRescheduleScene.js';
import { createBookingScene } from './scenes/bookingScene.js';
import { createRegistrationScene } from './scenes/registrationScene.js';

export async function createBot({ env, logger, services }) {
  const bot = new Telegraf(env.BOT_TOKEN);
  const stage = new Scenes.Stage([
    createRegistrationScene(),
    createBookingScene(),
    createBookingRescheduleScene(),
    createAdminAdminScene(),
    createAdminSlotScene(),
    createAdminUserScene(),
    createAdminBoutiqueScene(),
    createAdminTimeSlotScene(),
  ]);

  registerErrorHandler(bot, { logger });

  bot.use(createLoggingMiddleware({ logger }));
  bot.use(createContextMiddleware({ env, logger, services }));
  bot.use(session());
  bot.use(stage.middleware());

  registerCommands(bot, { env, services });
  registerAdminHandlers(bot, { env, services });
  registerMenuHandlers(bot, { env, services });

  await bot.telegram.setMyCommands([
    { command: 'start', description: 'Р—Р°РїСѓСЃС‚РёС‚СЊ Р±РѕС‚Р°' },
    { command: 'booking', description: 'РЎРѕР·РґР°С‚СЊ Р·Р°СЏРІРєСѓ' },
    { command: 'menu', description: 'РџРѕРєР°Р·Р°С‚СЊ РіР»Р°РІРЅРѕРµ РјРµРЅСЋ' },
    { command: 'help', description: 'РџРѕРјРѕС‰СЊ' },
    { command: 'registration', description: 'РџСЂРѕР№С‚Рё СЂРµРіРёСЃС‚СЂР°С†РёСЋ' },
    { command: 'admin', description: 'РћС‚РєСЂС‹С‚СЊ Р°РґРјРёРЅРєСѓ' },
  ]);

  return bot;
}
```


