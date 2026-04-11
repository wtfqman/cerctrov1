import { PrismaClient } from '@prisma/client';

import { loadEnvFiles } from '../src/config/loadEnv.js';
import { BUILTIN_ADMINS, DEFAULT_BOUTIQUES, DEFAULT_TIME_SLOTS } from '../src/utils/constants.js';
import { logger } from '../src/utils/logger.js';

loadEnvFiles();

const prisma = new PrismaClient({
  errorFormat: 'minimal',
  log: process.env.NODE_ENV === 'production' ? ['error'] : ['warn', 'error'],
});

async function seedAdmins() {
  for (const adminSeed of BUILTIN_ADMINS) {
    const user = await prisma.user.upsert({
      where: {
        telegramId: adminSeed.telegramId,
      },
      create: {
        telegramId: adminSeed.telegramId,
        firstName: adminSeed.displayName,
        lastSeenAt: new Date(),
      },
      update: {
        firstName: adminSeed.displayName,
        lastSeenAt: new Date(),
      },
    });

    await prisma.admin.upsert({
      where: {
        userId: user.id,
      },
      create: {
        userId: user.id,
        displayName: adminSeed.displayName,
        role: adminSeed.role,
        notificationChatId: adminSeed.telegramId,
        receivesOverdueAlerts: adminSeed.receivesOverdueAlerts,
        receivesBookingNotifications: adminSeed.receivesBookingNotifications ?? false,
      },
      update: {
        displayName: adminSeed.displayName,
        isActive: true,
        role: adminSeed.role,
        notificationChatId: adminSeed.telegramId,
        receivesOverdueAlerts: adminSeed.receivesOverdueAlerts,
        receivesBookingNotifications: adminSeed.receivesBookingNotifications ?? false,
      },
    });
  }
}

async function seedBoutiquesAndSlots() {
  for (const boutiqueSeed of DEFAULT_BOUTIQUES) {
    const boutique = await prisma.boutique.upsert({
      where: {
        code: boutiqueSeed.code,
      },
      create: {
        code: boutiqueSeed.code,
        name: boutiqueSeed.name,
        addressLine1: boutiqueSeed.addressLine1,
        ccEmails: boutiqueSeed.ccEmails ?? null,
        city: boutiqueSeed.city,
        email: boutiqueSeed.email ?? null,
        isActive: true,
      },
      update: {
        name: boutiqueSeed.name,
        addressLine1: boutiqueSeed.addressLine1,
        ccEmails: boutiqueSeed.ccEmails ?? null,
        city: boutiqueSeed.city,
        email: boutiqueSeed.email ?? null,
        isActive: true,
      },
    });

    for (const slotSeed of DEFAULT_TIME_SLOTS) {
      await prisma.timeSlot.upsert({
        where: {
          boutiqueId_startTime_endTime: {
            boutiqueId: boutique.id,
            startTime: slotSeed.startTime,
            endTime: slotSeed.endTime,
          },
        },
        create: {
          boutiqueId: boutique.id,
          label: slotSeed.label,
          startTime: slotSeed.startTime,
          endTime: slotSeed.endTime,
          capacity: 1,
          sortOrder: slotSeed.sortOrder,
          isActive: true,
        },
        update: {
          label: slotSeed.label,
          capacity: 1,
          sortOrder: slotSeed.sortOrder,
          isActive: true,
        },
      });
    }
  }
}

async function main() {
  logger.info('Starting Prisma seed');
  await prisma.$connect();
  await seedAdmins();
  await seedBoutiquesAndSlots();
  logger.info('Seed completed successfully');
}

main()
  .catch((error) => {
    logger.error({ err: error }, 'Seed failed');
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
