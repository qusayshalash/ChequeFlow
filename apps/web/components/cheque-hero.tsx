'use client';

import type { ChequeDetailView } from '@cheque-flow/shared-types';
import { StatusBadge } from '@cheque-flow/ui';

import { formatDueDistance } from '@cheque-flow/localization';

import { BankMark } from '@/components/bank-mark';
import { useApp, useTranslator } from '@/components/providers';
import { formatDate, money } from '@/lib/format';

/**
 * Where a cheque is in its life, as four steps.
 *
 * Entered, in hand, then at the bank (or handed on to someone, for one we
 * passed along), then the end: collected, or came back. A cancelled or lost
 * cheque stops where it was and says so; the status badge carries the detail.
 */
function lifecycle(status: string): {
  reached: number;
  third: 'bank' | 'handed';
  end: 'ok' | 'back' | 'stopped' | null;
} {
  switch (status) {
    case 'DRAFT':
    case 'PENDING_REVIEW':
      return { reached: 0, third: 'bank', end: null };
    case 'IN_HAND':
    case 'RESERVED':
    case 'POSTPONED':
      return { reached: 1, third: 'bank', end: null };
    case 'DEPOSITED':
      return { reached: 2, third: 'bank', end: null };
    case 'TRANSFERRED':
      return { reached: 2, third: 'handed', end: null };
    case 'CLEARED':
      return { reached: 3, third: 'bank', end: 'ok' };
    case 'BOUNCED':
    case 'RETURNED':
      return { reached: 3, third: 'bank', end: 'back' };
    default:
      return { reached: 1, third: 'bank', end: 'stopped' };
  }
}

function Lifecycle({ status }: { status: string }) {
  const t = useTranslator();
  const { reached, third, end } = lifecycle(status);
  const labels = [
    t('lifecycle.entered'),
    t('lifecycle.inHand'),
    third === 'handed' ? t('lifecycle.handed') : t('lifecycle.atBank'),
    end === 'back' ? t('lifecycle.cameBack') : t('lifecycle.cleared'),
  ];
  return (
    <ol className="mt-5 grid grid-cols-4 gap-2" aria-label={t('lifecycle.title')}>
      {labels.map((label, index) => {
        const done = index <= reached && !(end === 'stopped' && index > reached);
        const last = index === reached;
        const tone =
          last && end === 'back'
            ? 'bg-danger-solid'
            : last && end === 'stopped'
              ? 'bg-ink-faint'
              : done
                ? 'bg-primary'
                : 'bg-line';
        return (
          <li key={label} aria-current={last ? 'step' : undefined} className="min-w-0">
            <span className={`block h-1.5 rounded-full ${tone}`} aria-hidden="true" />
            <span
              className={`mt-1.5 block truncate text-[11px] ${
                last ? 'font-bold text-ink' : done ? 'text-ink-soft' : 'text-ink-faint'
              }`}
            >
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

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
    <section className="relative overflow-hidden rounded-2xl border border-line/90 bg-surface p-6 shadow-[0_1px_2px_rgb(16_24_40/0.035)] sm:p-7">
      <span className="absolute inset-y-0 start-0 w-1 bg-primary" aria-hidden="true" />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-sm text-ink-muted">{t('cheque.number')}</span>
            <span className="font-mono text-lg font-bold tracking-wide text-ink" dir="ltr">
              {cheque.chequeNumber}
            </span>
            <span className="rounded-full border border-line bg-subtle px-2.5 py-1 text-xs font-semibold text-ink-soft">
              {t(`direction.${cheque.direction}`)}
            </span>
          </div>

          <p className="mt-4 text-[clamp(2rem,4vw,3.25rem)] font-bold tracking-[-0.045em] text-ink tabular-nums">
            {money(locale, cheque.amount, cheque.currency)}
          </p>

          {/* The written amount prevails over the digits in a dispute, so it
              sits with the figure rather than in a table further down. */}
          {cheque.amountInWords ? (
            <p className="mt-1 text-sm text-ink-muted">{cheque.amountInWords}</p>
          ) : null}

          {/* Who and which bank, in the band itself: the next two questions
              after "how much", answered without scrolling to the cards. */}
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-ink-soft">
            <span className="inline-flex items-center gap-2">
              <BankMark name={cheque.bankName} size="sm" />
              {cheque.bankName ?? t('common.unknown')}
            </span>
            {cheque.originalSourceName ? (
              <span>
                <span className="text-ink-muted">{t('contact.from')}: </span>
                {cheque.originalSourceName}
              </span>
            ) : null}
            {cheque.currentRecipientName ? (
              <span>
                <span className="text-ink-muted">{t('contact.to')}: </span>
                {cheque.currentRecipientName}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex min-w-48 flex-col items-start gap-3 sm:items-end">
          <StatusBadge status={cheque.status} label={t(`status.${cheque.status}`)} />

          <div className="w-full rounded-xl border border-line-soft bg-subtle px-4 py-3 sm:text-end">
            <p className="text-xs text-ink-muted">{t('cheque.dueDate')}</p>
            <p className="mt-0.5 font-semibold text-ink tabular-nums">
              {formatDate(locale, cheque.dueDate)}
            </p>
            {distance ? (
              <p
                className={`mt-0.5 text-xs font-semibold ${
                  cheque.isOverdue ? 'text-danger' : 'text-ink-muted'
                }`}
              >
                {distance}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <Lifecycle status={cheque.status} />
    </section>
  );
}
