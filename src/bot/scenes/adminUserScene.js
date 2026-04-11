import { Scenes } from 'telegraf';

import { ADMIN_PERMISSIONS } from '../../utils/constants.js';
import { ValidationError } from '../../utils/errors.js';
import { formatAdminUserSummary } from '../../utils/formatters.js';
import {
  ADMIN_CALLBACKS,
  getAdminCancelKeyboard,
  getAdminConfirmKeyboard,
  getAdminOptionKeyboard,
  getAdminSkipKeyboard,
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

export const ADMIN_USER_SCENE_ID = 'admin-user-scene';

const USER_METHOD_PREFIX = 'admin-user:method:';
const USER_SELECT_PREFIX = 'admin-user:select:';

function getSceneState(ctx) {
  ctx.wizard.state.adminUser ??= {};
  return ctx.wizard.state.adminUser;
}

function buildMethodKeyboard() {
  return getAdminOptionKeyboard([
    {
      text: 'По Telegram ID',
      callbackData: `${USER_METHOD_PREFIX}telegram`,
    },
    {
      text: 'По username',
      callbackData: `${USER_METHOD_PREFIX}username`,
    },
    {
      text: 'Из списка',
      callbackData: `${USER_METHOD_PREFIX}list`,
    },
  ]);
}

function buildUsersKeyboard(users) {
  return getAdminOptionKeyboard(
    users.map((user) => {
      const label = user.registration?.fullName || user.username || user.telegramId;

      return {
        text: label.length > 50 ? `${label.slice(0, 47)}...` : label,
        callbackData: `${USER_SELECT_PREFIX}${user.id}`,
      };
    }),
  );
}

export function createAdminUserScene() {
  return new Scenes.WizardScene(
    ADMIN_USER_SCENE_ID,
    async (ctx) => {
      const state = getSceneState(ctx);
      const admin = await ensureAdminSceneAccess(ctx, ADMIN_PERMISSIONS.MANAGE_USERS);
      const mode = ctx.scene.state?.mode === 'unblock' ? 'unblock' : 'block';

      state.admin = admin;
      state.mode = mode;

      await renderAdminPanel(
        ctx,
        mode === 'unblock'
          ? 'Как найти креатора для разблокировки?'
          : 'Как найти креатора для блокировки?',
        buildMethodKeyboard(),
      );

      return ctx.wizard.next();
    },
    async (ctx) => {
      const state = getSceneState(ctx);

      if (await maybeLeaveAdminScene(ctx, state.admin)) {
        return undefined;
      }

      const method = extractCallbackValue(ctx, USER_METHOD_PREFIX);

      if (!method) {
        await answerAdminCallback(ctx, 'Выберите способ поиска кнопкой ниже.', true);
        return undefined;
      }

      state.method = method;
      await answerAdminCallback(ctx);

      if (method === 'list') {
        const users = await ctx.state.services.bookingService.listUsersForAdmin({
          blocked: state.mode === 'unblock' ? true : false,
          limit: 10,
        });

        if (users.length === 0) {
          await leaveAdminScene(
            ctx,
            state.admin,
            state.mode === 'unblock'
              ? 'Сейчас нет пользователей для разблокировки.'
              : 'Сейчас нет пользователей для выбора из списка.',
          );
          return undefined;
        }

        state.candidates = users;

        await renderAdminPanel(
          ctx,
          state.mode === 'unblock'
            ? 'Выберите пользователя для разблокировки.'
            : 'Выберите пользователя для блокировки.',
          buildUsersKeyboard(users),
        );
        ctx.wizard.selectStep(2);
        return undefined;
      }

      await renderAdminPanel(
        ctx,
        method === 'telegram'
          ? 'Отправьте Telegram ID пользователя одним сообщением.'
          : 'Отправьте username пользователя одним сообщением. Можно с @ или без него.',
        getAdminCancelKeyboard(),
      );

      return ctx.wizard.next();
    },
    async (ctx) => {
      const state = getSceneState(ctx);

      if (await maybeLeaveAdminScene(ctx, state.admin)) {
        return undefined;
      }

      let user = null;

      if (state.method === 'list') {
        const userId = extractCallbackValue(ctx, USER_SELECT_PREFIX);

        if (!userId) {
          await answerAdminCallback(ctx, 'Выберите пользователя кнопкой ниже.', true);
          return undefined;
        }

        user = state.candidates.find((item) => item.id === userId) ?? null;

        if (!user) {
          await answerAdminCallback(ctx, 'Пользователь не найден. Попробуйте снова.', true);
          return undefined;
        }

        await answerAdminCallback(ctx);
      } else {
        const text = getAdminText(ctx);

        if (!text) {
          await renderAdminPanel(ctx, 'Отправьте значение одним сообщением.', getAdminCancelKeyboard());
          return undefined;
        }

        try {
          user =
            state.method === 'telegram'
              ? await ctx.state.services.bookingService.findUserByTelegramId(text)
              : await ctx.state.services.bookingService.findUserByUsername(text);
        } catch (error) {
          if (error instanceof ValidationError) {
            await renderAdminPanel(ctx, error.message, getAdminCancelKeyboard());
            return undefined;
          }

          throw error;
        }

        if (!user) {
          await renderAdminPanel(ctx, 'Пользователь не найден. Попробуйте другой запрос.', getAdminCancelKeyboard());
          return undefined;
        }
      }

      state.targetUser = user;

      if (state.mode === 'block' && user.isBlocked) {
        await leaveAdminScene(ctx, state.admin, `Этот пользователь уже заблокирован.\n\n${formatAdminUserSummary(user)}`);
        return undefined;
      }

      if (state.mode === 'unblock' && !user.isBlocked) {
        await leaveAdminScene(ctx, state.admin, `Этот пользователь уже активен.\n\n${formatAdminUserSummary(user)}`);
        return undefined;
      }

      if (state.mode === 'block') {
        await renderAdminPanel(
          ctx,
          `${formatAdminUserSummary(user)}\n\nЕсли хотите, отправьте причину блокировки одним сообщением.`,
          getAdminSkipKeyboard('Без причины'),
        );
        return ctx.wizard.next();
      }

      await renderAdminPanel(
        ctx,
        `${formatAdminUserSummary(user)}\n\nПодтвердите разблокировку.`,
        getAdminConfirmKeyboard('Разблокировать'),
      );
      ctx.wizard.selectStep(4);
      return undefined;
    },
    async (ctx) => {
      const state = getSceneState(ctx);

      if (await maybeLeaveAdminScene(ctx, state.admin)) {
        return undefined;
      }

      let reason = null;

      if (ctx.callbackQuery?.data === ADMIN_CALLBACKS.SCENE_SKIP) {
        await answerAdminCallback(ctx);
      } else {
        reason = getAdminText(ctx);

        if (!reason) {
          await renderAdminPanel(
            ctx,
            'Отправьте причину одним сообщением или нажмите "Без причины".',
            getAdminSkipKeyboard('Без причины'),
          );
          return undefined;
        }
      }

      await ctx.state.services.bookingService.blockUser(
        state.targetUser.id,
        ctx.from.id,
        reason,
      );
      state.targetUser = {
        ...state.targetUser,
        blockedReason: reason ?? 'Пользователь заблокирован администратором',
        isBlocked: true,
      };

      await leaveAdminScene(
        ctx,
        state.admin,
        `Пользователь успешно заблокирован.\n\n${formatAdminUserSummary(state.targetUser)}`,
      );

      return undefined;
    },
    async (ctx) => {
      const state = getSceneState(ctx);

      if (await maybeLeaveAdminScene(ctx, state.admin)) {
        return undefined;
      }

      if (ctx.callbackQuery?.data !== ADMIN_CALLBACKS.SCENE_CONFIRM) {
        await answerAdminCallback(ctx, 'Подтвердите действие кнопкой ниже.', true);
        return undefined;
      }

      await answerAdminCallback(ctx);
      await ctx.state.services.bookingService.unblockUser(state.targetUser.id, ctx.from.id);
      state.targetUser = {
        ...state.targetUser,
        blockedReason: null,
        isBlocked: false,
      };

      await leaveAdminScene(
        ctx,
        state.admin,
        `Пользователь успешно разблокирован.\n\n${formatAdminUserSummary(state.targetUser)}`,
      );

      return undefined;
    },
  );
}
