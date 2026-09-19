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

/**
 * Six pairs that clear 4.5:1 between the letter and its own background — in
 * both themes, since each hue is a token with a light and a dark value rather
 * than a fixed colour.
 */
const MARKS = [
  'bg-mark-teal text-mark-teal-ink',
  'bg-mark-indigo text-mark-indigo-ink',
  'bg-mark-orange text-mark-orange-ink',
  'bg-mark-fuchsia text-mark-fuchsia-ink',
  'bg-mark-cyan text-mark-cyan-ink',
  'bg-mark-neutral text-mark-neutral-ink',
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
