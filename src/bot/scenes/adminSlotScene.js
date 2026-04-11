import { Scenes } from 'telegraf';

import { ADMIN_PERMISSIONS } from '../../utils/constants.js';
import { formatDate } from '../../utils/date.js';
import { formatAdminSlotStateList } from '../../utils/formatters.js';
import { formatSlotLabelForUser } from '../../utils/slots.js';
import {
  ADMIN_CALLBACKS,
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

export const ADMIN_SLOT_SCENE_ID = 'admin-slot-scene';

const SLOT_BOUTIQUE_PREFIX = 'admin-slot:boutique:';
const SLOT_DATE_PREFIX = 'admin-slot:date:';
const SLOT_OPTION_PREFIX = 'admin-slot:slot:';

function getSceneState(ctx) {
  ctx.wizard.state.adminSlot ??= {};
  return ctx.wizard.state.adminSlot;
}

function buildDateOptions(services) {
  return services.bookingService.getAvailableVisitDates(14).map((date) => ({
    code: formatDate(date, 'YYYY-MM-DD'),
    label: formatDate(date, 'DD.MM ddd'),
    value: date,
  }));
}

function buildBoutiquePrompt(boutiques) {
  return getAdminOptionKeyboard(
    boutiques.map((boutique) => ({
      text: boutique.name,
      callbackData: `${SLOT_BOUTIQUE_PREFIX}${boutique.id}`,
    })),
  );
}

function buildDatePrompt(options) {
  return getAdminOptionKeyboard(
    options.map((option) => ({
      text: option.label,
      callbackData: `${SLOT_DATE_PREFIX}${option.code}`,
    })),
    {
      columns: 2,
    },
  );
}

function buildSlotPrompt(options) {
  return getAdminOptionKeyboard(
    options.map((option) => ({
      text: formatSlotLabelForUser(option.slot.label),
      callbackData: `${SLOT_OPTION_PREFIX}${option.slot.id}`,
    })),
  );
}

export function createAdminSlotScene() {
  return new Scenes.WizardScene(
    ADMIN_SLOT_SCENE_ID,
    async (ctx) => {
      const state = getSceneState(ctx);
      const admin = await ensureAdminSceneAccess(ctx, ADMIN_PERMISSIONS.MANAGE_SLOTS);
      const mode = ctx.scene.state?.mode === 'open' ? 'open' : 'close';
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
        mode === 'open' ? 'Выберите бутик, в котором нужно открыть слот.' : 'Выберите бутик, в котором нужно закрыть слот.',
        buildBoutiquePrompt(boutiques),
      );

      return ctx.wizard.next();
    },
    async (ctx) => {
      const state = getSceneState(ctx);

      if (await maybeLeaveAdminScene(ctx, state.admin)) {
        return undefined;
      }

      const boutiqueId = extractCallbackValue(ctx, SLOT_BOUTIQUE_PREFIX);

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
      state.dateOptions = buildDateOptions(ctx.state.services);

      await answerAdminCallback(ctx);
      await renderAdminPanel(
        ctx,
        `Бутик: ${boutique.name}\n\nВыберите дату.`,
        buildDatePrompt(state.dateOptions),
      );

      return ctx.wizard.next();
    },
    async (ctx) => {
      const state = getSceneState(ctx);

      if (await maybeLeaveAdminScene(ctx, state.admin)) {
        return undefined;
      }

      const dateCode = extractCallbackValue(ctx, SLOT_DATE_PREFIX);

      if (!dateCode) {
        await answerAdminCallback(ctx, 'Выберите дату кнопкой ниже.', true);
        return undefined;
      }

      const selectedDate = state.dateOptions.find((item) => item.code === dateCode);

      if (!selectedDate) {
        await answerAdminCallback(ctx, 'Дата не найдена. Попробуйте еще раз.', true);
        return undefined;
      }

      const allEntries = await ctx.state.services.bookingService.getAvailableSlotsByDate(
        state.boutique.id,
        selectedDate.value,
      );

      const slotEntries =
        state.mode === 'open'
          ? allEntries.filter((entry) => entry.closure)
          : allEntries;

      state.date = selectedDate.value;
      state.slotEntries = slotEntries;

      if (slotEntries.length === 0) {
        await answerAdminCallback(ctx);
        await renderAdminPanel(
          ctx,
          state.mode === 'open'
            ? 'На эту дату нет вручную закрытых слотов. Выберите другую дату.'
            : 'На эту дату нет доступных слотов для управления. Выберите другую дату.',
          buildDatePrompt(state.dateOptions),
        );
        return undefined;
      }

      await answerAdminCallback(ctx);
      await renderAdminPanel(
        ctx,
        formatAdminSlotStateList(slotEntries, selectedDate.value, state.mode),
        buildSlotPrompt(slotEntries),
      );

      return ctx.wizard.next();
    },
    async (ctx) => {
      const state = getSceneState(ctx);

      if (await maybeLeaveAdminScene(ctx, state.admin)) {
        return undefined;
      }

      const slotId = extractCallbackValue(ctx, SLOT_OPTION_PREFIX);

      if (!slotId) {
        await answerAdminCallback(ctx, 'Выберите слот кнопкой ниже.', true);
        return undefined;
      }

      const selectedEntry = state.slotEntries.find((entry) => entry.slot.id === slotId);

      if (!selectedEntry) {
        await answerAdminCallback(ctx, 'Слот не найден. Попробуйте еще раз.', true);
        return undefined;
      }

      state.selectedSlot = selectedEntry.slot;

      if (state.mode === 'open') {
        await answerAdminCallback(ctx);

        const result = await ctx.state.services.bookingService.openSlot(
          state.boutique.id,
          state.date,
          selectedEntry.slot.id,
          ctx.from.id,
        );

        if (!result) {
          await leaveAdminScene(ctx, state.admin, 'Этот слот уже открыт. Выберите другой слот или дату.');
          return undefined;
        }

        await leaveAdminScene(
          ctx,
          state.admin,
          'Слот снова доступен.',
        );
        return undefined;
      }

      await answerAdminCallback(ctx);
      await renderAdminPanel(
        ctx,
        [
          `Бутик: ${state.boutique.name}`,
          `Дата: ${formatDate(state.date, 'DD.MM.YYYY')}`,
          `Слот: ${formatSlotLabelForUser(selectedEntry.slot.label)}`,
          '',
          'Если хотите, отправьте причину закрытия одним сообщением.',
        ].join('\n'),
        getAdminSkipKeyboard('Без причины'),
      );

      return ctx.wizard.next();
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

      await ctx.state.services.bookingService.closeSlot(
        state.boutique.id,
        state.date,
        state.selectedSlot.id,
        ctx.from.id,
        reason,
      );

      await leaveAdminScene(
        ctx,
        state.admin,
        'Слот закрыт.',
      );

      return undefined;
    },
  );
}
