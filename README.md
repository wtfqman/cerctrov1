# Cerca Trova Bot

Telegram-бот на `Node.js + Telegraf + Prisma + SQLite` для креаторов Cerca Trova:

- регистрация
- запись в бутик
- доставка
- таймеры по вещам
- PDF после регистрации
- Google Sheets логирование
- админка внутри бота

## Требования

- Node.js 20+
- npm 10+
- Telegram bot token для полноценного запуска бота
- Google service account JSON для Google Sheets, если нужен онлайн-лог

## Установка

```bash
npm install
npm run prisma:generate
```

## ENV

Создайте `.env` или `.env.local` на основе `.env.example`.

Минимум для локальной разработки:

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

Полноценный запуск бота с Telegram:

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

Google Sheets можно подключить позже. Для этого нужны:

- `GOOGLE_SHEETS_SPREADSHEET_ID`
- `GOOGLE_SERVICE_ACCOUNT_JSON_PATH`
- `GOOGLE_SHEET_NAME`
- `DEFAULT_TIMEZONE`

Если эти переменные не заданы, бот работает без Google Sheets и просто логирует это в консоль.

## Prisma Generate

```bash
npm run prisma:generate
```

## Prisma Migrate

Локальная синхронизация схемы:

```bash
npm run prisma:migrate -- --name init
```

Скрипт сначала пробует обычный `prisma migrate dev`. Если Prisma schema engine падает на локальном Windows/OneDrive окружении, скрипт использует безопасный fallback для SQLite через `prisma migrate diff` + `prisma db execute`.

Важно:

- для SQLite путь в `DATABASE_URL` должен быть `file:./dev.db`
- значение `file:./prisma/dev.db` для схемы внутри папки `prisma/` некорректно

## Seed

Seed создает:

- встроенных администраторов
- базовые бутики
- базовые временные слоты

Запуск:

```bash
npm run prisma:seed
```

## Локальный запуск

Сухой локальный запуск без Telegram:

```bash
npm run dev
```

Для этого достаточно поставить:

```env
BOT_ENABLED=false
```

Полноценный запуск бота:

```env
BOT_ENABLED=true
BOT_TOKEN=...
```

Команды:

```bash
npm run dev
npm start
```

## Как загрузить PDF

Через админку:

1. Зайдите в бот под `super_admin`
2. Выполните `/admin`
3. Нажмите `Загрузить PDF`
4. Отправьте PDF-файл одним сообщением

Через команду:

1. Выполните `/upload_registration_pdf`
2. Отправьте PDF следующим сообщением

После этого бот будет отправлять этот PDF пользователю сразу после регистрации.

## Как подключить Google Sheets credentials

1. Создайте service account в Google Cloud
2. Скачайте JSON credentials
3. Положите файл, например, в `./credentials/cerca-trova-492420-0a48860db884.json`
4. Укажите путь в `GOOGLE_SERVICE_ACCOUNT_JSON_PATH`
5. Откройте Google Spreadsheet
6. Расшарьте таблицу на `service@cerca-trova-492420.iam.gserviceaccount.com`
7. Укажите `GOOGLE_SHEETS_SPREADSHEET_ID`
8. Укажите `GOOGLE_SHEET_NAME`
9. Проверьте подключение командой `npm run google-sheets:check`

Бот пишет события:

- `registration`
- `boutique_booking`
- `delivery_booking`
- `timer_event`
- `admin_action`

## Как добавить админа

Два администратора создаются автоматически при старте и в seed:

- `1731711996` — `super_admin`
- `846359286` — `operator_admin`

Чтобы добавить еще одного администратора вручную:

```bash
npm run admin:create -- 123456789 "Новый админ" FULL true
```

Аргументы:

- `telegramId`
- `displayName`
- `role` — `FULL` или `LIMITED`
- `receivesOverdueAlerts` — `true` или `false`

## Полезные команды

```bash
npm run dev
npm start
npm run prisma:generate
npm run prisma:migrate -- --name init
npm run prisma:seed
npm run prisma:studio
npm run job:overdue
npm run admin:create -- 123456789 "Новый админ" FULL true
npm run google-sheets:check
npm run cleanup:test-data:dry-run
npm run cleanup:test-data:apply
```

## Как очистить тестовые заявки

Скрипт очистки работает отдельно от runtime-кода бота и по умолчанию удаляет только заявки,
связанные с внутренними тестовыми бутиками вроде `MOS_NOMAIL_*`, `MOS_RESCHE_*`, `MOS_SMTPFA_*`,
`TEST_*`, `DEBUG_*`, `INTERNAL_*`.

Сначала всегда смотри кандидатов:

```bash
npm run cleanup:test-data:dry-run
```

Если список выглядит корректно, примени очистку:

```bash
npm run cleanup:test-data:apply
```

Для точечной очистки можно дополнительно указать явный фильтр:

```bash
node scripts/cleanupTestData.js --dry-run --telegram-id 9586763375
node scripts/cleanupTestData.js --apply --public-id 8794ed5f-7300-424d-ae39-29e37754e903
```

Что делает скрипт:

- показывает кандидатов на удаление и причины отбора
- в режиме `apply` сначала отвязывает связанные `UserItemTimer` и `UserPdf`
- затем удаляет сами `Booking`
- за счёт удаления записи слот автоматически освобождается, потому что такая booking больше не участвует в проверке занятости

## Как очистить все заявки

Для полной локальной очистки заявок есть отдельный script. Он не трогает пользователей, регистрации,
админов, бутики, справочник временных слотов, PDF-файлы и системные настройки.

Сначала посмотри, сколько данных будет очищено:

```bash
npm run clear:bookings:dry-run
```

Если всё выглядит корректно, примени очистку:

```bash
npm run clear:bookings:apply
```

Можно запускать и напрямую:

```bash
node scripts/clearAllBookings.js --dry-run
node scripts/clearAllBookings.js --apply
```

Что делает script:

- удаляет все записи из `Booking`
- удаляет booking-only записи из `AuditLog`, где `entityType = Booking`
- отвязывает `UserItemTimer.bookingId`, но сами таймеры не удаляет
- отвязывает `UserPdf.bookingId`, но сами PDF-записи и файлы не удаляет
- после удаления все слоты автоматически считаются свободными, потому что занятость строится по существующим booking

## Как проверить Google Sheets

1. Положите JSON credentials в `credentials/google-service-account.json`
2. Заполните `.env` или `.env.local`:

```env
GOOGLE_SHEETS_SPREADSHEET_ID=1Y_uWyPkaRHunso8Av87ixrP2I9eqrYFPrHc-TzLV7AQ
GOOGLE_SERVICE_ACCOUNT_JSON_PATH=./credentials/cerca-trova-492420-0a48860db884.json
GOOGLE_SHEET_NAME=Sheet1
DEFAULT_TIMEZONE=Europe/Moscow
```

3. Расшарьте таблицу на `client_email` из service account JSON
4. Выполните:

```bash
npm run google-sheets:check
```

Если подключение корректное, скрипт:

- инициализирует Google Sheets сервис
- создаст лист, если его ещё нет
- создаст или поправит заголовки
- выведет успешный статус в консоль

Как понять, что запись в таблицу работает:

- `npm run google-sheets:check` завершается без ошибки
- при старте бота в логах есть `Google Sheets initialized successfully`
- после регистрации, записи, событий таймера или действий админа в `Sheet1` появляется новая строка с нужным `type`

## Smoke-Test Checklist

- регистрация
- выдача PDF
- запись в бутик
- доставка
- закрытие слота
- блокировка пользователя
- таймер 5/8 дней
- выгрузка CSV

Быстрая ручная проверка:

- бот запускается
- `/start` работает
- регистрация работает
- запись в бутик работает
- доставка работает
- выдача PDF работает
- таймер запускается и повторно не стартует
- `Сдал образы` без активного таймера дает корректное сообщение
- админка открывается
- закрытие и открытие слота работает
- блокировка и разблокировка пользователя работает
- выгрузка CSV отправляется
- Google Sheets запись работает, если интеграция включена

## Что уже исправлено в проекте

- код сверен с `schema.prisma`
- проверены `enum` и relation fields
- подтверждено наличие `activeSlotKey` и `activeTimerKey` в Prisma schema
- исправлена запись `user.firstName`, чтобы туда не попадало полное ФИО из регистрации
- для booking-логики подтянуты полные пользовательские данные через `registration`
- Google Sheets сделан опциональным для локальной разработки
- seed и вспомогательные скрипты теперь читают `.env.local`
- исправлен некорректный пример `DATABASE_URL`

## Что сделать руками перед продом

- заполнить production `.env`
- включить `BOT_ENABLED=true`
- указать реальный `BOT_TOKEN`
- применить миграции или локальную синхронизацию схемы на production DB
- загрузить production PDF через админку
- подключить и проверить Google Sheets
- прогнать полный smoke-test в Telegram на реальном боте
- настроить process manager или контейнерный restart policy
- настроить резервное копирование SQLite базы и папки `storage/`
