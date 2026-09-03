'use client';

import { IconCheck } from '@/components/icons';

export interface Step {
  /** Shown inside the circle when the step is not yet done. */
  number: number;
  title: string;
  hint: string;
}

/**
 * Progress through a multi-step form.
 *
 * A long form shown all at once is one people abandon halfway; broken into
 * named steps it becomes three short ones with an end in sight. The stepper is
 * the part that makes that legible — it says how many steps there are, which
 * one this is, and what is still to come.
 *
 * Completed steps are clickable so a correction never means starting again.
 * Steps ahead are not: they would let someone reach the review screen without
 * the fields it is meant to review.
 */
export function Stepper({
  steps,
  current,
  onSelect,
}: {
  steps: readonly Step[];
  current: number;
  onSelect: (step: number) => void;
}) {
  return (
    <ol className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:gap-0">
      {steps.map((step, index) => {
        const done = step.number < current;
        const active = step.number === current;
        const reachable = done;

        return (
          <li key={step.number} className="flex min-w-0 flex-1 items-center gap-3">
            <button
              type="button"
              disabled={!reachable}
              aria-current={active ? 'step' : undefined}
              onClick={() => onSelect(step.number)}
              className={`flex min-w-0 items-center gap-3 rounded-xl p-1.5 text-start ${
                reachable ? 'hover:bg-slate-50' : 'cursor-default'
              }`}
            >
              <span
                className={`flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                  done
                    ? 'bg-teal-800 text-white'
                    : active
                      ? 'bg-teal-800 text-white ring-4 ring-teal-800/15'
                      : 'bg-slate-100 text-slate-400'
                }`}
              >
                {/* A tick, not the number, once a step is behind you — the
                    number answers "which step", the tick answers "am I done". */}
                {done ? <IconCheck width="18" height="18" /> : step.number}
              </span>
              <span className="min-w-0 leading-tight">
                <span
                  className={`block truncate text-sm font-bold ${
                    active || done ? 'text-slate-900' : 'text-slate-400'
                  }`}
                >
                  {step.title}
                </span>
                <span className="block truncate text-xs text-slate-400">{step.hint}</span>
              </span>
            </button>

            {index < steps.length - 1 ? (
              <span
                aria-hidden
                className={`hidden h-0.5 flex-1 rounded-full sm:block ${
                  done ? 'bg-teal-800' : 'bg-slate-200'
                }`}
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
