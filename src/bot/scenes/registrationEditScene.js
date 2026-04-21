import { Scenes } from 'telegraf';

import { BOT_TEXTS } from '../../utils/constants.js';
import { ValidationError } from '../../utils/errors.js';
import { formatRegistrationSizes, getRegistrationCdekAddress, getRegistrationHomeAddress } from '../../utils/registration.js';
import { REGISTRATION_EDITABLE_FIELDS, getRegistrationEditableField } from '../../utils/registrationEdit.js';
import { buildPersonalPdfFileMeta, isPdfDocument } from '../../utils/userPdf.js';
import {
  isMessageNotModifiedError,
  isUnavailableMessageError,
  normalizeInlineMarkup,
} from '../utils/inlineKeyboard.js';
import {
  getRegistrationEditFieldsKeyboard,
  getRegistrationEditPromptKeyboard,
  getRegistrationOverviewKeyboard,
  getRegistrationPdfPromptKeyboard,
  REGISTRATION_EDIT_CALLBACKS,
} from '../keyboards/registration.js';
import { getMainMenuKeyboard } from '../keyboards/mainMenu.js';
import { maybeOpenAdminMenuFromScene } from '../utils/adminEntry.js';
import {
  leaveActiveScene,
  markSceneExitReason,
  SCENE_EXIT_REASONS,
} from '../utils/sceneNavigation.js';
import { REGISTRATION_EDIT_SCENE_ID, REGISTRATION_SCENE_ID } from './sceneIds.js';

export { REGISTRATION_EDIT_SCENE_ID };

function getSceneState(ctx) {
  ctx.wizard.state.registrationEdit ??= {};
  return ctx.wizard.state.registrationEdit;
}

function getMessageText(ctx) {
  return ctx.message?.text?.trim() ?? '';
}

function getMessageDocument(ctx) {
  return ctx.message?.document ?? null;
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
  const state = ctx.wizard?.state ?? ctx.scene?.state;
  return state?.registrationEdit?.panel ?? null;
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
    lines.push(`Причина: ${user.blockedReason}`);
  }

  lines.push(`Если нужна помощь: ${supportContact}`);

  return lines.join('\n');
}

function buildRegistrationOverviewText(registration, notice = '', hasUserPdf = false) {
  const homeAddress = getRegistrationHomeAddress(registration);
  const cdekAddress = getRegistrationCdekAddress(registration);

  return [
    notice,
    'Твои данные',
    '',
    `ФИО: ${registration.fullName}`,
    `Телефон: ${registration.phone}`,
    `Ник: ${registration.telegramUsername}`,
    `Домашний адрес: ${homeAddress || 'не указан'}`,
    `Адрес СДЭК: ${cdekAddress || 'не указан'}`,
    '',
    formatRegistrationSizes(registration.sizes),
    '',
    hasUserPdf ? BOT_TEXTS.USER_PDF_STATUS_READY : BOT_TEXTS.USER_PDF_STATUS_MISSING,
  ]
    .filter(Boolean)
    .join('\n');
}

function buildRegistrationOverviewKeyboard(state) {
  return getRegistrationOverviewKeyboard({
    hasUserPdf: Boolean(state?.userPdf),
  });
}

function buildFieldSelectionText(notice = '') {
  return [notice, 'Что хочешь изменить?']
    .filter(Boolean)
    .join('\n\n');
}

function buildPromptText(fieldConfig, notice = '') {
  return [notice, fieldConfig.prompt]
    .filter(Boolean)
    .join('\n\n');
}

function buildPdfPromptText(notice = '') {
  return [notice, BOT_TEXTS.USER_PDF_PROMPT]
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

async function leaveRegistrationEditScene(
  ctx,
  {
    menuMessage = BOT_TEXTS.MENU_HINT,
    panelText = null,
    reason = SCENE_EXIT_REASONS.CANCEL,
  } = {},
) {
  if (panelText) {
    await renderRegistrationPanel(ctx, panelText);
  } else {
    await clearRegistrationPanelKeyboard(ctx);
  }

  await leaveActiveScene(ctx, {
    forceReset: true,
    reason,
  });

  if (menuMessage) {
    await ctx.reply(menuMessage, getMainMenuKeyboard());
  }
}

async function ensureRegistrationEditAccess(ctx) {
  const user = await ctx.state.services.registrationService.ensureTelegramUser(ctx.from);
  const isBlocked = await ctx.state.services.bookingService.isUserBlocked(user.id);

  if (isBlocked) {
    await leaveRegistrationEditScene(ctx, {
      menuMessage: buildBlockedMessage(user, ctx.state.env.SUPPORT_CONTACT),
      reason: SCENE_EXIT_REASONS.CANCEL,
    });
    return null;
  }

  const registration = await ctx.state.services.registrationService.getRegistrationByUserId(user.id);

  if (!registration) {
    markSceneExitReason(ctx, SCENE_EXIT_REASONS.CANCEL);
    await ctx.scene.enter(REGISTRATION_SCENE_ID);
    return null;
  }

  const userPdf = await ctx.state.services.userPdfService.getUserPdf(user.id);

  return {
    registration,
    user,
    userPdf,
  };
}

export function createRegistrationEditScene() {
  const scene = new Scenes.WizardScene(
    REGISTRATION_EDIT_SCENE_ID,
    async (ctx) => {
      if (await maybeOpenAdminMenuFromScene(ctx)) {
        return undefined;
      }

      const access = await ensureRegistrationEditAccess(ctx);

      if (!access) {
        return undefined;
      }

      const state = getSceneState(ctx);
      state.registration = access.registration;
      state.userId = access.user.id;
      state.userPdf = access.userPdf;

      if (ctx.scene.state?.openPdfUpload) {
        state.selectedField = null;
        await renderRegistrationPanel(
          ctx,
          buildPdfPromptText(),
          getRegistrationPdfPromptKeyboard(),
        );
        ctx.wizard.selectStep(4);
        return undefined;
      }

      await renderRegistrationPanel(
        ctx,
        buildRegistrationOverviewText(access.registration, '', Boolean(access.userPdf)),
        buildRegistrationOverviewKeyboard(state),
      );

      return ctx.wizard.next();
    },
    async (ctx) => {
      if (await maybeOpenAdminMenuFromScene(ctx)) {
        return undefined;
      }

      if (isCancelAction(ctx)) {
        await leaveRegistrationEditScene(ctx, {
          menuMessage: 'Изменение данных можно продолжить позже.',
          reason: SCENE_EXIT_REASONS.CANCEL,
        });
        return undefined;
      }

      const callbackData = getCallbackData(ctx);
      const state = getSceneState(ctx);

      if (callbackData === REGISTRATION_EDIT_CALLBACKS.OVERVIEW_BACK) {
        await answerRegistrationCallback(ctx);
        await leaveRegistrationEditScene(ctx, {
          reason: SCENE_EXIT_REASONS.BACK,
        });
        return undefined;
      }

      if (callbackData === REGISTRATION_EDIT_CALLBACKS.OVERVIEW_PDF) {
        await answerRegistrationCallback(ctx);
        state.selectedField = null;
        await renderRegistrationPanel(
          ctx,
          buildPdfPromptText(),
          getRegistrationPdfPromptKeyboard(),
        );
        ctx.wizard.selectStep(4);
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
            'Нажми «Изменить данные», чтобы обновить нужное поле.',
            Boolean(state.userPdf),
          ),
          buildRegistrationOverviewKeyboard(state),
        );
      }

      return undefined;
    },
    async (ctx) => {
      if (await maybeOpenAdminMenuFromScene(ctx)) {
        return undefined;
      }

      if (isCancelAction(ctx)) {
        await leaveRegistrationEditScene(ctx, {
          menuMessage: 'Изменение данных можно продолжить позже.',
          reason: SCENE_EXIT_REASONS.CANCEL,
        });
        return undefined;
      }

      const callbackData = getCallbackData(ctx);

      if (callbackData === REGISTRATION_EDIT_CALLBACKS.FIELDS_BACK) {
        await answerRegistrationCallback(ctx);
        await renderRegistrationPanel(
          ctx,
          buildRegistrationOverviewText(
            getSceneState(ctx).registration,
            '',
            Boolean(getSceneState(ctx).userPdf),
          ),
          buildRegistrationOverviewKeyboard(getSceneState(ctx)),
        );
        ctx.wizard.selectStep(1);
        return undefined;
      }

      const fieldKey = extractCallbackValue(ctx, REGISTRATION_EDIT_CALLBACKS.FIELD_PREFIX);
      const fieldConfig = getRegistrationEditableField(fieldKey);

      if (!fieldConfig) {
        if (ctx.callbackQuery) {
          await answerRegistrationCallback(ctx, 'Выбери поле ниже.');
        }

        if (getMessageText(ctx)) {
          await renderRegistrationPanel(
            ctx,
            buildFieldSelectionText('Сначала выбери поле ниже.'),
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
      if (await maybeOpenAdminMenuFromScene(ctx)) {
        return undefined;
      }

      if (isCancelAction(ctx)) {
        await leaveRegistrationEditScene(ctx, {
          menuMessage: 'Изменение данных можно продолжить позже.',
          reason: SCENE_EXIT_REASONS.CANCEL,
        });
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
          buildPromptText(fieldConfig, 'Напиши новое значение или нажми «Назад».'),
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

        await leaveRegistrationEditScene(ctx, {
          panelText: buildRegistrationOverviewText(
            result.registration,
            result.changed ? fieldConfig.successMessage : 'У тебя уже указано это значение.',
            Boolean(state.userPdf),
          ),
          reason: SCENE_EXIT_REASONS.SAVE,
        });
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
    async (ctx) => {
      if (await maybeOpenAdminMenuFromScene(ctx)) {
        return undefined;
      }

      if (isCancelAction(ctx)) {
        await leaveRegistrationEditScene(ctx, {
          menuMessage: 'Изменение данных можно продолжить позже.',
          reason: SCENE_EXIT_REASONS.CANCEL,
        });
        return undefined;
      }

      const callbackData = getCallbackData(ctx);
      const state = getSceneState(ctx);

      if (callbackData === REGISTRATION_EDIT_CALLBACKS.PDF_BACK) {
        await answerRegistrationCallback(ctx);
        await renderRegistrationPanel(
          ctx,
          buildRegistrationOverviewText(
            state.registration,
            '',
            Boolean(state.userPdf),
          ),
          buildRegistrationOverviewKeyboard(state),
        );
        ctx.wizard.selectStep(1);
        return undefined;
      }

      const document = getMessageDocument(ctx);

      if (!isPdfDocument(document)) {
        await renderRegistrationPanel(
          ctx,
          buildPdfPromptText(BOT_TEXTS.USER_PDF_INVALID),
          getRegistrationPdfPromptKeyboard(),
        );
        return undefined;
      }

      try {
        const fileMeta = buildPersonalPdfFileMeta(document, BOT_TEXTS.USER_PDF_INVALID);

        state.userPdf = state.userPdf
          ? await ctx.state.services.userPdfService.replaceUserPdf(state.userId, fileMeta)
          : await ctx.state.services.userPdfService.saveUserPdf(state.userId, fileMeta);
      } catch (error) {
        if (error instanceof ValidationError) {
          await renderRegistrationPanel(
            ctx,
            buildPdfPromptText(error.message),
            getRegistrationPdfPromptKeyboard(),
          );
          return undefined;
        }

        throw error;
      }

      await renderRegistrationPanel(
        ctx,
        BOT_TEXTS.USER_PDF_SAVED,
        buildRegistrationOverviewKeyboard(state),
      );
      ctx.wizard.selectStep(1);
      return undefined;
    },
  );

  scene.leave(async (ctx, next) => {
    try {
      await clearRegistrationPanelKeyboard(ctx);
    } catch (error) {
      ctx.state?.requestLogger?.warn(
        { err: error },
        'Failed to clear registration edit panel keyboard on scene leave',
      );
    }

    return next();
  });

  return scene;
}
