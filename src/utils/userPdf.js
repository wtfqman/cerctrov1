import { ValidationError } from './errors.js';

export function isPdfDocument(document) {
  if (!document) {
    return false;
  }

  const mimeType = document.mime_type?.toLowerCase?.() ?? '';
  const fileName = document.file_name?.toLowerCase?.() ?? '';

  return mimeType === 'application/pdf' || fileName.endsWith('.pdf');
}

export function buildPersonalPdfFileMeta(document, invalidMessage) {
  const telegramFileId =
    typeof document?.file_id === 'string'
      ? document.file_id.trim()
      : '';

  if (!telegramFileId) {
    throw new ValidationError(invalidMessage);
  }

  return {
    fileName: document.file_name ?? 'user-personal.pdf',
    mimeType: document.mime_type ?? 'application/pdf',
    telegramFileId,
  };
}
