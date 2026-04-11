# Registration Edit Message Not Modified Fix

## src\bot\utils\inlineKeyboard.js

```js
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

```

## src\bot\scenes\registrationEditScene.js

```js
import { Scenes } from 'telegraf';

import { BOT_TEXTS } from '../../utils/constants.js';
import { ValidationError } from '../../utils/errors.js';
import { formatRegistrationSizes, getRegistrationCdekAddress, getRegistrationHomeAddress } from '../../utils/registration.js';
import { REGISTRATION_EDITABLE_FIELDS, getRegistrationEditableField } from '../../utils/registrationEdit.js';
import {
  isMessageNotModifiedError,
  isUnavailableMessageError,
  normalizeInlineMarkup,
} from '../utils/inlineKeyboard.js';
import {
  getRegistrationEditFieldsKeyboard,
  getRegistrationEditPromptKeyboard,
  getRegistrationOverviewKeyboard,
  REGISTRATION_EDIT_CALLBACKS,
} from '../keyboards/registration.js';
import { getMainMenuKeyboard } from '../keyboards/mainMenu.js';
import { REGISTRATION_EDIT_SCENE_ID, REGISTRATION_SCENE_ID } from './sceneIds.js';

export { REGISTRATION_EDIT_SCENE_ID };

function getSceneState(ctx) {
  ctx.wizard.state.registrationEdit ??= {};
  return ctx.wizard.state.registrationEdit;
}

function getMessageText(ctx) {
  return ctx.message?.text?.trim() ?? '';
}

function getCallbackData(ctx) {
  return ctx.callbackQuery?.data ?? '';
}

function getCallbackPanel(ctx) {
  const message = ctx.callbackQuery?.message;

  if (!message?.chat?.id || !message?.message_id) {
    return null;
  }

  return {
    chatId: message.chat.id,
    messageId: message.message_id,
  };
}

function rememberPanel(ctx, target) {
  if (!target?.chatId || !target?.messageId) {
    return;
  }

  getSceneState(ctx).panel = target;
}

function getStoredPanel(ctx) {
  return getSceneState(ctx).panel ?? null;
}

function getPanelTarget(ctx) {
  return getCallbackPanel(ctx) ?? getStoredPanel(ctx);
}

function extractCallbackValue(ctx, prefix) {
  const callbackData = getCallbackData(ctx);
  return callbackData.startsWith(prefix) ? callbackData.slice(prefix.length) : null;
}

function isCancelAction(ctx) {
  return getMessageText(ctx) === '/cancel';
}

function buildBlockedMessage(user, supportContact) {
  const lines = [BOT_TEXTS.BLOCKED];

  if (user.blockedReason) {
    lines.push(`РџСЂРёС‡РёРЅР°: ${user.blockedReason}`);
  }

  lines.push(`Р•СЃР»Рё РЅСѓР¶РЅР° РїРѕРјРѕС‰СЊ: ${supportContact}`);

  return lines.join('\n');
}

function buildRegistrationOverviewText(registration, notice = '') {
  const homeAddress = getRegistrationHomeAddress(registration);
  const cdekAddress = getRegistrationCdekAddress(registration);

  return [
    notice,
    'РўРІРѕРё РґР°РЅРЅС‹Рµ СѓР¶Рµ СЃРѕС…СЂР°РЅРµРЅС‹ рџ’«',
    '',
    `Р¤РРћ: ${registration.fullName}`,
    `РўРµР»РµС„РѕРЅ: ${registration.phone}`,
    `РќРёРє: ${registration.telegramUsername}`,
    `Р”РѕРјР°С€РЅРёР№ Р°РґСЂРµСЃ: ${homeAddress || 'РЅРµ СѓРєР°Р·Р°РЅ'}`,
    `РђРґСЂРµСЃ РЎР”Р­Рљ: ${cdekAddress || 'РЅРµ СѓРєР°Р·Р°РЅ'}`,
    '',
    formatRegistrationSizes(registration.sizes),
  ]
    .filter(Boolean)
    .join('\n');
}

function buildFieldSelectionText(notice = '') {
  return [notice, 'Р§С‚Рѕ С…РѕС‡РµС€СЊ РёР·РјРµРЅРёС‚СЊ?']
    .filter(Boolean)
    .join('\n\n');
}

function buildPromptText(fieldConfig, notice = '') {
  return [notice, fieldConfig.prompt]
    .filter(Boolean)
    .join('\n\n');
}

async function answerRegistrationCallback(ctx, text = undefined) {
  if (!ctx.callbackQuery) {
    return;
  }

  try {
    await ctx.answerCbQuery(text);
  } catch {
    // Ignore callback acknowledgement errors.
  }
}

async function renderRegistrationPanel(ctx, text, markup = undefined) {
  const target = getPanelTarget(ctx);
  const extra = normalizeInlineMarkup(markup);

  if (target) {
    rememberPanel(ctx, target);

    try {
      await ctx.telegram.editMessageText(
        target.chatId,
        target.messageId,
        undefined,
        text,
        extra,
      );

      return target;
    } catch (error) {
      if (isUnavailableMessageError(error)) {
        delete getSceneState(ctx).panel;
      } else if (!isMessageNotModifiedError(error)) {
        throw error;
      } else {
        try {
          await ctx.telegram.editMessageReplyMarkup(
            target.chatId,
            target.messageId,
            undefined,
            extra.reply_markup,
          );

          return target;
        } catch (replyMarkupError) {
          if (isUnavailableMessageError(replyMarkupError)) {
            delete getSceneState(ctx).panel;
          } else if (!isMessageNotModifiedError(replyMarkupError)) {
            throw replyMarkupError;
          }
        }

        if (getSceneState(ctx).panel) {
          return target;
        }
      }
    }
  }

  const sentMessage = await ctx.reply(text, extra);
  const newTarget = {
    chatId: sentMessage.chat.id,
    messageId: sentMessage.message_id,
  };

  rememberPanel(ctx, newTarget);
  return newTarget;
}

async function clearRegistrationPanelKeyboard(ctx) {
  const target = getPanelTarget(ctx);

  if (!target) {
    return;
  }

  try {
    await ctx.telegram.editMessageReplyMarkup(
      target.chatId,
      target.messageId,
      undefined,
      {
        inline_keyboard: [],
      },
    );
  } catch (error) {
    if (isMessageNotModifiedError(error) || isUnavailableMessageError(error)) {
      return;
    }

    throw error;
  }
}

async function leaveToMainMenu(ctx, message = BOT_TEXTS.MENU_HINT) {
  await clearRegistrationPanelKeyboard(ctx);
  await ctx.scene.leave();
  await ctx.reply(message, getMainMenuKeyboard());
}

async function ensureRegistrationEditAccess(ctx) {
  const user = await ctx.state.services.registrationService.ensureTelegramUser(ctx.from);
  const isBlocked = await ctx.state.services.bookingService.isUserBlocked(user.id);

  if (isBlocked) {
    await leaveToMainMenu(ctx, buildBlockedMessage(user, ctx.state.env.SUPPORT_CONTACT));
    return null;
  }

  const registration = await ctx.state.services.registrationService.getRegistrationByUserId(user.id);

  if (!registration) {
    await ctx.scene.enter(REGISTRATION_SCENE_ID);
    return null;
  }

  return {
    registration,
    user,
  };
}

export function createRegistrationEditScene() {
  return new Scenes.WizardScene(
    REGISTRATION_EDIT_SCENE_ID,
    async (ctx) => {
      const access = await ensureRegistrationEditAccess(ctx);

      if (!access) {
        return undefined;
      }

      const state = getSceneState(ctx);
      state.registration = access.registration;
      state.userId = access.user.id;

      await renderRegistrationPanel(
        ctx,
        buildRegistrationOverviewText(access.registration),
        getRegistrationOverviewKeyboard(),
      );

      return ctx.wizard.next();
    },
    async (ctx) => {
      if (isCancelAction(ctx)) {
        await leaveToMainMenu(ctx, 'РР·РјРµРЅРµРЅРёРµ РґР°РЅРЅС‹С… РјРѕР¶РЅРѕ РїСЂРѕРґРѕР»Р¶РёС‚СЊ РїРѕР·Р¶Рµ.');
        return undefined;
      }

      const callbackData = getCallbackData(ctx);
      const state = getSceneState(ctx);

      if (callbackData === REGISTRATION_EDIT_CALLBACKS.OVERVIEW_BACK) {
        await answerRegistrationCallback(ctx);
        await leaveToMainMenu(ctx);
        return undefined;
      }

      if (callbackData === REGISTRATION_EDIT_CALLBACKS.OVERVIEW_EDIT) {
        await answerRegistrationCallback(ctx);
        await renderRegistrationPanel(
          ctx,
          buildFieldSelectionText(),
          getRegistrationEditFieldsKeyboard(REGISTRATION_EDITABLE_FIELDS),
        );
        return ctx.wizard.next();
      }

      if (getMessageText(ctx)) {
        await renderRegistrationPanel(
          ctx,
          buildRegistrationOverviewText(
            state.registration,
            'РќР°Р¶РјРё В«РР·РјРµРЅРёС‚СЊ РґР°РЅРЅС‹РµВ», С‡С‚РѕР±С‹ РѕР±РЅРѕРІРёС‚СЊ РЅСѓР¶РЅРѕРµ РїРѕР»Рµ.',
          ),
          getRegistrationOverviewKeyboard(),
        );
      }

      return undefined;
    },
    async (ctx) => {
      if (isCancelAction(ctx)) {
        await leaveToMainMenu(ctx, 'РР·РјРµРЅРµРЅРёРµ РґР°РЅРЅС‹С… РјРѕР¶РЅРѕ РїСЂРѕРґРѕР»Р¶РёС‚СЊ РїРѕР·Р¶Рµ.');
        return undefined;
      }

      const callbackData = getCallbackData(ctx);

      if (callbackData === REGISTRATION_EDIT_CALLBACKS.FIELDS_BACK) {
        await answerRegistrationCallback(ctx);
        await renderRegistrationPanel(
          ctx,
          buildRegistrationOverviewText(getSceneState(ctx).registration),
          getRegistrationOverviewKeyboard(),
        );
        ctx.wizard.selectStep(1);
        return undefined;
      }

      const fieldKey = extractCallbackValue(ctx, REGISTRATION_EDIT_CALLBACKS.FIELD_PREFIX);
      const fieldConfig = getRegistrationEditableField(fieldKey);

      if (!fieldConfig) {
        if (ctx.callbackQuery) {
          await answerRegistrationCallback(ctx, 'Р’С‹Р±РµСЂРё РїРѕР»Рµ РЅРёР¶Рµ.');
        }

        if (getMessageText(ctx)) {
          await renderRegistrationPanel(
            ctx,
            buildFieldSelectionText('РЎРЅР°С‡Р°Р»Р° РІС‹Р±РµСЂРё РїРѕР»Рµ РЅРёР¶Рµ.'),
            getRegistrationEditFieldsKeyboard(REGISTRATION_EDITABLE_FIELDS),
          );
        }

        return undefined;
      }

      const state = getSceneState(ctx);
      state.selectedField = fieldConfig.key;

      await answerRegistrationCallback(ctx);
      await renderRegistrationPanel(
        ctx,
        buildPromptText(fieldConfig),
        getRegistrationEditPromptKeyboard(),
      );

      return ctx.wizard.next();
    },
    async (ctx) => {
      if (isCancelAction(ctx)) {
        await leaveToMainMenu(ctx, 'РР·РјРµРЅРµРЅРёРµ РґР°РЅРЅС‹С… РјРѕР¶РЅРѕ РїСЂРѕРґРѕР»Р¶РёС‚СЊ РїРѕР·Р¶Рµ.');
        return undefined;
      }

      if (getCallbackData(ctx) === REGISTRATION_EDIT_CALLBACKS.PROMPT_BACK) {
        await answerRegistrationCallback(ctx);
        await renderRegistrationPanel(
          ctx,
          buildFieldSelectionText(),
          getRegistrationEditFieldsKeyboard(REGISTRATION_EDITABLE_FIELDS),
        );
        ctx.wizard.selectStep(2);
        return undefined;
      }

      const state = getSceneState(ctx);
      const fieldConfig = getRegistrationEditableField(state.selectedField);
      const value = getMessageText(ctx);

      if (!fieldConfig) {
        await renderRegistrationPanel(
          ctx,
          buildFieldSelectionText(),
          getRegistrationEditFieldsKeyboard(REGISTRATION_EDITABLE_FIELDS),
        );
        ctx.wizard.selectStep(2);
        return undefined;
      }

      if (!value) {
        await renderRegistrationPanel(
          ctx,
          buildPromptText(fieldConfig, 'РќР°РїРёС€Рё РЅРѕРІРѕРµ Р·РЅР°С‡РµРЅРёРµ РёР»Рё РЅР°Р¶РјРё В«РќР°Р·Р°РґВ».'),
          getRegistrationEditPromptKeyboard(),
        );
        return undefined;
      }

      try {
        const result = await ctx.state.services.registrationService.updateRegistrationField({
          field: fieldConfig.key,
          userId: state.userId,
          value,
        });

        state.registration = result.registration;
        state.selectedField = null;

        await renderRegistrationPanel(
          ctx,
          buildRegistrationOverviewText(
            result.registration,
            result.changed ? fieldConfig.successMessage : 'РЈ С‚РµР±СЏ СѓР¶Рµ СѓРєР°Р·Р°РЅРѕ СЌС‚Рѕ Р·РЅР°С‡РµРЅРёРµ.',
          ),
          getRegistrationOverviewKeyboard(),
        );
        ctx.wizard.selectStep(1);
        return undefined;
      } catch (error) {
        if (error instanceof ValidationError) {
          await renderRegistrationPanel(
            ctx,
            buildPromptText(fieldConfig, error.message),
            getRegistrationEditPromptKeyboard(),
          );
          return undefined;
        }

        throw error;
      }
    },
  );
}

```

