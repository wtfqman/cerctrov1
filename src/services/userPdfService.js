import { AUDIT_ACTIONS } from '../utils/constants.js';

function normalizeTelegramUserPdfMeta(fileMeta = {}) {
  const telegramFileId =
    typeof fileMeta.telegramFileId === 'string'
      ? fileMeta.telegramFileId.trim()
      : String(fileMeta.telegramFileId ?? '').trim();

  if (!telegramFileId) {
    throw new Error('telegramFileId is required to save a personal user PDF');
  }

  return {
    fileName: typeof fileMeta.fileName === 'string' && fileMeta.fileName.trim()
      ? fileMeta.fileName.trim()
      : 'user-personal.pdf',
    mimeType: typeof fileMeta.mimeType === 'string' && fileMeta.mimeType.trim()
      ? fileMeta.mimeType.trim().toLowerCase()
      : 'application/pdf',
    telegramFileId,
    uploadedAt: new Date(),
  };
}

export function createUserPdfService({ prisma, logger }) {
  const serviceLogger = logger.child({ service: 'userPdf' });

  async function getUserPdf(userId) {
    return prisma.userPersonalPdf.findUnique({
      where: { userId },
    });
  }

  async function hasUserPdf(userId) {
    const existingPdf = await prisma.userPersonalPdf.findUnique({
      where: { userId },
      select: { id: true },
    });

    return Boolean(existingPdf);
  }

  async function createAuditLog({ action, prismaClient, userId, userPdf }) {
    await prismaClient.auditLog.create({
      data: {
        action,
        actorType: 'USER',
        entityType: 'UserPersonalPdf',
        entityId: userPdf.id,
        message:
          action === AUDIT_ACTIONS.USER_PDF_REPLACED
            ? `Пользователь заменил персональный PDF ${userPdf.fileName}`
            : `Пользователь загрузил персональный PDF ${userPdf.fileName}`,
        userId,
      },
    });
  }

  async function upsertUserPdf(userId, fileMeta, action) {
    const normalizedMeta = normalizeTelegramUserPdfMeta(fileMeta);
    const existingPdf = await getUserPdf(userId);
    const auditAction = existingPdf ? AUDIT_ACTIONS.USER_PDF_REPLACED : AUDIT_ACTIONS.USER_PDF_UPLOADED;

    serviceLogger.info(
      {
        action,
        auditAction,
        fileName: normalizedMeta.fileName,
        mimeType: normalizedMeta.mimeType,
        telegramFileId: normalizedMeta.telegramFileId,
        userId,
      },
      existingPdf ? 'Replacing personal user PDF via Telegram file_id' : 'Saving personal user PDF via Telegram file_id',
    );

    const userPdf = await prisma.$transaction(async (tx) => {
      const savedUserPdf = await tx.userPersonalPdf.upsert({
        where: { userId },
        create: {
          userId,
          ...normalizedMeta,
        },
        update: normalizedMeta,
      });

      await createAuditLog({
        action: auditAction,
        prismaClient: tx,
        userId,
        userPdf: savedUserPdf,
      });

      return savedUserPdf;
    });

    return userPdf;
  }

  async function saveUserPdf(userId, fileMeta) {
    return upsertUserPdf(userId, fileMeta, 'save');
  }

  async function replaceUserPdf(userId, fileMeta) {
    return upsertUserPdf(userId, fileMeta, 'replace');
  }

  return {
    getUserPdf,
    hasUserPdf,
    replaceUserPdf,
    saveUserPdf,
  };
}
