const CLEARED_INLINE_KEYBOARD = Object.freeze({
  inline_keyboard: [],
});

function getTelegramErrorDescription(error) {
  return error?.description ?? error?.response?.description ?? '';
}

export function isMessageNotModifiedError(error) {
  return getTelegramErrorDescription(error).includes('message is not modified');
}

export function isUnavailableMessageError(error) {
  const description = getTelegramErrorDescription(error);

  return (
    description === 'Bad Request: message to edit not found' ||
    description === "Bad Request: message can't be edited"
  );
}

export function getClearedInlineKeyboard() {
  return CLEARED_INLINE_KEYBOARD;
}

export function normalizeInlineMarkup(markup = undefined) {
  const extra = markup ? { ...markup } : {};
  extra.reply_markup = markup?.reply_markup ?? getClearedInlineKeyboard();
  return extra;
}

export async function safelyRemoveInlineKeyboard(ctx) {
  if (!ctx.callbackQuery?.message) {
    return false;
  }

  try {
    await ctx.editMessageReplyMarkup(getClearedInlineKeyboard());
    return true;
  } catch (error) {
    if (isMessageNotModifiedError(error) || isUnavailableMessageError(error)) {
      return false;
    }

    throw error;
  }
}
