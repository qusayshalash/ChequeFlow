'use client';

import type { ChequeDetailView } from '@cheque-flow/shared-types';
import { StatusBadge } from '@cheque-flow/ui';

import { formatDueDistance } from '@cheque-flow/localization';

import { useApp, useTranslator } from '@/components/providers';
import { formatDate, money } from '@/lib/format';

/**
 * The band at the top of a cheque.
 *
 * Three things carry almost all the weight of this page — how much, when, and
 * what state it is in — so they are given the size to match. Everything else
 * on the page is detail you go looking for; these are what you see.
 */
export function ChequeHero({ cheque, today }: { cheque: ChequeDetailView; today: string }) {
  const t = useTranslator();
  const { locale } = useApp();

  // One set of wording rules, shared with the list and the mobile app, so the
  // Arabic dual is handled the same way everywhere.
  const distance = formatDueDistance(locale, cheque.dueDate, today);

  return (
    <section className="relative overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-6 shadow-[0_1px_2px_rgb(16_24_40/0.035)] sm:p-7">
      <span className="absolute inset-y-0 start-0 w-1 bg-teal-600" aria-hidden="true" />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-sm text-slate-500">{t('cheque.number')}</span>
            <span className="font-mono text-lg font-bold tracking-wide text-slate-950" dir="ltr">
              {cheque.chequeNumber}
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
              {t(`direction.${cheque.direction}`)}
            </span>
          </div>

          <p className="mt-4 text-[clamp(2rem,4vw,3.25rem)] font-bold tracking-[-0.045em] text-slate-950 tabular-nums">
            {money(locale, cheque.amount, cheque.currency)}
          </p>

          {/* The written amount prevails over the digits in a dispute, so it
              sits with the figure rather than in a table further down. */}
          {cheque.amountInWords ? (
            <p className="mt-1 text-sm text-slate-500">{cheque.amountInWords}</p>
          ) : null}
        </div>

        <div className="flex min-w-48 flex-col items-start gap-3 sm:items-end">
          <StatusBadge status={cheque.status} label={t(`status.${cheque.status}`)} />

          <div className="w-full rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 sm:text-end">
            <p className="text-xs text-slate-500">{t('cheque.dueDate')}</p>
            <p className="mt-0.5 font-semibold text-slate-900 tabular-nums">
              {formatDate(locale, cheque.dueDate)}
            </p>
            {distance ? (
              <p
                className={`mt-0.5 text-xs font-semibold ${
                  cheque.isOverdue ? 'text-red-600' : 'text-slate-500'
                }`}
              >
                {distance}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
