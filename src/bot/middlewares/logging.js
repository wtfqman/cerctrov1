import { v4 as uuidv4 } from 'uuid';

function detectUpdateType(update) {
  return Object.keys(update ?? {}).find((key) => key !== 'update_id') ?? 'unknown';
}

function trimText(value, maxLength = 160) {
  if (typeof value !== 'string' || value.trim() === '') {
    return null;
  }

  const normalized = value.trim().replace(/\s+/g, ' ');
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 3)}...` : normalized;
}

function buildUpdatePreview(ctx) {
  return {
    callbackData: ctx.callbackQuery?.data ?? null,
    chatType: ctx.chat?.type ?? null,
    documentName: ctx.message?.document?.file_name ?? null,
    documentType: ctx.message?.document?.mime_type ?? null,
    messageText: trimText(ctx.message?.text),
    sceneId: ctx.scene?.current?.id ?? null,
    telegramUsername: ctx.from?.username ?? null,
  };
}

export function createLoggingMiddleware({ logger }) {
  return async (ctx, next) => {
    const startedAt = Date.now();
    const requestId = uuidv4();
    const updateType = detectUpdateType(ctx.update);

    const requestLogger = logger.child({
      requestId,
      updateId: ctx.update?.update_id,
      updateType,
      telegramUserId: ctx.from?.id ?? null,
      telegramUsername: ctx.from?.username ?? null,
      chatId: ctx.chat?.id ?? null,
    });

    ctx.state.requestId = requestId;
    ctx.state.requestLogger = requestLogger;
    ctx.state.updateType = updateType;

    requestLogger.info(buildUpdatePreview(ctx), 'Incoming Telegram update');

    try {
      await next();
      requestLogger.info(
        {
          durationMs: Date.now() - startedAt,
          sceneId: ctx.scene?.current?.id ?? null,
        },
        'Telegram update handled',
      );
    } catch (error) {
      requestLogger.error(
        {
          durationMs: Date.now() - startedAt,
          err: error,
          sceneId: ctx.scene?.current?.id ?? null,
        },
        'Telegram update failed',
      );
      throw error;
    }
  };
}
