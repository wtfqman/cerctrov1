import { Markup } from 'telegraf';

import { MAIN_MENU_LAYOUT } from '../../utils/constants.js';

export function getMainMenuKeyboard() {
  return Markup.keyboard(MAIN_MENU_LAYOUT).resize();
}
