import { PrismaClient } from '@prisma/client';

const globalKey = '__cercaTrovaPrisma';
const globalForPrisma = globalThis;
const isProduction = process.env.NODE_ENV === 'production';

export const prisma =
  globalForPrisma[globalKey] ??
  new PrismaClient({
    errorFormat: 'minimal',
    log: isProduction ? ['error'] : ['warn', 'error'],
  });

if (!isProduction) {
  globalForPrisma[globalKey] = prisma;
}

export async function connectPrisma() {
  await prisma.$connect();
}

export async function disconnectPrisma() {
  await prisma.$disconnect();
}