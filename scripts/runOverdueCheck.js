import { Telegraf } from 'telegraf';

import { env } from '../src/config/env.js';
import { connectPrisma, disconnectPrisma, prisma } from '../src/db/prisma.js';
import { runOverdueCheckOnce } from '../src/jobs/overdueCheck.js';
import { createServices } from '../src/services/index.js';
import { logger } from '../src/utils/logger.js';

async function main() {
  if (!env.BOT_TOKEN) {
    throw new Error('BOT_TOKEN is required to run the overdue check script');
  }

  await connectPrisma();

  const services = createServices({
    env,
    logger,
    prisma,
  });

  const bot = new Telegraf(env.BOT_TOKEN);

  await runOverdueCheckOnce({
    bot,
    logger,
    services,
  });
}

main()
  .catch((error) => {
    logger.error({ err: error }, 'Failed to run overdue check');
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectPrisma();
  });
