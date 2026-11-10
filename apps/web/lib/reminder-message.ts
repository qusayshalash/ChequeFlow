/**
 * The text of a WhatsApp reminder to a contact.
 *
 * One cheque reads as a sentence; several read as a short list, one line per
 * cheque, so a customer with four cheques gets one message rather than four.
 * A cheque that came back is not "due": the message says it was returned and
 * asks for it to be settled, because a reminder that calls a bounced cheque
 * "due on the 3rd" reads as if nobody noticed it bounced.
 */
import type { Locale, Translator } from '@cheque-flow/localization';

import { formatDate, money } from './format';

export interface ReminderCheque {
  chequeNumber: string;
  amount: string;
  currency: string;
  dueDate: string;
  status: string;
}

const CAME_BACK = new Set(['BOUNCED', 'RETURNED']);

export function reminderMessage(
  t: Translator,
  locale: Locale,
  contactName: string | null,
  cheques: ReminderCheque[],
  today: string,
): string {
  const amountOf = (cheque: ReminderCheque) => money(locale, cheque.amount, cheque.currency);
  const lines: string[] = [];
  if (contactName) lines.push(t('reminders.whatsappGreeting', { name: contactName }));

  if (cheques.length === 1) {
    const [cheque] = cheques as [ReminderCheque];
    lines.push(
      CAME_BACK.has(cheque.status)
        ? t('reminders.whatsappBounced', { number: cheque.chequeNumber, amount: amountOf(cheque) })
        : t('reminders.whatsappBody', {
            number: cheque.chequeNumber,
            amount: amountOf(cheque),
            dueDate: formatDate(locale, cheque.dueDate),
          }),
    );
  } else {
    lines.push(t('reminders.whatsappListIntro'));
    for (const cheque of cheques) {
      const state = CAME_BACK.has(cheque.status)
        ? t('reminders.whatsappLineBounced')
        : cheque.dueDate < today
          ? t('reminders.whatsappLineOverdue', { dueDate: formatDate(locale, cheque.dueDate) })
          : t('reminders.whatsappLineDue', { dueDate: formatDate(locale, cheque.dueDate) });
      lines.push(`• ${cheque.chequeNumber} — ${amountOf(cheque)} — ${state}`);
    }
  }

  lines.push(t('reminders.whatsappClosing'));
  return lines.join('\n');
}
