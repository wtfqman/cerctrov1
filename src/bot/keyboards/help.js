import { Markup } from 'telegraf';

import { HELP_CONTACTS } from '../../utils/constants.js';

export function getHelpKeyboard() {
  return Markup.inlineKeyboard(
    HELP_CONTACTS.map((contact) => [Markup.button.url(contact.label, contact.url)]),
  );
}
