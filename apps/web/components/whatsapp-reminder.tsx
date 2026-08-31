'use client';

import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';

import { whatsAppLink, type ChequeDetailView } from '@cheque-flow/shared-types';

import { useApi, useApp, useTranslator } from '@/components/providers';
import { formatDate, money } from '@/lib/format';

/**
 * Nudges a customer about a cheque, over WhatsApp.
 *
 * There is no WhatsApp business account behind this and no provider bill. The
 * button opens the user's own WhatsApp with the message already typed, and they
 * press send — which is what a small business does anyway, and the only version
 * that works today rather than after an approval process.
 *
 * What the system does own is the record: once the chat is opened, the reminder
 * is written down as sent, so the next person to look at the cheque does not
 * chase the same customer an hour later.
 */
export function WhatsAppReminder({
  cheque,
  phone,
  contactName,
}: {
  cheque: ChequeDetailView;
  phone: string | null;
  contactName: string | null;
}) {
  const api = useApi();
  const t = useTranslator();
  const { locale } = useApp();
  const [logged, setLogged] = useState(false);

  const message = [
    contactName ? t('reminders.whatsappGreeting', { name: contactName }) : null,
    t('reminders.whatsappBody', {
      number: cheque.chequeNumber,
      amount: money(locale, cheque.amount, cheque.currency),
      dueDate: formatDate(locale, cheque.dueDate),
    }),
    t('reminders.whatsappClosing'),
  ]
    .filter(Boolean)
    .join('\n');

  const link = whatsAppLink(phone, message);

  const record = useMutation({
    mutationFn: () => api.recordWhatsAppReminder(cheque.id),
    onSuccess: () => setLogged(true),
    // A failed log must not stop the reminder being sent — the chat is already
    // open by the time this runs.
    onError: () => setLogged(false),
  });

  if (!link) {
    return (
      <p className="text-sm text-slate-500">
        {t('reminders.whatsapp')} — {t('reminders.whatsappNoPhone')}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <a
        href={link}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => record.mutate()}
        className="inline-flex h-11 items-center justify-center rounded-xl bg-teal-800 px-4 text-sm font-semibold text-white hover:bg-teal-900"
      >
        {t('reminders.whatsapp')}
      </a>
      <p className="text-xs text-slate-500">{t('reminders.whatsappHint')}</p>
      {logged ? <p className="text-xs text-teal-700">{t('reminders.whatsappLogged')}</p> : null}
    </div>
  );
}
