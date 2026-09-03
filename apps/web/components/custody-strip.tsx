'use client';

import type { ChequeDetailView } from '@cheque-flow/shared-types';

import { IconCheck } from '@/components/icons';
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
    <section className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-[0_1px_2px_rgb(16_24_40/0.035)]">
      <h2 className="mb-4 text-base font-bold text-slate-900">{t('cheque.journey')}</h2>

      {/* Vertical, so the card sits in a column beside the fact groups and the
          three stages read top to bottom in the order they happen. The rule
          between the markers is what makes them one path rather than three
          unrelated rows. */}
      <ol className="flex flex-col">
        {steps.map((step, index) => (
          <li key={step.key} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  step.current
                    ? 'bg-teal-700 text-white ring-4 ring-teal-700/15'
                    : step.done
                      ? 'bg-teal-700 text-white'
                      : 'border border-dashed border-slate-300 bg-white text-slate-300'
                }`}
              >
                {/* A tick only where the stage actually happened; an empty
                    circle is the honest mark for one that has not. */}
                {step.done ? <IconCheck width="15" height="15" /> : index + 1}
              </span>
              {index < steps.length - 1 ? (
                <span
                  aria-hidden="true"
                  className={`my-1 w-0.5 flex-1 rounded-full ${
                    step.done ? 'bg-teal-700/30' : 'bg-slate-200'
                  }`}
                />
              ) : null}
            </div>

            <div className={`min-w-0 flex-1 ${index < steps.length - 1 ? 'pb-5' : ''}`}>
              <p
                className={`text-xs font-semibold ${
                  step.current ? 'text-teal-700' : 'text-slate-500'
                }`}
              >
                {step.label}
              </p>
              <p
                className={`mt-0.5 truncate text-sm ${
                  step.done ? 'font-semibold text-slate-900' : 'text-slate-400'
                }`}
                title={step.value ?? undefined}
              >
                {step.value ?? t('cheque.notYet')}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
