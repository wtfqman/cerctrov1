export const MENU_BUTTONS = Object.freeze({
  REGISTRATION: 'Регистрация',
  MY_DATA: 'Мои данные',
  BOOKING: 'Записаться',
  MY_BOOKINGS: 'Мои заявки',
  TAKE_ITEMS: 'Взял образы',
  RETURN_ITEMS: 'Сдал образы',
  MAIN_MENU: 'Главное меню',
  HELP: '\u041f\u043e\u043c\u043e\u0449\u044c',
});

export const MAIN_MENU_LAYOUT = [
  [MENU_BUTTONS.REGISTRATION],
  [MENU_BUTTONS.BOOKING],
  [MENU_BUTTONS.TAKE_ITEMS],
  [MENU_BUTTONS.RETURN_ITEMS],
  [MENU_BUTTONS.MY_BOOKINGS],
  [MENU_BUTTONS.HELP],
];

export const BOT_TEXTS = Object.freeze({
  BOOKING_DATE_OUTSIDE_WINDOW:
    'Эта дата сейчас недоступна для записи.',
  BOOKING_NO_AVAILABLE_DAYS:
    'Свободных дней для записи сейчас нет.',
  START_NEW_USER:
    'Привет! 👋\nЭто бот Cerca Trova.\n\nСначала нужно заполнить регистрацию.\nНажми «Регистрация».',
  START_REGISTERED:
    'Привет! 👋\n\nВыбери нужный раздел ниже.',
  MENU_HINT: 'Выбери нужный раздел ниже.',
  HELP_PROMPT: '\u0415\u0441\u043b\u0438 \u043d\u0443\u0436\u043d\u0430 \u043f\u043e\u043c\u043e\u0449\u044c, \u043d\u0430\u043f\u0438\u0448\u0438\u0442\u0435:',
  BLOCKED:
    'Сейчас доступ временно ограничен.',
  FEATURE_IN_PROGRESS:
    'Скоро будет.',
  REGISTRATION_SIZE_TEMPLATE:
    'Теперь размеры.\nОтправь их одним сообщением по шаблону:\n\nСорочка:\nПиджак:\nБрюки:\nТрикотаж:\nКостюм классика:\nКостюм power suit:',
  REGISTRATION_DONE:
    'Готово 💫\nРегистрация сохранена.',
  REGISTRATION_DONE_WITH_PDF_PROMPT:
    'Готово ✨\nРегистрация сохранена.\n\nТеперь можно сразу загрузить PDF.',
  TAKE_ITEMS_SUCCESS:
    '\u0413\u043e\u0442\u043e\u0432\u043e \u2728\n\u041e\u0431\u0440\u0430\u0437\u044b \u043f\u043e\u043b\u0443\u0447\u0435\u043d\u044b. \u041d\u0435 \u0437\u0430\u0431\u0443\u0434\u044c \u0437\u0430\u043f\u0438\u0441\u0430\u0442\u044c\u0441\u044f \u043d\u0430 \u0432\u043e\u0437\u0432\u0440\u0430\u0442 \u0438\u043b\u0438 \u0434\u043e\u0441\u0442\u0430\u0432\u043a\u0443 \u0432 \u0442\u0435\u0447\u0435\u043d\u0438\u0435 7 \u0434\u043d\u0435\u0439.',
  RETURN_REMINDER_5D_BOUTIQUE:
    '\u0422\u044b \u0435\u0449\u0451 \u043d\u0435 \u0437\u0430\u043f\u0438\u0441\u0430\u043b\u0441\u044f(\u0430\u0441\u044c) \u043d\u0430 \u0432\u043e\u0437\u0432\u0440\u0430\u0442 \u0432 \u0431\u0443\u0442\u0438\u043a.\n\u041f\u043e\u0436\u0430\u043b\u0443\u0439\u0441\u0442\u0430, \u043e\u0444\u043e\u0440\u043c\u0438 \u0437\u0430\u043f\u0438\u0441\u044c.',
  RETURN_REMINDER_5D_DELIVERY:
    '\u0422\u044b \u0435\u0449\u0451 \u043d\u0435 \u0437\u0430\u043f\u0438\u0441\u0430\u043b\u0441\u044f(\u0430\u0441\u044c) \u043d\u0430 \u0434\u043e\u0441\u0442\u0430\u0432\u043a\u0443.\n\u041f\u043e\u0436\u0430\u043b\u0443\u0439\u0441\u0442\u0430, \u043e\u0444\u043e\u0440\u043c\u0438 \u0437\u0430\u043f\u0438\u0441\u044c.',
  RETURN_REMINDER_5D:
    '\u0422\u044b \u0435\u0449\u0451 \u043d\u0435 \u0437\u0430\u043f\u0438\u0441\u0430\u043b\u0441\u044f(\u0430\u0441\u044c) \u043d\u0430 \u0432\u043e\u0437\u0432\u0440\u0430\u0442 \u0438\u043b\u0438 \u0434\u043e\u0441\u0442\u0430\u0432\u043a\u0443.\n\u041f\u043e\u0436\u0430\u043b\u0443\u0439\u0441\u0442\u0430, \u043e\u0444\u043e\u0440\u043c\u0438 \u0437\u0430\u043f\u0438\u0441\u044c.',
  USER_PDF_STATUS_MISSING: 'PDF: не загружен',
  USER_PDF_STATUS_READY: 'PDF: загружен',
  USER_PDF_PROMPT: 'Отправь PDF-файл документом.',
  USER_PDF_INVALID: 'Нужно отправить PDF-файл документом.',
  USER_PDF_SAVED: 'Документ сохранён.',
  USER_PDF_LATER: 'PDF можно загрузить позже через «Регистрация».',
  BOOKING_SENT_WITHOUT_USER_PDF:
    'Заявка отправлена.\nОбрати внимание: твой PDF пока не загружен.',
  PDF_MISSING:
    'Бланк пока не загружен.\nЕсли он нужен срочно, напиши администратору.',
  ADMIN_ONLY: 'У тебя нет доступа к админке.',
  ADMIN_MENU_OPEN_FAILED: 'Не удалось открыть админку. Попробуй ещё раз.',
});

export const HELP_CONTACTS = Object.freeze([
  {
    label: 'Света',
    url: 'https://t.me/ssssv_a',
  },
  {
    label: 'Лера',
    url: 'https://t.me/klbrdnv_V',
  },
]);

export const REGISTRATION_STATUS_LABELS = Object.freeze({
  PENDING: 'Ожидает проверки',
  APPROVED: 'Подтверждена',
  REJECTED: 'Отклонена',
  ARCHIVED: 'В архиве',
});

export const BOOKING_REQUEST_TYPE_LABELS = Object.freeze({
  RETURN: 'Возврат',
  PICKUP: 'Забор',
  RETURN_PICKUP: 'Возврат + Забор',
});

export const VISIT_MODE_LABELS = Object.freeze({
  BOUTIQUE: 'Бутик',
  DELIVERY: 'Доставка',
});

export const BOOKING_STATUS_LABELS = Object.freeze({
  CREATED: 'Создана',
  SUBMITTED: 'Отправлена',
  CANCELLED: 'Отменена',
  COMPLETED: 'Завершена',
});

export const TIMER_STATUS_LABELS = Object.freeze({
  ACTIVE: 'Активен',
  RETURNED: 'Возвращен',
  OVERDUE: 'Просрочен',
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
    receivesBookingNotifications: false,
  },
]);

export const AUDIT_ACTIONS = Object.freeze({
  USER_BLOCKED: 'user_blocked',
  USER_UNBLOCKED: 'user_unblocked',
  REGISTRATION_UPDATED: 'registration_updated',
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
  USER_PDF_UPLOADED: 'user_pdf_uploaded',
  USER_PDF_REPLACED: 'user_pdf_replaced',
  DATA_EXPORTED: 'data_exported',
  ADMIN_CREATED: 'admin_created',
  ADMIN_ROLE_UPDATED: 'admin_role_updated',
  ADMIN_DEACTIVATED: 'admin_deactivated',
  BOOKING_DAILY_SUMMARY_SENT: 'booking_daily_summary_sent',
  BOOKING_DAILY_SUMMARY_EMPTY: 'booking_daily_summary_empty',
});

export const DEFAULT_BOUTIQUES = Object.freeze([
  {
    city: 'Москва',
    code: 'YAKIMANKA_19',
    name: 'Большая Якиманка, 19 МСК',
    addressLine1: 'Большая Якиманка, 19',
    ccEmails: null,
    email: null,
  },
  {
    city: 'Москва',
    code: 'KRASNAYA_PRESNYA_21',
    name: 'Красная Пресня, 21 МСК',
    addressLine1: 'Красная Пресня, 21',
    ccEmails: null,
    email: null,
  },
  {
    city: 'Москва',
    code: 'LYALIN_24_26',
    name: 'Лялин Переулок 24-26с2а МСК',
    addressLine1: 'Лялин Переулок 24-26с2а',
    ccEmails: null,
    email: null,
  },
  {
    city: 'Санкт-Петербург',
    code: 'MOISEENKO_22',
    name: 'Моисеенко 22лит3 СПБ',
    addressLine1: 'Моисеенко 22лит3',
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
  {
    label: '16-17',
    startTime: '16:00',
    endTime: '17:00',
    sortOrder: 60,
  },
]);
