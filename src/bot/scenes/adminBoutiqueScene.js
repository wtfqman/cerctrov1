import { Scenes } from 'telegraf';

import { ADMIN_PERMISSIONS } from '../../utils/constants.js';
import { ValidationError } from '../../utils/errors.js';
import { formatBoutiqueAddress } from '../../utils/formatters.js';
import { formatEmailList, normalizeEmailList, normalizeOptionalEmail } from '../../utils/mail.js';
import {
  ADMIN_CALLBACKS,
  getAdminCancelKeyboard,
  getAdminConfirmKeyboard,
  getAdminOptionKeyboard,
} from '../keyboards/admin.js';
import {
  answerAdminCallback,
  ensureAdminSceneAccess,
  extractCallbackValue,
  getAdminText,
  leaveAdminScene,
  maybeLeaveAdminScene,
  renderAdminPanel,
} from './adminShared.js';

export const ADMIN_BOUTIQUE_SCENE_ID = 'admin-boutique-scene';

const BOUTIQUE_SELECT_PREFIX = 'admin-boutique:select:';

function getSceneState(ctx) {
  ctx.wizard.state.adminBoutique ??= {};
  return ctx.wizard.state.adminBoutique;
}

function buildBoutiquesKeyboard(boutiques) {
  return getAdminOptionKeyboard(
    boutiques.map((boutique) => ({
      text: boutique.name,
      callbackData: `${BOUTIQUE_SELECT_PREFIX}${boutique.id}`,
    })),
  );
}

function buildBoutiqueSummary(boutique) {
  const lines = [
    boutique.name,
    formatBoutiqueAddress(boutique) || 'Адрес не указан',
  ];

  if (boutique.email) {
    lines.push(`Email: ${boutique.email}`);
  }

  if (boutique.ccEmails) {
    lines.push(`Копия: ${formatEmailList(boutique.ccEmails)}`);
  }

  return lines.join('\n');
}

export function createAdminBoutiqueScene() {
  return new Scenes.WizardScene(
    ADMIN_BOUTIQUE_SCENE_ID,
    async (ctx) => {
      const state = getSceneState(ctx);
      const admin = await ensureAdminSceneAccess(ctx, ADMIN_PERMISSIONS.MANAGE_BOUTIQUES);
      const mode = ctx.scene.state?.mode === 'remove' ? 'remove' : 'add';

      state.admin = admin;
      state.mode = mode;

      if (mode === 'remove') {
        const boutiques = await ctx.state.services.bookingService.getVisibleBoutiques({
          includeTimeSlots: false,
        });

        if (boutiques.length === 0) {
          await leaveAdminScene(ctx, admin, 'Сейчас нет активных бутиков для удаления.');
          return undefined;
        }

        state.boutiques = boutiques;

        await renderAdminPanel(ctx, 'Выберите бутик, который нужно удалить.', buildBoutiquesKeyboard(boutiques));
        return ctx.wizard.next();
      }

      await renderAdminPanel(ctx, 'Укажите город бутика одним сообщением.', getAdminCancelKeyboard());
      return ctx.wizard.next();
    },
    async (ctx) => {
      const state = getSceneState(ctx);

      if (await maybeLeaveAdminScene(ctx, state.admin)) {
        return undefined;
      }

      if (state.mode === 'remove') {
        const boutiqueId = extractCallbackValue(ctx, BOUTIQUE_SELECT_PREFIX);

        if (!boutiqueId) {
          await answerAdminCallback(ctx, 'Выберите бутик кнопкой ниже.', true);
          return undefined;
        }

        const boutique = state.boutiques.find((item) => item.id === boutiqueId);

        if (!boutique) {
          await answerAdminCallback(ctx, 'Бутик не найден. Попробуйте снова.', true);
          return undefined;
        }

        state.boutique = boutique;

        await answerAdminCallback(ctx);
        await renderAdminPanel(
          ctx,
          `Подтвердите удаление бутика.\n\n${buildBoutiqueSummary(boutique)}`,
          getAdminConfirmKeyboard('Удалить бутик'),
        );
        ctx.wizard.selectStep(6);
        return undefined;
      }

      state.city = getAdminText(ctx);

      if (!state.city) {
        await renderAdminPanel(ctx, 'Город не должен быть пустым. Попробуйте еще раз.', getAdminCancelKeyboard());
        return undefined;
      }

      await renderAdminPanel(ctx, 'Теперь укажите название бутика.', getAdminCancelKeyboard());
      return ctx.wizard.next();
    },
    async (ctx) => {
      const state = getSceneState(ctx);

      if (await maybeLeaveAdminScene(ctx, state.admin)) {
        return undefined;
      }

      state.name = getAdminText(ctx);

      if (!state.name) {
        await renderAdminPanel(ctx, 'Название не должно быть пустым. Попробуйте еще раз.', getAdminCancelKeyboard());
        return undefined;
      }

      await renderAdminPanel(ctx, 'Укажите адрес бутика одной строкой.', getAdminCancelKeyboard());
      return ctx.wizard.next();
    },
    async (ctx) => {
      const state = getSceneState(ctx);

      if (await maybeLeaveAdminScene(ctx, state.admin)) {
        return undefined;
      }

      state.addressLine1 = getAdminText(ctx);

      if (!state.addressLine1) {
        await renderAdminPanel(ctx, 'Адрес не должен быть пустым. Попробуйте еще раз.', getAdminCancelKeyboard());
        return undefined;
      }

      await renderAdminPanel(
        ctx,
        'Укажите email бутика или отправьте "-" если уведомления пока не нужны.',
        getAdminCancelKeyboard(),
      );
      return ctx.wizard.next();
    },
    async (ctx) => {
      const state = getSceneState(ctx);

      if (await maybeLeaveAdminScene(ctx, state.admin)) {
        return undefined;
      }

      try {
        state.email = normalizeOptionalEmail(getAdminText(ctx), 'Email бутика');
      } catch (error) {
        if (error instanceof ValidationError) {
          await renderAdminPanel(ctx, `${error.message}\nПопробуйте еще раз.`, getAdminCancelKeyboard());
          return undefined;
        }

        throw error;
      }

      await renderAdminPanel(
        ctx,
        'Укажите дополнительные email через запятую или отправьте "-" если не нужно.',
        getAdminCancelKeyboard(),
      );
      return ctx.wizard.next();
    },
    async (ctx) => {
      const state = getSceneState(ctx);

      if (await maybeLeaveAdminScene(ctx, state.admin)) {
        return undefined;
      }

      try {
        state.ccEmails = normalizeEmailList(getAdminText(ctx), {
          allowEmpty: true,
          fieldName: 'Дополнительные email',
        });
      } catch (error) {
        if (error instanceof ValidationError) {
          await renderAdminPanel(ctx, `${error.message}\nПопробуйте еще раз.`, getAdminCancelKeyboard());
          return undefined;
        }

        throw error;
      }

      const boutique = await ctx.state.services.bookingService.createBoutique(
        {
          city: state.city,
          name: state.name,
          addressLine1: state.addressLine1,
          ccEmails: state.ccEmails,
          email: state.email,
        },
        ctx.from.id,
      );

      await leaveAdminScene(
        ctx,
        state.admin,
        `Бутик успешно добавлен.\n\n${buildBoutiqueSummary(boutique)}`,
      );

      return undefined;
    },
    async (ctx) => {
      const state = getSceneState(ctx);

      if (await maybeLeaveAdminScene(ctx, state.admin)) {
        return undefined;
      }

      if (ctx.callbackQuery?.data !== ADMIN_CALLBACKS.SCENE_CONFIRM) {
        await answerAdminCallback(ctx, 'Подтвердите удаление кнопкой ниже.', true);
        return undefined;
      }

      await answerAdminCallback(ctx);
      await ctx.state.services.bookingService.removeBoutique(state.boutique.id, ctx.from.id);

      await leaveAdminScene(
        ctx,
        state.admin,
        `Бутик "${state.boutique.name}" деактивирован.`,
      );

      return undefined;
    },
  );
}
