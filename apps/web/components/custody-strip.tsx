'use client';

import type { ChequeDetailView } from '@cheque-flow/shared-types';

import { IconChevronEnd } from '@/components/icons';
import { useTranslator } from '@/components/providers';

/**
 * Where the cheque came from, where it is, and where it went.
 *
 * This is the question the whole system exists to answer, and in a flat table
 * of fifteen rows it was three entries indistinguishable from the reference
 * number. Here it reads as one sentence, left to right in the order the cheque
 * actually moved.
 */
export function CustodyStrip({ cheque }: { cheque: ChequeDetailView }) {
  const t = useTranslator();

  const steps = [
    {
      key: 'from',
      label: t('cheque.receivedFrom'),
      value: cheque.originalSourceName ?? cheque.drawerName,
      done: Boolean(cheque.originalSourceName ?? cheque.drawerName),
    },
    {
      key: 'now',
      label: t('cheque.nowAt'),
      // A cheque still with the company sits in a place; one that has left is
      // with a party. Whichever applies is the honest answer to "where is it".
      value: cheque.currentLocationName ?? (cheque.currentRecipientName ? null : null),
      done: Boolean(cheque.currentLocationName),
      current: true,
    },
    {
      key: 'to',
      label: t('cheque.handedTo'),
      value: cheque.currentRecipientName,
      done: Boolean(cheque.currentRecipientName),
    },
  ];

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="mb-4 text-base font-bold text-slate-900">{t('cheque.journey')}</h2>

      <ol className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
        {steps.map((step, index) => (
          <li key={step.key} className="flex flex-1 items-stretch gap-3">
            <div
              className={`flex-1 rounded-xl border p-4 ${
                step.current
                  ? 'border-teal-200 bg-teal-50'
                  : step.done
                    ? 'border-slate-200 bg-white'
                    : 'border-dashed border-slate-200 bg-slate-50'
              }`}
            >
              <p
                className={`text-xs font-semibold ${step.current ? 'text-teal-700' : 'text-slate-500'}`}
              >
                {step.label}
              </p>
              <p
                className={`mt-1 truncate text-sm ${
                  step.done ? 'font-semibold text-slate-900' : 'text-slate-400'
                }`}
                title={step.value ?? undefined}
              >
                {step.value ?? t('cheque.notYet')}
              </p>
            </div>

            {index < steps.length - 1 ? (
              <span
                className="hidden shrink-0 items-center self-center text-slate-300 sm:flex"
                aria-hidden="true"
              >
                <IconChevronEnd />
              </span>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
