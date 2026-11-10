'use client';

import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';

import { whatsAppLink } from '@cheque-flow/shared-types';

import { useApi, useApp, useTranslator } from '@/components/providers';
import { reminderMessage, type ReminderCheque } from '@/lib/reminder-message';
import { useToday } from '@/lib/today';

/**
 * Nudges a contact about one cheque or several, over WhatsApp.
 *
 * There is no WhatsApp business account behind this and no provider bill. The
 * button opens the user's own WhatsApp with the message already typed, and they
 * press send — which is what a small business does anyway, and the only version
 * that works today rather than after an approval process.
 *
 * What the system does own is the record: once the chat is opened, a reminder
 * is written down against every cheque the message named, so the next person
 * to look at one does not chase the same customer an hour later.
 */
export function WhatsAppReminder({
  cheques,
  phone,
  contactName,
  compact = false,
}: {
  cheques: Array<ReminderCheque & { id: string }>;
  phone: string | null;
  contactName: string | null;
  /** A small link for a list row, rather than the full-width button. */
  compact?: boolean;
}) {
  const api = useApi();
  const t = useTranslator();
  const { locale } = useApp();
  const today = useToday();
  const [logged, setLogged] = useState(false);

  const link = whatsAppLink(phone, reminderMessage(t, locale, contactName, cheques, today));

  const record = useMutation({
    mutationFn: () => Promise.all(cheques.map((cheque) => api.recordWhatsAppReminder(cheque.id))),
    onSuccess: () => setLogged(true),
    // A failed log must not stop the reminder being sent — the chat is already
    // open by the time this runs.
    onError: () => setLogged(false),
  });

  if (!link) {
    return compact ? null : (
      <p className="text-sm text-ink-muted">
        {t('reminders.whatsapp')} — {t('reminders.whatsappNoPhone')}
      </p>
    );
  }

  if (compact) {
    return (
      <a
        href={link}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => record.mutate()}
        className="text-xs font-semibold text-primary-ink hover:underline"
      >
        {logged ? t('reminders.whatsappLogged') : t('reminders.whatsapp')}
      </a>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <a
        href={link}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => record.mutate()}
        className="inline-flex h-11 items-center justify-center rounded-xl bg-primary-hover px-4 text-sm font-semibold text-on-primary hover:bg-primary-hover"
      >
        {cheques.length > 1
          ? t('reminders.whatsappMany', { count: cheques.length })
          : t('reminders.whatsapp')}
      </a>
      <p className="text-xs text-ink-muted">{t('reminders.whatsappHint')}</p>
      {logged ? <p className="text-xs text-primary-ink">{t('reminders.whatsappLogged')}</p> : null}
    </div>
  );
}
