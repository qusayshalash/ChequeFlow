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
    <section className="rounded-2xl border border-slate-200 bg-white p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-sm text-slate-500">{t('cheque.number')}</span>
            <span className="font-mono text-lg font-bold text-slate-900" dir="ltr">
              {cheque.chequeNumber}
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
              {t(`direction.${cheque.direction}`)}
            </span>
          </div>

          <p className="mt-3 text-4xl font-bold text-slate-900 tabular-nums">
            {money(locale, cheque.amount, cheque.currency)}
          </p>

          {/* The written amount prevails over the digits in a dispute, so it
              sits with the figure rather than in a table further down. */}
          {cheque.amountInWords ? (
            <p className="mt-1 text-sm text-slate-500">{cheque.amountInWords}</p>
          ) : null}
        </div>

        <div className="flex flex-col items-start gap-3">
          <StatusBadge status={cheque.status} label={t(`status.${cheque.status}`)} />

          <div className="rounded-xl bg-slate-50 px-4 py-3">
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
