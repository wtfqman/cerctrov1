import { AppError } from '../../utils/errors.js';
import { getMainMenuKeyboard } from '../keyboards/mainMenu.js';
import { leaveActiveScene, SCENE_EXIT_REASONS } from '../utils/sceneNavigation.js';

const GENERIC_ERROR_MESSAGE =
  '\u0427\u0442\u043e-\u0442\u043e \u043f\u043e\u0448\u043b\u043e \u043d\u0435 \u0442\u0430\u043a. \u041f\u043e\u043f\u0440\u043e\u0431\u0443\u0439 \u0435\u0449\u0435 \u0440\u0430\u0437 \u0447\u0443\u0442\u044c \u043f\u043e\u0437\u0436\u0435.';

export function registerErrorHandler(bot, { logger }) {
  bot.catch(async (error, ctx) => {
    const requestLogger = ctx?.state?.requestLogger ?? logger;
    const shouldResetScene = Boolean(ctx?.scene?.current);

    requestLogger.error(
      {
        err: error,
        sceneId: ctx?.scene?.current?.id ?? null,
        updateType: ctx?.state?.updateType ?? null,
      },
      'Unhandled bot error',
    );

    if (!ctx?.chat) {
      return;
    }

    const responseMessage =
      error instanceof AppError && error.statusCode < 500 ? error.message : GENERIC_ERROR_MESSAGE;

    try {
      if (shouldResetScene) {
        await leaveActiveScene(ctx, {
          forceReset: true,
          reason: SCENE_EXIT_REASONS.CANCEL,
        });
      }

      if (ctx.callbackQuery) {
        await ctx.answerCbQuery('\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0432\u044b\u043f\u043e\u043b\u043d\u0438\u0442\u044c \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435', {
          show_alert: false,
        }).catch(() => undefined);
      }

      await ctx.reply(
        responseMessage,
        shouldResetScene ? getMainMenuKeyboard() : undefined,
      );
    } catch (replyError) {
      requestLogger.error({ err: replyError }, 'Failed to send error response to user');
    }
  });
}
