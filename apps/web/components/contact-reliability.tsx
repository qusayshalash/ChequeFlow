'use client';

import { useQuery } from '@tanstack/react-query';

import type { ContactReliabilityView } from '@cheque-flow/shared-types';

import { useApi, useTranslator } from '@/components/providers';

/** The share of a contact's decided cheques that came back, as a whole percent. */
export function bounceRate(reliability: ContactReliabilityView): number | null {
  return reliability.decided === 0
    ? null
    : Math.round((reliability.bounced / reliability.decided) * 100);
}

/** The track record on the contact's own page. */
export function ReliabilitySummary({ reliability }: { reliability: ContactReliabilityView }) {
  const t = useTranslator();
  const rate = bounceRate(reliability);
  if (reliability.decided === 0 && reliability.openBounced === 0) {
    return <p className="text-sm text-ink-muted">{t('reliability.noHistory')}</p>;
  }
  const tone =
    reliability.openBounced > 0 || (rate ?? 0) >= 20
      ? 'text-danger'
      : (rate ?? 0) > 0
        ? 'text-warning'
        : 'text-success';
  return (
    <div className="grid gap-3 sm:grid-cols-4">
      {(
        [
          ['reliability.rate', rate === null ? '—' : `${rate}%`, tone],
          ['reliability.cleared', String(reliability.cleared), 'text-ink'],
          ['reliability.bounced', String(reliability.bounced), 'text-ink'],
          [
            'reliability.openBounced',
            String(reliability.openBounced),
            reliability.openBounced > 0 ? 'text-danger' : 'text-ink',
          ],
        ] as const
      ).map(([labelKey, value, valueTone]) => (
        <div key={labelKey} className="rounded-xl border border-line p-3">
          <p className="text-xs text-ink-muted">{t(labelKey)}</p>
          <p className={`mt-1 text-lg font-bold tabular-nums ${valueTone}`}>{value}</p>
        </div>
      ))}
    </div>
  );
}

/**
 * A warning in the cheque forms, the moment a contact is chosen.
 *
 * Shown only when there is something to say: a contact whose cheques have all
 * cleared gets no banner, because a banner on every cheque is one nobody
 * reads by the third. Credit limits already guard how much; this is about
 * how a contact has paid.
 */
export function ReliabilityNotice({ contactId }: { contactId: string }) {
  const api = useApi();
  const t = useTranslator();
  const query = useQuery({
    queryKey: ['contact-reliability', contactId],
    queryFn: () => api.getContactReliability(contactId),
    enabled: contactId !== '',
  });
  const reliability = query.data;
  if (!reliability || (reliability.bounced === 0 && reliability.openBounced === 0)) return null;

  return (
    <p
      role="status"
      className="rounded-xl border border-warning-line bg-warning-soft p-3 text-sm text-warning"
    >
      {t('reliability.warning', { bounced: reliability.bounced, decided: reliability.decided })}
      {reliability.openBounced > 0
        ? ` ${t('reliability.warningOpen', { count: reliability.openBounced })}`
        : ''}
    </p>
  );
}
