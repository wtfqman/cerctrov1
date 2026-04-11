import { Scenes } from 'telegraf';

import { BOT_TEXTS } from '../../utils/constants.js';
import { ValidationError } from '../../utils/errors.js';
import { formatRegistrationConfirmation } from '../../utils/formatters.js';
import { parseRegistrationSizes } from '../../utils/registration.js';
import { buildPersonalPdfFileMeta, isPdfDocument } from '../../utils/userPdf.js';
import { ensureNonEmptyString } from '../../utils/validators.js';
import {
  getRegistrationCancelKeyboard,
  getRegistrationConfirmKeyboard,
  getRegistrationPdfChoiceKeyboard,
  getRegistrationPdfUploadKeyboard,
  getRegistrationStepKeyboard,
  getUsernameKeyboard,
  REGISTRATION_BUTTONS,
} from '../keyboards/registration.js';
import { getMainMenuKeyboard } from '../keyboards/mainMenu.js';
import { maybeOpenAdminMenuFromScene } from '../utils/adminEntry.js';
import {
  leaveActiveScene,
  markSceneExitReason,
  SCENE_EXIT_REASONS,
} from '../utils/sceneNavigation.js';
import { REGISTRATION_EDIT_SCENE_ID, REGISTRATION_SCENE_ID } from './sceneIds.js';

export { REGISTRATION_SCENE_ID };

function getSceneState(ctx) {
  ctx.wizard.state.registrationDraft ??= {};
  return ctx.wizard.state.registrationDraft;
}

function getMessageText(ctx) {
  return ctx.message?.text?.trim() ?? '';
}

function getMessageDocument(ctx) {
  return ctx.message?.document ?? null;
}

function isCancelAction(ctx) {
  const text = getMessageText(ctx);
  return text === REGISTRATION_BUTTONS.CANCEL || text === '/cancel';
}

function isBackAction(ctx) {
  return getMessageText(ctx) === REGISTRATION_BUTTONS.BACK;
}

function isLaterAction(ctx) {
  return getMessageText(ctx) === REGISTRATION_BUTTONS.LATER;
}

function buildBlockedMessage(user, supportContact) {
  const lines = [BOT_TEXTS.BLOCKED];

  if (user.blockedReason) {
    lines.push(`Причина: ${user.blockedReason}`);
  }

  lines.push(`Если нужна помощь: ${supportContact}`);

  return lines.join('\n');
}

async function leaveWithMainMenu(ctx, message, reason = SCENE_EXIT_REASONS.CANCEL) {
  await ctx.reply(message, getMainMenuKeyboard());
  await leaveActiveScene(ctx, {
    forceReset: true,
    reason,
  });
}

async function cancelFlow(ctx) {
  await leaveWithMainMenu(ctx, 'Регистрацию можно продолжить позже.');
}

async function finishFlow(ctx, message) {
  await leaveWithMainMenu(ctx, message, SCENE_EXIT_REASONS.SAVE);
}

async function ensureRegistrationAccess(ctx) {
  const user = await ctx.state.services.registrationService.ensureTelegramUser(ctx.from);
  const isBlocked = await ctx.state.services.bookingService.isUserBlocked(user.id);

  if (isBlocked) {
    await leaveWithMainMenu(ctx, buildBlockedMessage(user, ctx.state.env.SUPPORT_CONTACT));
    return null;
  }

  return user;
}

async function promptFullName(ctx) {
  await ctx.reply(
    'Напиши ФИО',
    getRegistrationCancelKeyboard(),
  );
}

async function promptPhone(ctx) {
  await ctx.reply('Напиши номер телефона', getRegistrationStepKeyboard());
}

async function promptUsername(ctx) {
  await ctx.reply(
    'Напиши свой ник в Telegram\nНапример: @username',
    getUsernameKeyboard(Boolean(ctx.from?.username)),
  );
}

async function promptAddress(ctx) {
  await ctx.reply('Напиши домашний адрес', getRegistrationStepKeyboard());
}

async function promptCdekAddress(ctx) {
  await ctx.reply('Напиши адрес СДЭК', getRegistrationStepKeyboard());
}

async function promptSizes(ctx) {
  await ctx.reply(BOT_TEXTS.REGISTRATION_SIZE_TEMPLATE, getRegistrationStepKeyboard());
}

async function promptPdfChoice(ctx) {
  await ctx.reply(
    BOT_TEXTS.REGISTRATION_DONE_WITH_PDF_PROMPT,
    getRegistrationPdfChoiceKeyboard(),
  );
}

async function promptPdfUpload(ctx, notice = '') {
  const text = [notice, BOT_TEXTS.USER_PDF_PROMPT]
    .filter(Boolean)
    .join('\n\n');

  await ctx.reply(text, getRegistrationPdfUploadKeyboard());
}

async function savePersonalPdf(ctx, state, document) {
  const fileMeta = buildPersonalPdfFileMeta(document, BOT_TEXTS.USER_PDF_INVALID);

  state.userPdf = state.userPdf
    ? await ctx.state.services.userPdfService.replaceUserPdf(state.userId, fileMeta)
    : await ctx.state.services.userPdfService.saveUserPdf(state.userId, fileMeta);

  return state.userPdf;
}

export function createRegistrationScene() {
  return new Scenes.WizardScene(
    REGISTRATION_SCENE_ID,
    async (ctx) => {
      if (await maybeOpenAdminMenuFromScene(ctx)) {
        return undefined;
      }

      const user = await ensureRegistrationAccess(ctx);

      if (!user) {
        return undefined;
      }

      const existingRegistration = await ctx.state.services.registrationService.getRegistrationByUserId(user.id);

      if (existingRegistration) {
        markSceneExitReason(ctx, SCENE_EXIT_REASONS.GLOBAL_NAVIGATION);
        await ctx.scene.enter(REGISTRATION_EDIT_SCENE_ID);
        return undefined;
      }

      ctx.wizard.state.registrationDraft = {
        profileUsername: ctx.from?.username ? `@${ctx.from.username}` : null,
        userId: user.id,
      };

      await ctx.reply('Давай быстро заполним регистрацию ✨');
      await promptFullName(ctx);
      return ctx.wizard.next();
    },
    async (ctx) => {
      if (await maybeOpenAdminMenuFromScene(ctx)) {
        return undefined;
      }

      if (isCancelAction(ctx)) {
        await cancelFlow(ctx);
        return undefined;
      }

      const fullName = getMessageText(ctx);

      try {
        getSceneState(ctx).fullName = ensureNonEmptyString(fullName, 'ФИО');
      } catch (error) {
        if (error instanceof ValidationError) {
          await ctx.reply('Напиши ФИО', getRegistrationCancelKeyboard());
          return undefined;
        }

        throw error;
      }

      await promptPhone(ctx);
      return ctx.wizard.next();
    },
    async (ctx) => {
      if (await maybeOpenAdminMenuFromScene(ctx)) {
        return undefined;
      }

      if (isCancelAction(ctx)) {
        await cancelFlow(ctx);
        return undefined;
      }

      if (isBackAction(ctx)) {
        await promptFullName(ctx);
        ctx.wizard.selectStep(1);
        return undefined;
      }

      const phone = getMessageText(ctx);

      try {
        getSceneState(ctx).phone = ensureNonEmptyString(phone, 'Телефон');
      } catch (error) {
        if (error instanceof ValidationError) {
          await promptPhone(ctx);
          return undefined;
        }

        throw error;
      }

      await promptUsername(ctx);
      return ctx.wizard.next();
    },
    async (ctx) => {
      if (await maybeOpenAdminMenuFromScene(ctx)) {
        return undefined;
      }

      if (isCancelAction(ctx)) {
        await cancelFlow(ctx);
        return undefined;
      }

      if (isBackAction(ctx)) {
        await promptPhone(ctx);
        ctx.wizard.selectStep(2);
        return undefined;
      }

      const state = getSceneState(ctx);
      const text = getMessageText(ctx);

      if (text === REGISTRATION_BUTTONS.USE_PROFILE_USERNAME) {
        if (!state.profileUsername) {
          await promptUsername(ctx);
          return undefined;
        }

        state.telegramUsername = state.profileUsername;
      } else {
        try {
          state.telegramUsername = ensureNonEmptyString(text, 'Telegram username');
        } catch (error) {
          if (error instanceof ValidationError) {
            await promptUsername(ctx);
            return undefined;
          }

          throw error;
        }
      }

      await promptAddress(ctx);
      return ctx.wizard.next();
    },
    async (ctx) => {
      if (await maybeOpenAdminMenuFromScene(ctx)) {
        return undefined;
      }

      if (isCancelAction(ctx)) {
        await cancelFlow(ctx);
        return undefined;
      }

      if (isBackAction(ctx)) {
        await promptUsername(ctx);
        ctx.wizard.selectStep(3);
        return undefined;
      }

      const address = getMessageText(ctx);

      try {
        getSceneState(ctx).homeAddress = ensureNonEmptyString(address, 'Домашний адрес');
      } catch (error) {
        if (error instanceof ValidationError) {
          await promptAddress(ctx);
          return undefined;
        }

        throw error;
      }

      await promptCdekAddress(ctx);
      return ctx.wizard.next();
    },
    async (ctx) => {
      if (await maybeOpenAdminMenuFromScene(ctx)) {
        return undefined;
      }

      if (isCancelAction(ctx)) {
        await cancelFlow(ctx);
        return undefined;
      }

      if (isBackAction(ctx)) {
        await promptAddress(ctx);
        ctx.wizard.selectStep(4);
        return undefined;
      }

      const cdekAddress = getMessageText(ctx);

      try {
        getSceneState(ctx).cdekAddress = ensureNonEmptyString(cdekAddress, 'Адрес СДЭК');
      } catch (error) {
        if (error instanceof ValidationError) {
          await promptCdekAddress(ctx);
          return undefined;
        }

        throw error;
      }

      await promptSizes(ctx);
      return ctx.wizard.next();
    },
    async (ctx) => {
      if (await maybeOpenAdminMenuFromScene(ctx)) {
        return undefined;
      }

      if (isCancelAction(ctx)) {
        await cancelFlow(ctx);
        return undefined;
      }

      if (isBackAction(ctx)) {
        await promptCdekAddress(ctx);
        ctx.wizard.selectStep(5);
        return undefined;
      }

      const sizes = getMessageText(ctx);

      try {
        const normalizedSizes = ensureNonEmptyString(sizes, 'Размеры');
        const parsedSizes = parseRegistrationSizes(normalizedSizes);

        if (!parsedSizes.hasStructuredData) {
          await ctx.reply(
            'Заполни размеры по шаблону ниже, чтобы я показал их аккуратно по полям.',
            getRegistrationStepKeyboard(),
          );
          await promptSizes(ctx);
          return undefined;
        }

        getSceneState(ctx).sizes = parsedSizes.normalizedText || parsedSizes.rawText;
      } catch (error) {
        if (error instanceof ValidationError) {
          await promptSizes(ctx);
          return undefined;
        }

        throw error;
      }

      await ctx.reply(
        formatRegistrationConfirmation(getSceneState(ctx)),
        getRegistrationConfirmKeyboard(),
      );
      return ctx.wizard.next();
    },
    async (ctx) => {
      if (await maybeOpenAdminMenuFromScene(ctx)) {
        return undefined;
      }

      if (isCancelAction(ctx)) {
        await cancelFlow(ctx);
        return undefined;
      }

      const action = getMessageText(ctx);

      if (action === REGISTRATION_BUTTONS.BACK) {
        await promptSizes(ctx);
        ctx.wizard.selectStep(6);
        return undefined;
      }

      if (action === REGISTRATION_BUTTONS.RESTART) {
        ctx.wizard.state.registrationDraft = {
          profileUsername: getSceneState(ctx).profileUsername,
          userId: getSceneState(ctx).userId,
        };
        await promptFullName(ctx);
        ctx.wizard.selectStep(1);
        return undefined;
      }

      if (action !== REGISTRATION_BUTTONS.CONFIRM) {
        await ctx.reply('Выбери кнопку ниже.', getRegistrationConfirmKeyboard());
        return undefined;
      }

      const state = getSceneState(ctx);

      try {
        await ctx.state.services.registrationService.registerUser({
          userId: state.userId,
          fullName: state.fullName,
          phone: state.phone,
          telegramUsername: state.telegramUsername,
          homeAddress: state.homeAddress,
          cdekAddress: state.cdekAddress,
          sizes: state.sizes,
          telegramProfileUsername: state.profileUsername,
        });

        state.userPdf = await ctx.state.services.userPdfService.getUserPdf(state.userId);

        if (state.userPdf) {
          const pdfResult = await ctx.state.services.registrationService.sendRegistrationPdf({
            chatId: ctx.chat.id,
            telegram: ctx.telegram,
            userId: state.userId,
          });

          await ctx.reply(
            BOT_TEXTS.REGISTRATION_DONE,
            getMainMenuKeyboard(),
          );

          if (!pdfResult.sent) {
            await ctx.reply(pdfResult.message, getMainMenuKeyboard());
          }

          await leaveActiveScene(ctx, {
            forceReset: true,
            reason: SCENE_EXIT_REASONS.SAVE,
          });
          return undefined;
        }

        await promptPdfChoice(ctx);

        const pdfResult = await ctx.state.services.registrationService.sendRegistrationPdf({
          chatId: ctx.chat.id,
          telegram: ctx.telegram,
          userId: state.userId,
        });

        if (!pdfResult.sent) {
          await ctx.reply(pdfResult.message);
        }
        return ctx.wizard.next();
      } catch (error) {
        if (error instanceof ValidationError) {
          await ctx.reply(error.message);

          if (error.details?.field === 'phone') {
            await promptPhone(ctx);
            ctx.wizard.selectStep(2);
            return undefined;
          }

          if (error.details?.field === 'registration') {
            markSceneExitReason(ctx, SCENE_EXIT_REASONS.GLOBAL_NAVIGATION);
            await ctx.scene.enter(REGISTRATION_EDIT_SCENE_ID);
            return undefined;
          }

          await ctx.reply(
            formatRegistrationConfirmation(state),
            getRegistrationConfirmKeyboard(),
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

      if (isCancelAction(ctx) || isLaterAction(ctx)) {
        await finishFlow(ctx, BOT_TEXTS.USER_PDF_LATER);
        return undefined;
      }

      if (getMessageText(ctx) === REGISTRATION_BUTTONS.UPLOAD_PDF) {
        await promptPdfUpload(ctx);
        return ctx.wizard.next();
      }

      await ctx.reply('Выбери кнопку ниже.', getRegistrationPdfChoiceKeyboard());
      return undefined;
    },
    async (ctx) => {
      if (await maybeOpenAdminMenuFromScene(ctx)) {
        return undefined;
      }

      if (isCancelAction(ctx) || isLaterAction(ctx)) {
        await finishFlow(ctx, BOT_TEXTS.USER_PDF_LATER);
        return undefined;
      }

      const state = getSceneState(ctx);
      const document = getMessageDocument(ctx);

      if (!isPdfDocument(document)) {
        await promptPdfUpload(ctx, BOT_TEXTS.USER_PDF_INVALID);
        return undefined;
      }

      try {
        await savePersonalPdf(ctx, state, document);
      } catch (error) {
        if (error instanceof ValidationError) {
          await promptPdfUpload(ctx, error.message);
          return undefined;
        }

        throw error;
      }

      await finishFlow(ctx, BOT_TEXTS.USER_PDF_SAVED);
      return undefined;
    },
  );
}
