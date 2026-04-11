# Cleanup Test Data Changes

## scripts/cleanupTestData.js

`$(System.Collections.Hashtable.Lang)
import { loadEnvFiles } from '../src/config/loadEnv.js';
import { isInternalBoutique } from '../src/utils/boutiques.js';
import { normalizeTelegramId } from '../src/utils/validators.js';

loadEnvFiles();

let prisma;
let connectPrisma;
let disconnectPrisma;
let logger;

const TEST_FULL_NAMES = new Set(['Integration Test']);
const TEST_TELEGRAM_IDS = new Set(['9586763375']);
const TEST_USERNAME_PREFIXES = Object.freeze(['itest']);

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeUsername(value) {
  return normalizeText(value).replace(/^@/, '').toLowerCase();
}

function hasTestUsername(value) {
  const normalized = normalizeUsername(value);

  if (!normalized) {
    return false;
  }

  return TEST_USERNAME_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

function isConfiguredTestFullName(value) {
  return TEST_FULL_NAMES.has(normalizeText(value));
}

function isConfiguredTestTelegramId(value) {
  const normalized = normalizeText(value);
  return normalized ? TEST_TELEGRAM_IDS.has(normalized) : false;
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

  if (booking.boutique && isInternalBoutique(booking.boutique)) {
    reasons.push('internal_boutique');
  }

  if (isConfiguredTestFullName(registration?.fullName)) {
    reasons.push('integration_test_full_name');
  }

  if (hasTestUsername(booking.user?.username) || hasTestUsername(registration?.telegramUsername)) {
    reasons.push('itest_username');
  }

  if (isConfiguredTestTelegramId(booking.user?.telegramId)) {
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
  const integrationUserCount = candidates.filter((candidate) => (
    candidate.cleanupReasons.includes('integration_test_full_name') ||
    candidate.cleanupReasons.includes('itest_username') ||
    candidate.cleanupReasons.includes('test_telegram_id')
  )).length;
  const explicitFilterCount = candidates.filter((candidate) => (
    candidate.cleanupReasons.includes('explicit_telegram_id_match') ||
    candidate.cleanupReasons.includes('explicit_public_id_match')
  )).length;

  console.log(`Mode: ${options.apply ? 'apply' : 'dry-run'}`);
  console.log(`Cleanup candidates: ${candidates.length}`);
  console.log(`Active candidates: ${activeCount}`);
  console.log(`Matched by internal boutique: ${internalBoutiqueCount}`);
  console.log(`Matched by explicit test-user markers: ${integrationUserCount}`);
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
```

## scripts/cleanupTestBookings.js

`$(System.Collections.Hashtable.Lang)
import './cleanupTestData.js';
```

## package.json

`$(System.Collections.Hashtable.Lang)
{
  "name": "cerca-trova-bot",
  "version": "1.0.0",
  "description": "Telegram bot for creator registration, bookings, timers, Google Sheets sync, and admin workflows.",
  "private": true,
  "type": "module",
  "main": "src/index.js",
  "engines": {
    "node": ">=20.0.0"
  },
  "scripts": {
    "dev": "nodemon src/index.js",
    "start": "node src/index.js",
    "prisma:generate": "prisma generate",
    "prisma:migrate": "node scripts/prismaMigrate.js",
    "prisma:seed": "node prisma/seed.js",
    "prisma:studio": "prisma studio",
    "job:overdue": "node scripts/runOverdueCheck.js",
    "admin:create": "node scripts/createAdmin.js",
    "google-sheets:check": "node scripts/checkGoogleSheets.js",
    "cleanup:test-bookings": "node scripts/cleanupTestData.js",
    "cleanup:test-data": "node scripts/cleanupTestData.js",
    "cleanup:test-data:dry-run": "node scripts/cleanupTestData.js --dry-run",
    "cleanup:test-data:apply": "node scripts/cleanupTestData.js --apply"
  },
  "dependencies": {
    "@prisma/client": "6.19.3",
    "dayjs": "1.11.20",
    "dotenv": "17.4.1",
    "googleapis": "171.4.0",
    "nodemailer": "^7.0.3",
    "pino": "10.3.1",
    "telegraf": "4.16.3",
    "uuid": "13.0.0"
  },
  "devDependencies": {
    "nodemon": "3.1.14",
    "pino-pretty": "13.1.3",
    "prisma": "6.19.3"
  }
}
```

## README.md

`$(System.Collections.Hashtable.Lang)
# Cerca Trova Bot

Telegram-Р±РѕС‚ РЅР° `Node.js + Telegraf + Prisma + SQLite` РґР»СЏ РєСЂРµР°С‚РѕСЂРѕРІ Cerca Trova:

- СЂРµРіРёСЃС‚СЂР°С†РёСЏ
- Р·Р°РїРёСЃСЊ РІ Р±СѓС‚РёРє
- РґРѕСЃС‚Р°РІРєР°
- С‚Р°Р№РјРµСЂС‹ РїРѕ РІРµС‰Р°Рј
- PDF РїРѕСЃР»Рµ СЂРµРіРёСЃС‚СЂР°С†РёРё
- Google Sheets Р»РѕРіРёСЂРѕРІР°РЅРёРµ
- Р°РґРјРёРЅРєР° РІРЅСѓС‚СЂРё Р±РѕС‚Р°

## РўСЂРµР±РѕРІР°РЅРёСЏ

- Node.js 20+
- npm 10+
- Telegram bot token РґР»СЏ РїРѕР»РЅРѕС†РµРЅРЅРѕРіРѕ Р·Р°РїСѓСЃРєР° Р±РѕС‚Р°
- Google service account JSON РґР»СЏ Google Sheets, РµСЃР»Рё РЅСѓР¶РµРЅ РѕРЅР»Р°Р№РЅ-Р»РѕРі

## РЈСЃС‚Р°РЅРѕРІРєР°

```bash
npm install
npm run prisma:generate
```

## ENV

РЎРѕР·РґР°Р№С‚Рµ `.env` РёР»Рё `.env.local` РЅР° РѕСЃРЅРѕРІРµ `.env.example`.

РњРёРЅРёРјСѓРј РґР»СЏ Р»РѕРєР°Р»СЊРЅРѕР№ СЂР°Р·СЂР°Р±РѕС‚РєРё:

```env
NODE_ENV=development
LOG_LEVEL=debug
BOT_ENABLED=false
DATABASE_URL="file:./dev.db"
ADMIN_IDS=1731711996,846359286
DEFAULT_TIMEZONE=Europe/Moscow
PDF_STORAGE_MODE=local
PDF_STORAGE_DIR=storage/pdfs
RETURN_REMINDER_DAYS=5
RETURN_ADMIN_ALERT_DAYS=8
OVERDUE_CHECK_INTERVAL_MS=600000
DEFAULT_ADMIN_ROLE=LIMITED
```

РџРѕР»РЅРѕС†РµРЅРЅС‹Р№ Р·Р°РїСѓСЃРє Р±РѕС‚Р° СЃ Telegram:

```env
NODE_ENV=development
LOG_LEVEL=debug
BOT_ENABLED=true
BOT_TOKEN=123456:telegram-bot-token
BOT_USERNAME=@Creator_CercaTrova_bot
SUPPORT_CONTACT=@Creator_CercaTrova_bot
DATABASE_URL="file:./dev.db"
ADMIN_IDS=1731711996,846359286
DEFAULT_TIMEZONE=Europe/Moscow
PDF_STORAGE_MODE=local
PDF_STORAGE_DIR=storage/pdfs
RETURN_REMINDER_DAYS=5
RETURN_ADMIN_ALERT_DAYS=8
OVERDUE_CHECK_INTERVAL_MS=600000
DEFAULT_ADMIN_ROLE=LIMITED
```

Google Sheets РјРѕР¶РЅРѕ РїРѕРґРєР»СЋС‡РёС‚СЊ РїРѕР·Р¶Рµ. Р”Р»СЏ СЌС‚РѕРіРѕ РЅСѓР¶РЅС‹:

- `GOOGLE_SHEETS_SPREADSHEET_ID`
- `GOOGLE_SERVICE_ACCOUNT_JSON_PATH`
- `GOOGLE_SHEET_NAME`
- `DEFAULT_TIMEZONE`

Р•СЃР»Рё СЌС‚Рё РїРµСЂРµРјРµРЅРЅС‹Рµ РЅРµ Р·Р°РґР°РЅС‹, Р±РѕС‚ СЂР°Р±РѕС‚Р°РµС‚ Р±РµР· Google Sheets Рё РїСЂРѕСЃС‚Рѕ Р»РѕРіРёСЂСѓРµС‚ СЌС‚Рѕ РІ РєРѕРЅСЃРѕР»СЊ.

## Prisma Generate

```bash
npm run prisma:generate
```

## Prisma Migrate

Р›РѕРєР°Р»СЊРЅР°СЏ СЃРёРЅС…СЂРѕРЅРёР·Р°С†РёСЏ СЃС…РµРјС‹:

```bash
npm run prisma:migrate -- --name init
```

РЎРєСЂРёРїС‚ СЃРЅР°С‡Р°Р»Р° РїСЂРѕР±СѓРµС‚ РѕР±С‹С‡РЅС‹Р№ `prisma migrate dev`. Р•СЃР»Рё Prisma schema engine РїР°РґР°РµС‚ РЅР° Р»РѕРєР°Р»СЊРЅРѕРј Windows/OneDrive РѕРєСЂСѓР¶РµРЅРёРё, СЃРєСЂРёРїС‚ РёСЃРїРѕР»СЊР·СѓРµС‚ Р±РµР·РѕРїР°СЃРЅС‹Р№ fallback РґР»СЏ SQLite С‡РµСЂРµР· `prisma migrate diff` + `prisma db execute`.

Р’Р°Р¶РЅРѕ:

- РґР»СЏ SQLite РїСѓС‚СЊ РІ `DATABASE_URL` РґРѕР»Р¶РµРЅ Р±С‹С‚СЊ `file:./dev.db`
- Р·РЅР°С‡РµРЅРёРµ `file:./prisma/dev.db` РґР»СЏ СЃС…РµРјС‹ РІРЅСѓС‚СЂРё РїР°РїРєРё `prisma/` РЅРµРєРѕСЂСЂРµРєС‚РЅРѕ

## Seed

Seed СЃРѕР·РґР°РµС‚:

- РІСЃС‚СЂРѕРµРЅРЅС‹С… Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂРѕРІ
- Р±Р°Р·РѕРІС‹Рµ Р±СѓС‚РёРєРё
- Р±Р°Р·РѕРІС‹Рµ РІСЂРµРјРµРЅРЅС‹Рµ СЃР»РѕС‚С‹

Р—Р°РїСѓСЃРє:

```bash
npm run prisma:seed
```

## Р›РѕРєР°Р»СЊРЅС‹Р№ Р·Р°РїСѓСЃРє

РЎСѓС…РѕР№ Р»РѕРєР°Р»СЊРЅС‹Р№ Р·Р°РїСѓСЃРє Р±РµР· Telegram:

```bash
npm run dev
```

Р”Р»СЏ СЌС‚РѕРіРѕ РґРѕСЃС‚Р°С‚РѕС‡РЅРѕ РїРѕСЃС‚Р°РІРёС‚СЊ:

```env
BOT_ENABLED=false
```

РџРѕР»РЅРѕС†РµРЅРЅС‹Р№ Р·Р°РїСѓСЃРє Р±РѕС‚Р°:

```env
BOT_ENABLED=true
BOT_TOKEN=...
```

РљРѕРјР°РЅРґС‹:

```bash
npm run dev
npm start
```

## РљР°Рє Р·Р°РіСЂСѓР·РёС‚СЊ PDF

Р§РµСЂРµР· Р°РґРјРёРЅРєСѓ:

1. Р—Р°Р№РґРёС‚Рµ РІ Р±РѕС‚ РїРѕРґ `super_admin`
2. Р’С‹РїРѕР»РЅРёС‚Рµ `/admin`
3. РќР°Р¶РјРёС‚Рµ `Р—Р°РіСЂСѓР·РёС‚СЊ PDF`
4. РћС‚РїСЂР°РІСЊС‚Рµ PDF-С„Р°Р№Р» РѕРґРЅРёРј СЃРѕРѕР±С‰РµРЅРёРµРј

Р§РµСЂРµР· РєРѕРјР°РЅРґСѓ:

1. Р’С‹РїРѕР»РЅРёС‚Рµ `/upload_registration_pdf`
2. РћС‚РїСЂР°РІСЊС‚Рµ PDF СЃР»РµРґСѓСЋС‰РёРј СЃРѕРѕР±С‰РµРЅРёРµРј

РџРѕСЃР»Рµ СЌС‚РѕРіРѕ Р±РѕС‚ Р±СѓРґРµС‚ РѕС‚РїСЂР°РІР»СЏС‚СЊ СЌС‚РѕС‚ PDF РїРѕР»СЊР·РѕРІР°С‚РµР»СЋ СЃСЂР°Р·Сѓ РїРѕСЃР»Рµ СЂРµРіРёСЃС‚СЂР°С†РёРё.

## РљР°Рє РїРѕРґРєР»СЋС‡РёС‚СЊ Google Sheets credentials

1. РЎРѕР·РґР°Р№С‚Рµ service account РІ Google Cloud
2. РЎРєР°С‡Р°Р№С‚Рµ JSON credentials
3. РџРѕР»РѕР¶РёС‚Рµ С„Р°Р№Р», РЅР°РїСЂРёРјРµСЂ, РІ `./credentials/cerca-trova-492420-0a48860db884.json`
4. РЈРєР°Р¶РёС‚Рµ РїСѓС‚СЊ РІ `GOOGLE_SERVICE_ACCOUNT_JSON_PATH`
5. РћС‚РєСЂРѕР№С‚Рµ Google Spreadsheet
6. Р Р°СЃС€Р°СЂСЊС‚Рµ С‚Р°Р±Р»РёС†Сѓ РЅР° `service@cerca-trova-492420.iam.gserviceaccount.com`
7. РЈРєР°Р¶РёС‚Рµ `GOOGLE_SHEETS_SPREADSHEET_ID`
8. РЈРєР°Р¶РёС‚Рµ `GOOGLE_SHEET_NAME`
9. РџСЂРѕРІРµСЂСЊС‚Рµ РїРѕРґРєР»СЋС‡РµРЅРёРµ РєРѕРјР°РЅРґРѕР№ `npm run google-sheets:check`

Р‘РѕС‚ РїРёС€РµС‚ СЃРѕР±С‹С‚РёСЏ:

- `registration`
- `boutique_booking`
- `delivery_booking`
- `timer_event`
- `admin_action`

## РљР°Рє РґРѕР±Р°РІРёС‚СЊ Р°РґРјРёРЅР°

Р”РІР° Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂР° СЃРѕР·РґР°СЋС‚СЃСЏ Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєРё РїСЂРё СЃС‚Р°СЂС‚Рµ Рё РІ seed:

- `1731711996` вЂ” `super_admin`
- `846359286` вЂ” `operator_admin`

Р§С‚РѕР±С‹ РґРѕР±Р°РІРёС‚СЊ РµС‰Рµ РѕРґРЅРѕРіРѕ Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂР° РІСЂСѓС‡РЅСѓСЋ:

```bash
npm run admin:create -- 123456789 "РќРѕРІС‹Р№ Р°РґРјРёРЅ" FULL true
```

РђСЂРіСѓРјРµРЅС‚С‹:

- `telegramId`
- `displayName`
- `role` вЂ” `FULL` РёР»Рё `LIMITED`
- `receivesOverdueAlerts` вЂ” `true` РёР»Рё `false`

## РџРѕР»РµР·РЅС‹Рµ РєРѕРјР°РЅРґС‹

```bash
npm run dev
npm start
npm run prisma:generate
npm run prisma:migrate -- --name init
npm run prisma:seed
npm run prisma:studio
npm run job:overdue
npm run admin:create -- 123456789 "РќРѕРІС‹Р№ Р°РґРјРёРЅ" FULL true
npm run google-sheets:check
npm run cleanup:test-data:dry-run
npm run cleanup:test-data:apply
```

## РљР°Рє РѕС‡РёСЃС‚РёС‚СЊ С‚РµСЃС‚РѕРІС‹Рµ Р·Р°СЏРІРєРё

РЎРєСЂРёРїС‚ РѕС‡РёСЃС‚РєРё СЂР°Р±РѕС‚Р°РµС‚ РѕС‚РґРµР»СЊРЅРѕ РѕС‚ runtime-РєРѕРґР° Р±РѕС‚Р° Рё РїРѕ СѓРјРѕР»С‡Р°РЅРёСЋ СѓРґР°Р»СЏРµС‚ С‚РѕР»СЊРєРѕ Р·Р°СЏРІРєРё,
СЃРІСЏР·Р°РЅРЅС‹Рµ СЃ РІРЅСѓС‚СЂРµРЅРЅРёРјРё С‚РµСЃС‚РѕРІС‹РјРё Р±СѓС‚РёРєР°РјРё РІСЂРѕРґРµ `MOS_NOMAIL_*`, `MOS_RESCHE_*`, `MOS_SMTPFA_*`,
`TEST_*`, `DEBUG_*`, `INTERNAL_*`.

РЎРЅР°С‡Р°Р»Р° РІСЃРµРіРґР° СЃРјРѕС‚СЂРё РєР°РЅРґРёРґР°С‚РѕРІ:

```bash
npm run cleanup:test-data:dry-run
```

Р•СЃР»Рё СЃРїРёСЃРѕРє РІС‹РіР»СЏРґРёС‚ РєРѕСЂСЂРµРєС‚РЅРѕ, РїСЂРёРјРµРЅРё РѕС‡РёСЃС‚РєСѓ:

```bash
npm run cleanup:test-data:apply
```

Р”Р»СЏ С‚РѕС‡РµС‡РЅРѕР№ РѕС‡РёСЃС‚РєРё РјРѕР¶РЅРѕ РґРѕРїРѕР»РЅРёС‚РµР»СЊРЅРѕ СѓРєР°Р·Р°С‚СЊ СЏРІРЅС‹Р№ С„РёР»СЊС‚СЂ:

```bash
node scripts/cleanupTestData.js --dry-run --telegram-id 9586763375
node scripts/cleanupTestData.js --apply --public-id 8794ed5f-7300-424d-ae39-29e37754e903
```

Р§С‚Рѕ РґРµР»Р°РµС‚ СЃРєСЂРёРїС‚:

- РїРѕРєР°Р·С‹РІР°РµС‚ РєР°РЅРґРёРґР°С‚РѕРІ РЅР° СѓРґР°Р»РµРЅРёРµ Рё РїСЂРёС‡РёРЅС‹ РѕС‚Р±РѕСЂР°
- РІ СЂРµР¶РёРјРµ `apply` СЃРЅР°С‡Р°Р»Р° РѕС‚РІСЏР·С‹РІР°РµС‚ СЃРІСЏР·Р°РЅРЅС‹Рµ `UserItemTimer` Рё `UserPdf`
- Р·Р°С‚РµРј СѓРґР°Р»СЏРµС‚ СЃР°РјРё `Booking`
- Р·Р° СЃС‡С‘С‚ СѓРґР°Р»РµРЅРёСЏ Р·Р°РїРёСЃРё СЃР»РѕС‚ Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєРё РѕСЃРІРѕР±РѕР¶РґР°РµС‚СЃСЏ, РїРѕС‚РѕРјСѓ С‡С‚Рѕ С‚Р°РєР°СЏ booking Р±РѕР»СЊС€Рµ РЅРµ СѓС‡Р°СЃС‚РІСѓРµС‚ РІ РїСЂРѕРІРµСЂРєРµ Р·Р°РЅСЏС‚РѕСЃС‚Рё

## РљР°Рє РїСЂРѕРІРµСЂРёС‚СЊ Google Sheets

1. РџРѕР»РѕР¶РёС‚Рµ JSON credentials РІ `credentials/google-service-account.json`
2. Р—Р°РїРѕР»РЅРёС‚Рµ `.env` РёР»Рё `.env.local`:

```env
GOOGLE_SHEETS_SPREADSHEET_ID=1Y_uWyPkaRHunso8Av87ixrP2I9eqrYFPrHc-TzLV7AQ
GOOGLE_SERVICE_ACCOUNT_JSON_PATH=./credentials/cerca-trova-492420-0a48860db884.json
GOOGLE_SHEET_NAME=Sheet1
DEFAULT_TIMEZONE=Europe/Moscow
```

3. Р Р°СЃС€Р°СЂСЊС‚Рµ С‚Р°Р±Р»РёС†Сѓ РЅР° `client_email` РёР· service account JSON
4. Р’С‹РїРѕР»РЅРёС‚Рµ:

```bash
npm run google-sheets:check
```

Р•СЃР»Рё РїРѕРґРєР»СЋС‡РµРЅРёРµ РєРѕСЂСЂРµРєС‚РЅРѕРµ, СЃРєСЂРёРїС‚:

- РёРЅРёС†РёР°Р»РёР·РёСЂСѓРµС‚ Google Sheets СЃРµСЂРІРёСЃ
- СЃРѕР·РґР°СЃС‚ Р»РёСЃС‚, РµСЃР»Рё РµРіРѕ РµС‰С‘ РЅРµС‚
- СЃРѕР·РґР°СЃС‚ РёР»Рё РїРѕРїСЂР°РІРёС‚ Р·Р°РіРѕР»РѕРІРєРё
- РІС‹РІРµРґРµС‚ СѓСЃРїРµС€РЅС‹Р№ СЃС‚Р°С‚СѓСЃ РІ РєРѕРЅСЃРѕР»СЊ

РљР°Рє РїРѕРЅСЏС‚СЊ, С‡С‚Рѕ Р·Р°РїРёСЃСЊ РІ С‚Р°Р±Р»РёС†Сѓ СЂР°Р±РѕС‚Р°РµС‚:

- `npm run google-sheets:check` Р·Р°РІРµСЂС€Р°РµС‚СЃСЏ Р±РµР· РѕС€РёР±РєРё
- РїСЂРё СЃС‚Р°СЂС‚Рµ Р±РѕС‚Р° РІ Р»РѕРіР°С… РµСЃС‚СЊ `Google Sheets initialized successfully`
- РїРѕСЃР»Рµ СЂРµРіРёСЃС‚СЂР°С†РёРё, Р·Р°РїРёСЃРё, СЃРѕР±С‹С‚РёР№ С‚Р°Р№РјРµСЂР° РёР»Рё РґРµР№СЃС‚РІРёР№ Р°РґРјРёРЅР° РІ `Sheet1` РїРѕСЏРІР»СЏРµС‚СЃСЏ РЅРѕРІР°СЏ СЃС‚СЂРѕРєР° СЃ РЅСѓР¶РЅС‹Рј `type`

## Smoke-Test Checklist

- СЂРµРіРёСЃС‚СЂР°С†РёСЏ
- РІС‹РґР°С‡Р° PDF
- Р·Р°РїРёСЃСЊ РІ Р±СѓС‚РёРє
- РґРѕСЃС‚Р°РІРєР°
- Р·Р°РєСЂС‹С‚РёРµ СЃР»РѕС‚Р°
- Р±Р»РѕРєРёСЂРѕРІРєР° РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ
- С‚Р°Р№РјРµСЂ 5/8 РґРЅРµР№
- РІС‹РіСЂСѓР·РєР° CSV

Р‘С‹СЃС‚СЂР°СЏ СЂСѓС‡РЅР°СЏ РїСЂРѕРІРµСЂРєР°:

- Р±РѕС‚ Р·Р°РїСѓСЃРєР°РµС‚СЃСЏ
- `/start` СЂР°Р±РѕС‚Р°РµС‚
- СЂРµРіРёСЃС‚СЂР°С†РёСЏ СЂР°Р±РѕС‚Р°РµС‚
- Р·Р°РїРёСЃСЊ РІ Р±СѓС‚РёРє СЂР°Р±РѕС‚Р°РµС‚
- РґРѕСЃС‚Р°РІРєР° СЂР°Р±РѕС‚Р°РµС‚
- РІС‹РґР°С‡Р° PDF СЂР°Р±РѕС‚Р°РµС‚
- С‚Р°Р№РјРµСЂ Р·Р°РїСѓСЃРєР°РµС‚СЃСЏ Рё РїРѕРІС‚РѕСЂРЅРѕ РЅРµ СЃС‚Р°СЂС‚СѓРµС‚
- `РЎРґР°Р» РѕР±СЂР°Р·С‹` Р±РµР· Р°РєС‚РёРІРЅРѕРіРѕ С‚Р°Р№РјРµСЂР° РґР°РµС‚ РєРѕСЂСЂРµРєС‚РЅРѕРµ СЃРѕРѕР±С‰РµРЅРёРµ
- Р°РґРјРёРЅРєР° РѕС‚РєСЂС‹РІР°РµС‚СЃСЏ
- Р·Р°РєСЂС‹С‚РёРµ Рё РѕС‚РєСЂС‹С‚РёРµ СЃР»РѕС‚Р° СЂР°Р±РѕС‚Р°РµС‚
- Р±Р»РѕРєРёСЂРѕРІРєР° Рё СЂР°Р·Р±Р»РѕРєРёСЂРѕРІРєР° РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ СЂР°Р±РѕС‚Р°РµС‚
- РІС‹РіСЂСѓР·РєР° CSV РѕС‚РїСЂР°РІР»СЏРµС‚СЃСЏ
- Google Sheets Р·Р°РїРёСЃСЊ СЂР°Р±РѕС‚Р°РµС‚, РµСЃР»Рё РёРЅС‚РµРіСЂР°С†РёСЏ РІРєР»СЋС‡РµРЅР°

## Р§С‚Рѕ СѓР¶Рµ РёСЃРїСЂР°РІР»РµРЅРѕ РІ РїСЂРѕРµРєС‚Рµ

- РєРѕРґ СЃРІРµСЂРµРЅ СЃ `schema.prisma`
- РїСЂРѕРІРµСЂРµРЅС‹ `enum` Рё relation fields
- РїРѕРґС‚РІРµСЂР¶РґРµРЅРѕ РЅР°Р»РёС‡РёРµ `activeSlotKey` Рё `activeTimerKey` РІ Prisma schema
- РёСЃРїСЂР°РІР»РµРЅР° Р·Р°РїРёСЃСЊ `user.firstName`, С‡С‚РѕР±С‹ С‚СѓРґР° РЅРµ РїРѕРїР°РґР°Р»Рѕ РїРѕР»РЅРѕРµ Р¤РРћ РёР· СЂРµРіРёСЃС‚СЂР°С†РёРё
- РґР»СЏ booking-Р»РѕРіРёРєРё РїРѕРґС‚СЏРЅСѓС‚С‹ РїРѕР»РЅС‹Рµ РїРѕР»СЊР·РѕРІР°С‚РµР»СЊСЃРєРёРµ РґР°РЅРЅС‹Рµ С‡РµСЂРµР· `registration`
- Google Sheets СЃРґРµР»Р°РЅ РѕРїС†РёРѕРЅР°Р»СЊРЅС‹Рј РґР»СЏ Р»РѕРєР°Р»СЊРЅРѕР№ СЂР°Р·СЂР°Р±РѕС‚РєРё
- seed Рё РІСЃРїРѕРјРѕРіР°С‚РµР»СЊРЅС‹Рµ СЃРєСЂРёРїС‚С‹ С‚РµРїРµСЂСЊ С‡РёС‚Р°СЋС‚ `.env.local`
- РёСЃРїСЂР°РІР»РµРЅ РЅРµРєРѕСЂСЂРµРєС‚РЅС‹Р№ РїСЂРёРјРµСЂ `DATABASE_URL`

## Р§С‚Рѕ СЃРґРµР»Р°С‚СЊ СЂСѓРєР°РјРё РїРµСЂРµРґ РїСЂРѕРґРѕРј

- Р·Р°РїРѕР»РЅРёС‚СЊ production `.env`
- РІРєР»СЋС‡РёС‚СЊ `BOT_ENABLED=true`
- СѓРєР°Р·Р°С‚СЊ СЂРµР°Р»СЊРЅС‹Р№ `BOT_TOKEN`
- РїСЂРёРјРµРЅРёС‚СЊ РјРёРіСЂР°С†РёРё РёР»Рё Р»РѕРєР°Р»СЊРЅСѓСЋ СЃРёРЅС…СЂРѕРЅРёР·Р°С†РёСЋ СЃС…РµРјС‹ РЅР° production DB
- Р·Р°РіСЂСѓР·РёС‚СЊ production PDF С‡РµСЂРµР· Р°РґРјРёРЅРєСѓ
- РїРѕРґРєР»СЋС‡РёС‚СЊ Рё РїСЂРѕРІРµСЂРёС‚СЊ Google Sheets
- РїСЂРѕРіРЅР°С‚СЊ РїРѕР»РЅС‹Р№ smoke-test РІ Telegram РЅР° СЂРµР°Р»СЊРЅРѕРј Р±РѕС‚Рµ
- РЅР°СЃС‚СЂРѕРёС‚СЊ process manager РёР»Рё РєРѕРЅС‚РµР№РЅРµСЂРЅС‹Р№ restart policy
- РЅР°СЃС‚СЂРѕРёС‚СЊ СЂРµР·РµСЂРІРЅРѕРµ РєРѕРїРёСЂРѕРІР°РЅРёРµ SQLite Р±Р°Р·С‹ Рё РїР°РїРєРё `storage/`
```

