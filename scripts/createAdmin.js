import { AdminRole } from '@prisma/client';

import { loadEnvFiles } from '../src/config/loadEnv.js';

loadEnvFiles();

const telegramId = process.argv[2];
const displayName = process.argv[3] ?? 'Администратор';
const role = (process.argv[4] ?? process.env.DEFAULT_ADMIN_ROLE ?? AdminRole.LIMITED).toUpperCase();
const receivesOverdueAlerts = (process.argv[5] ?? 'true') !== 'false';
const receivesBookingNotifications = (process.argv[6] ?? 'false') === 'true';

if (!telegramId) {
  console.error(
    'Usage: node scripts/createAdmin.js <telegramId> [displayName] [role] [receivesOverdueAlerts] [receivesBookingNotifications]',
  );
  process.exit(1);
}

if (!Object.values(AdminRole).includes(role)) {
  console.error(`Role must be one of: ${Object.values(AdminRole).join(', ')}`);
  process.exit(1);
}

async function main() {
  const [{ connectPrisma, disconnectPrisma, prisma }, { createAdminService }, { logger }] = await Promise.all([
    import('../src/db/prisma.js'),
    import('../src/services/adminService.js'),
    import('../src/utils/logger.js'),
  ]);

  await connectPrisma();

  const adminService = createAdminService({
    prisma,
    logger,
    env: {
      DEFAULT_ADMIN_ROLE: process.env.DEFAULT_ADMIN_ROLE ?? AdminRole.LIMITED,
    },
  });

  const admin = await adminService.createOrUpdateAdmin({
    telegramId,
    displayName,
    role,
    receivesOverdueAlerts,
    receivesBookingNotifications,
    notificationChatId: telegramId,
  });

  console.log(`Admin ready: ${admin.id}`);

  await disconnectPrisma();
}

main().catch(async (error) => {
  const { disconnectPrisma } = await import('../src/db/prisma.js');
  const { logger } = await import('../src/utils/logger.js');

  logger.error({ err: error }, 'Failed to create admin');

  try {
    await disconnectPrisma();
  } catch {
    // Ignore disconnect errors on script shutdown.
  }

  process.exitCode = 1;
});
