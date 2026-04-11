import { AdminRole } from '@prisma/client';
import { Scenes } from 'telegraf';

import { formatAdminAccountSummary, formatAdminAccountsList, formatAdminRoleLabel } from '../../utils/formatters.js';
import { ValidationError } from '../../utils/errors.js';
import { normalizeTelegramId } from '../../utils/validators.js';
import {
  ADMIN_CALLBACKS,
  getAdminBackKeyboard,
  getAdminCancelKeyboard,
  getAdminConfirmKeyboard,
  getAdminOptionKeyboard,
} from '../keyboards/admin.js';
import {
  answerAdminCallback,
  getAdminCallbackData,
  getAdminText,
  leaveAdminScene,
  maybeLeaveAdminScene,
  renderAdminPanel,
} from './adminShared.js';

export const ADMIN_ADMIN_SCENE_ID = 'admin-admin-scene';

const ADMIN_MANAGEMENT_ACTIONS = Object.freeze({
  ADD: 'add',
  CHANGE_ROLE: 'change_role',
  DEACTIVATE: 'deactivate',
  LIST: 'list',
});

const ACTION_PREFIX = 'admin-admin:action:';
const TARGET_PREFIX = 'admin-admin:target:';
const ROLE_PREFIX = 'admin-admin:role:';

function getSceneState(ctx) {
  ctx.wizard.state.adminAdmin ??= {};
  return ctx.wizard.state.adminAdmin;
}

function extractCallbackValue(ctx, prefix) {
  const callbackData = getAdminCallbackData(ctx);
  return callbackData.startsWith(prefix) ? callbackData.slice(prefix.length) : null;
}

function buildActionKeyboard() {
  return getAdminOptionKeyboard(
    [
      { text: 'Список админов', callbackData: `${ACTION_PREFIX}${ADMIN_MANAGEMENT_ACTIONS.LIST}` },
      { text: 'Добавить админа', callbackData: `${ACTION_PREFIX}${ADMIN_MANAGEMENT_ACTIONS.ADD}` },
      { text: 'Изменить роль', callbackData: `${ACTION_PREFIX}${ADMIN_MANAGEMENT_ACTIONS.CHANGE_ROLE}` },
      { text: 'Отключить админа', callbackData: `${ACTION_PREFIX}${ADMIN_MANAGEMENT_ACTIONS.DEACTIVATE}` },
    ],
    {
      cancelCallbackData: ADMIN_CALLBACKS.MENU,
      cancelText: 'Назад',
    },
  );
}

function buildAdminTargetKeyboard(admins) {
  return getAdminOptionKeyboard(
    admins.map((admin) => ({
      text: buildAdminTargetLabel(admin),
      callbackData: `${TARGET_PREFIX}${admin.id}`,
    })),
    {
      cancelCallbackData: ADMIN_CALLBACKS.MENU,
      cancelText: 'Назад',
    },
  );
}

function buildAdminTargetLabel(admin) {
  const baseLabel =
    admin.displayName ||
    admin.user?.username ||
    admin.user?.firstName ||
    admin.user?.telegramId ||
    'Администратор';
  const roleLabel = formatAdminRoleLabel(admin.role);
  const label = `${baseLabel} / ${roleLabel}`;

  return label.length > 55 ? `${label.slice(0, 52)}...` : label;
}

function buildRoleKeyboard() {
  return getAdminOptionKeyboard(
    [
      { text: 'super_admin', callbackData: `${ROLE_PREFIX}${AdminRole.FULL}` },
      { text: 'operator_admin', callbackData: `${ROLE_PREFIX}${AdminRole.LIMITED}` },
    ],
    {
      cancelCallbackData: ADMIN_CALLBACKS.MENU,
      cancelText: 'Назад',
    },
  );
}

function buildActionMenuText() {
  return [
    'Админы',
    'Выбери действие.',
  ].join('\n');
}

function buildAddConfirmText(state) {
  return [
    'Подтвердить добавление администратора?',
    '',
    `Telegram ID: ${state.targetTelegramId}`,
    `Роль: ${formatAdminRoleLabel(state.selectedRole)}`,
  ].join('\n');
}

function buildChangeRoleConfirmText(state) {
  return [
    'Подтвердить изменение роли?',
    '',
    formatAdminAccountSummary(state.targetAdmin),
    `Новая роль: ${formatAdminRoleLabel(state.selectedRole)}`,
  ].join('\n');
}

function buildDeactivateConfirmText(admin) {
  return [
    'Отключить доступ администратора?',
    '',
    formatAdminAccountSummary(admin),
  ].join('\n');
}

async function showActionMenu(ctx) {
  await renderAdminPanel(ctx, buildActionMenuText(), buildActionKeyboard());
}

export function createAdminAdminScene() {
  return new Scenes.WizardScene(
    ADMIN_ADMIN_SCENE_ID,
    async (ctx) => {
      const state = getSceneState(ctx);
      const rootAdmin = await ctx.state.services.adminService.assertRootAdmin(ctx.from.id);

      state.rootAdmin = rootAdmin;
      state.action = null;
      state.targetAdmin = null;
      state.targetOptions = [];
      state.targetTelegramId = null;
      state.selectedRole = null;

      await showActionMenu(ctx);
      return ctx.wizard.next();
    },
    async (ctx) => {
      const state = getSceneState(ctx);

      if (await maybeLeaveAdminScene(ctx, state.rootAdmin)) {
        return undefined;
      }

      const action = extractCallbackValue(ctx, ACTION_PREFIX);

      if (!action) {
        await answerAdminCallback(ctx, 'Выбери действие кнопкой ниже.', true);
        return undefined;
      }

      state.action = action;

      if (action === ADMIN_MANAGEMENT_ACTIONS.LIST) {
        const admins = await ctx.state.services.adminService.listAdmins({ includeInactive: true });

        await answerAdminCallback(ctx);
        await renderAdminPanel(
          ctx,
          formatAdminAccountsList(admins, 'Админы'),
          getAdminBackKeyboard(ADMIN_CALLBACKS.ADMINS_MENU, 'Назад'),
        );
        await ctx.scene.leave();
        return undefined;
      }

      if (action === ADMIN_MANAGEMENT_ACTIONS.ADD) {
        await answerAdminCallback(ctx);
        await renderAdminPanel(
          ctx,
          'Введи Telegram ID нового администратора.',
          getAdminCancelKeyboard(),
        );
        return ctx.wizard.selectStep(2);
      }

      const targetOptions = await ctx.state.services.adminService.listManageableAdmins(ctx.from.id);

      if (targetOptions.length === 0) {
        await answerAdminCallback(ctx);
        await leaveAdminScene(
          ctx,
          state.rootAdmin,
          action === ADMIN_MANAGEMENT_ACTIONS.CHANGE_ROLE
            ? 'Сейчас нет администраторов для изменения роли.'
            : 'Сейчас нет администраторов для отключения.',
        );
        return undefined;
      }

      state.targetOptions = targetOptions;

      await answerAdminCallback(ctx);
      await renderAdminPanel(
        ctx,
        action === ADMIN_MANAGEMENT_ACTIONS.CHANGE_ROLE
          ? 'Выбери администратора для изменения роли.'
          : 'Выбери администратора для отключения.',
        buildAdminTargetKeyboard(targetOptions),
      );

      return ctx.wizard.selectStep(3);
    },
    async (ctx) => {
      const state = getSceneState(ctx);

      if (await maybeLeaveAdminScene(ctx, state.rootAdmin)) {
        return undefined;
      }

      const text = getAdminText(ctx);

      if (!text) {
        await renderAdminPanel(
          ctx,
          'Введи Telegram ID нового администратора.',
          getAdminCancelKeyboard(),
        );
        return undefined;
      }

      try {
        state.targetTelegramId = normalizeTelegramId(text);
      } catch (error) {
        if (error instanceof ValidationError) {
          await renderAdminPanel(ctx, error.message, getAdminCancelKeyboard());
          return undefined;
        }

        throw error;
      }

      await renderAdminPanel(
        ctx,
        'Выбери роль.',
        buildRoleKeyboard(),
      );

      return ctx.wizard.selectStep(4);
    },
    async (ctx) => {
      const state = getSceneState(ctx);

      if (await maybeLeaveAdminScene(ctx, state.rootAdmin)) {
        return undefined;
      }

      const targetAdminId = extractCallbackValue(ctx, TARGET_PREFIX);

      if (!targetAdminId) {
        await answerAdminCallback(ctx, 'Выбери администратора кнопкой ниже.', true);
        return undefined;
      }

      const targetAdmin = state.targetOptions.find((admin) => admin.id === targetAdminId);

      if (!targetAdmin) {
        await answerAdminCallback(ctx, 'Администратор не найден.', true);
        return undefined;
      }

      state.targetAdmin = targetAdmin;

      await answerAdminCallback(ctx);

      if (state.action === ADMIN_MANAGEMENT_ACTIONS.DEACTIVATE) {
        await renderAdminPanel(
          ctx,
          buildDeactivateConfirmText(targetAdmin),
          getAdminConfirmKeyboard('Отключить доступ'),
        );

        return ctx.wizard.selectStep(5);
      }

      await renderAdminPanel(
        ctx,
        [
          formatAdminAccountSummary(targetAdmin),
          '',
          'Выбери новую роль.',
        ].join('\n'),
        buildRoleKeyboard(),
      );

      return ctx.wizard.selectStep(4);
    },
    async (ctx) => {
      const state = getSceneState(ctx);

      if (await maybeLeaveAdminScene(ctx, state.rootAdmin)) {
        return undefined;
      }

      const selectedRole = extractCallbackValue(ctx, ROLE_PREFIX);

      if (!selectedRole) {
        await answerAdminCallback(ctx, 'Выбери роль кнопкой ниже.', true);
        return undefined;
      }

      state.selectedRole = selectedRole;

      await answerAdminCallback(ctx);
      await renderAdminPanel(
        ctx,
        state.action === ADMIN_MANAGEMENT_ACTIONS.ADD
          ? buildAddConfirmText(state)
          : buildChangeRoleConfirmText(state),
        getAdminConfirmKeyboard(
          state.action === ADMIN_MANAGEMENT_ACTIONS.ADD ? 'Добавить администратора' : 'Изменить роль',
        ),
      );

      return ctx.wizard.selectStep(5);
    },
    async (ctx) => {
      const state = getSceneState(ctx);

      if (await maybeLeaveAdminScene(ctx, state.rootAdmin)) {
        return undefined;
      }

      if (getAdminCallbackData(ctx) !== ADMIN_CALLBACKS.SCENE_CONFIRM) {
        await answerAdminCallback(ctx, 'Подтверди действие кнопкой ниже.', true);
        return undefined;
      }

      try {
        await answerAdminCallback(ctx);

        if (state.action === ADMIN_MANAGEMENT_ACTIONS.ADD) {
          const admin = await ctx.state.services.adminService.createManagedAdmin({
            actorId: ctx.from.id,
            telegramId: state.targetTelegramId,
            role: state.selectedRole,
          });

          await leaveAdminScene(
            ctx,
            state.rootAdmin,
            `Администратор добавлен.\n\n${formatAdminAccountSummary(admin)}`,
          );
          return undefined;
        }

        if (state.action === ADMIN_MANAGEMENT_ACTIONS.CHANGE_ROLE) {
          const admin = await ctx.state.services.adminService.updateManagedAdminRole({
            actorId: ctx.from.id,
            adminId: state.targetAdmin.id,
            role: state.selectedRole,
          });

          await leaveAdminScene(
            ctx,
            state.rootAdmin,
            `Роль обновлена.\n\n${formatAdminAccountSummary(admin)}`,
          );
          return undefined;
        }

        const admin = await ctx.state.services.adminService.deactivateManagedAdmin({
          actorId: ctx.from.id,
          adminId: state.targetAdmin.id,
        });

        await leaveAdminScene(
          ctx,
          state.rootAdmin,
          `Доступ администратора отключён.\n\n${formatAdminAccountSummary(admin)}`,
        );
        return undefined;
      } catch (error) {
        if (error instanceof ValidationError) {
          if (state.action === ADMIN_MANAGEMENT_ACTIONS.ADD) {
            await renderAdminPanel(
              ctx,
              `${error.message}\n\nВведи Telegram ID нового администратора.`,
              getAdminCancelKeyboard(),
            );
            ctx.wizard.selectStep(2);
            return undefined;
          }

          await leaveAdminScene(ctx, state.rootAdmin, error.message);
          return undefined;
        }

        throw error;
      }
    },
  );
}
