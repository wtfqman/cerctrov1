import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { DocumentKind } from '@prisma/client';

import { env } from '../config/env.js';
import { PDF_TEMPLATE_KEYS } from '../utils/constants.js';

export function createPdfStorageService({ prisma, logger }) {
  const serviceLogger = logger.child({ service: 'pdfStorage' });

  async function ensureStorageDir() {
    await mkdir(env.PDF_STORAGE_DIR, { recursive: true });
  }

  async function registerTemplate({
    key,
    name,
    description = null,
    storagePath,
    fileName = null,
    mimeType = null,
    telegramFileId = null,
    uploadedByAdminId = null,
  }) {
    await ensureStorageDir();

    return prisma.pdfTemplate.upsert({
      where: { key },
      create: {
        key,
        name,
        description,
        storagePath,
        fileName,
        mimeType,
        telegramFileId,
        uploadedByAdminId,
      },
      update: {
        name,
        description,
        storagePath,
        fileName,
        mimeType,
        telegramFileId,
        uploadedByAdminId,
        isActive: true,
      },
    });
  }

  async function saveRegistrationTemplatePdf({ adminId, fileId, fileName, mimeType }) {
    const resolvedFileName = fileName ?? 'registration.pdf';
    const storagePath = `telegram://${fileId}`;

    serviceLogger.info(
      {
        adminId,
        fileName: resolvedFileName,
      },
      'Saving active registration PDF template',
    );

    return registerTemplate({
      key: PDF_TEMPLATE_KEYS.REGISTRATION_WELCOME,
      name: 'Регистрационный PDF',
      description: 'PDF, который отправляется пользователю после регистрации',
      storagePath,
      fileName: resolvedFileName,
      mimeType: mimeType ?? 'application/pdf',
      telegramFileId: fileId,
      uploadedByAdminId: adminId ? String(adminId) : null,
    });
  }

  async function getActiveRegistrationTemplate() {
    return prisma.pdfTemplate.findUnique({
      where: {
        key: PDF_TEMPLATE_KEYS.REGISTRATION_WELCOME,
      },
    });
  }

  async function saveUserPdf({
    userId,
    bookingId = null,
    templateId = null,
    documentKind = DocumentKind.REGISTRATION_FORM,
    fileName,
    storagePath = null,
    telegramFileId = null,
    externalUrl = null,
  }) {
    await ensureStorageDir();

    const resolvedStoragePath =
      storagePath ??
      (telegramFileId ? `telegram://${telegramFileId}` : path.join(env.PDF_STORAGE_DIR, fileName));

    serviceLogger.debug({ userId, resolvedStoragePath }, 'Saving PDF metadata');

    return prisma.userPdf.create({
      data: {
        userId,
        bookingId,
        templateId,
        documentKind,
        fileName,
        storagePath: resolvedStoragePath,
        telegramFileId,
        externalUrl,
      },
    });
  }

  return {
    ensureStorageDir,
    getActiveRegistrationTemplate,
    registerTemplate,
    saveRegistrationTemplatePdf,
    saveUserPdf,
  };
}