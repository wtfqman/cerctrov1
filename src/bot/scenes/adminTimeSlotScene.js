import { Scenes } from 'telegraf';

import { ADMIN_PERMISSIONS } from '../../utils/constants.js';
import { formatSlotLabelForUser } from '../../utils/slots.js';
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

export const ADMIN_TIME_SLOT_SCENE_ID = 'admin-time-slot-scene';

const TIME_SLOT_BOUTIQUE_PREFIX = 'admin-time-slot:boutique:';
const TIME_SLOT_SELECT_PREFIX = 'admin-time-slot:select:';

function getSceneState(ctx) {
  ctx.wizard.state.adminTimeSlot ??= {};
  return ctx.wizard.state.adminTimeSlot;
}

function isValidTimeValue(value) {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);
}

function toMinutes(value) {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

function buildSlotLabel(startTime, endTime) {
  const compact = (value) => (value.endsWith(':00') ? value.slice(0, 2) : value);
  return `${compact(startTime)}-${compact(endTime)}`;
}

function buildSortOrder(startTime) {
  const [hours, minutes] = startTime.split(':').map(Number);
  return hours * 100 + minutes;
}

function buildBoutiquesKeyboard(boutiques) {
  return getAdminOptionKeyboard(
    boutiques.map((boutique) => ({
      text: boutique.name,
      callbackData: `${TIME_SLOT_BOUTIQUE_PREFIX}${boutique.id}`,
    })),
  );
}

function buildSlotsKeyboard(slots) {
  return getAdminOptionKeyboard(
    slots.map((slot) => ({
      text: formatSlotLabelForUser(slot.label),
      callbackData: `${TIME_SLOT_SELECT_PREFIX}${slot.id}`,
    })),
  );
}

export function createAdminTimeSlotScene() {
  return new Scenes.WizardScene(
    ADMIN_TIME_SLOT_SCENE_ID,
    async (ctx) => {
      const state = getSceneState(ctx);
      const admin = await ensureAdminSceneAccess(ctx, ADMIN_PERMISSIONS.MANAGE_TIME_SLOTS);
      const mode = ctx.scene.state?.mode === 'remove' ? 'remove' : 'add';
      const boutiques = await ctx.state.services.bookingService.getVisibleBoutiques();

      if (boutiques.length === 0) {
        await leaveAdminScene(ctx, admin, 'Сначала добавьте хотя бы один бутик.');
        return undefined;
      }

      state.admin = admin;
      state.mode = mode;
      state.boutiques = boutiques;

      await renderAdminPanel(
        ctx,
        mode === 'remove'
          ? 'Выберите бутик, из которого нужно удалить слот.'
          : 'Выберите бутик, в который нужно добавить слот.',
        buildBoutiquesKeyboard(boutiques),
      );

      return ctx.wizard.next();
    },
    async (ctx) => {
      const state = getSceneState(ctx);

      if (await maybeLeaveAdminScene(ctx, state.admin)) {
        return undefined;
      }

      const boutiqueId = extractCallbackValue(ctx, TIME_SLOT_BOUTIQUE_PREFIX);

      if (!boutiqueId) {
        await answerAdminCallback(ctx, 'Выберите бутик кнопкой ниже.', true);
        return undefined;
      }

      const boutique = state.boutiques.find((item) => item.id === boutiqueId);

      if (!boutique) {
        await answerAdminCallback(ctx, 'Бутик не найден. Попробуйте еще раз.', true);
        return undefined;
      }

      state.boutique = boutique;
      await answerAdminCallback(ctx);

      if (state.mode === 'remove') {
        const slots = await ctx.state.services.bookingService.getTimeSlots(boutique.id);

        if (slots.length === 0) {
          await leaveAdminScene(ctx, state.admin, 'В этом бутике нет активных слотов.');
          return undefined;
        }

        state.slots = slots;

        await renderAdminPanel(
          ctx,
          `Бутик: ${boutique.name}\n\nВыберите слот для удаления.`,
          buildSlotsKeyboard(slots),
        );
        ctx.wizard.selectStep(4);
        return undefined;
      }

      await renderAdminPanel(ctx, 'Отправьте время начала в формате HH:mm. Например: 11:00', getAdminCancelKeyboard());
      return ctx.wizard.next();
    },
    async (ctx) => {
      const state = getSceneState(ctx);

      if (await maybeLeaveAdminScene(ctx, state.admin)) {
        return undefined;
      }

      const startTime = getAdminText(ctx);

      if (!isValidTimeValue(startTime)) {
        await renderAdminPanel(ctx, 'Нужен формат времени HH:mm. Например: 11:00', getAdminCancelKeyboard());
        return undefined;
      }

      state.startTime = startTime;

      await renderAdminPanel(ctx, 'Теперь отправьте время окончания в формате HH:mm. Например: 12:00', getAdminCancelKeyboard());
      return ctx.wizard.next();
    },
    async (ctx) => {
      const state = getSceneState(ctx);

      if (await maybeLeaveAdminScene(ctx, state.admin)) {
        return undefined;
      }

      const endTime = getAdminText(ctx);

      if (!isValidTimeValue(endTime)) {
        await renderAdminPanel(ctx, 'Нужен формат времени HH:mm. Например: 12:00', getAdminCancelKeyboard());
        return undefined;
      }

      if (toMinutes(endTime) <= toMinutes(state.startTime)) {
        await renderAdminPanel(ctx, 'Время окончания должно быть позже времени начала.', getAdminCancelKeyboard());
        return undefined;
      }

      const slot = await ctx.state.services.bookingService.createTimeSlot(
        state.boutique.id,
        {
          label: buildSlotLabel(state.startTime, endTime),
          startTime: state.startTime,
          endTime,
          sortOrder: buildSortOrder(state.startTime),
        },
        ctx.from.id,
      );

      await leaveAdminScene(
        ctx,
        state.admin,
        `Слот успешно добавлен.\n\nБутик: ${state.boutique.name}\nСлот: ${formatSlotLabelForUser(slot.label)}`,
      );

      return undefined;
    },
    async (ctx) => {
      const state = getSceneState(ctx);

      if (await maybeLeaveAdminScene(ctx, state.admin)) {
        return undefined;
      }

      const slotId = extractCallbackValue(ctx, TIME_SLOT_SELECT_PREFIX);

      if (!slotId) {
        await answerAdminCallback(ctx, 'Выберите слот кнопкой ниже.', true);
        return undefined;
      }

      const slot = state.slots.find((item) => item.id === slotId);

      if (!slot) {
        await answerAdminCallback(ctx, 'Слот не найден. Попробуйте снова.', true);
        return undefined;
      }

      state.selectedSlot = slot;

      await answerAdminCallback(ctx);
      await renderAdminPanel(
        ctx,
        `Подтвердите удаление слота.\n\nБутик: ${state.boutique.name}\nСлот: ${formatSlotLabelForUser(slot.label)}`,
        getAdminConfirmKeyboard('Удалить слот'),
      );

      return ctx.wizard.next();
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
      await ctx.state.services.bookingService.removeTimeSlot(state.selectedSlot.id, ctx.from.id);

      await leaveAdminScene(
        ctx,
        state.admin,
        `Слот "${formatSlotLabelForUser(state.selectedSlot.label)}" деактивирован.`,
      );

      return undefined;
    },
  );
}
