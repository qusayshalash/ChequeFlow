'use client';

/**
 * A contact's initial in a list.
 *
 * There are no photographs in this system and there is no plausible way to get
 * one for a contact typed in from a cheque face, so the mark is derived from
 * the name — the same approach `BankMark` takes, for the same reason: it gives
 * the eye something to lock onto while scrolling without pretending to be a
 * photograph of anybody.
 *
 * Circular rather than square, which is the one thing that keeps a person
 * apart from a bank at a glance.
 */

/** Six pairs that all clear 4.5:1 between the letter and its own background. */
const MARKS = [
  'bg-teal-100 text-teal-800',
  'bg-indigo-100 text-indigo-800',
  'bg-orange-100 text-orange-900',
  'bg-fuchsia-100 text-fuchsia-800',
  'bg-cyan-100 text-cyan-900',
  'bg-slate-200 text-slate-800',
] as const;

function markFor(name: string): string {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) % 100_000;
  }
  return MARKS[hash % MARKS.length] ?? MARKS[5];
}

export function ContactAvatar({ name }: { name: string }) {
  const trimmed = name.trim();

  return (
    <span
      aria-hidden
      className={`flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${markFor(trimmed)}`}
    >
      {trimmed.charAt(0) || '—'}
    </span>
  );
}
