'use client';

/**
 * A bank's mark in a list.
 *
 * The `banks` table carries a `logo_url`, and nothing fills it — there are no
 * licensed logo files in this repository and inventing them would put a wrong
 * bank's brand on a real cheque. So the mark is derived from the name instead:
 * the first letter, on a colour picked from the name itself.
 *
 * That is enough to do the job the mockup's logos do — telling one bank from
 * another at a glance while scrolling — without claiming to be a logo. If real
 * assets are ever licensed, `logoUrl` takes over and this stays as the
 * fallback for banks that have none.
 */

/**
 * Six colours that all clear 4.5:1 against their own background.
 *
 * Deliberately not the status palette: a bank is not a state, and a mark that
 * borrows the red of a bounced cheque would read as an alarm.
 */
const MARKS = [
  'bg-sky-100 text-sky-800',
  'bg-violet-100 text-violet-800',
  'bg-emerald-100 text-emerald-800',
  'bg-amber-100 text-amber-900',
  'bg-rose-100 text-rose-800',
  'bg-slate-200 text-slate-800',
] as const;

/**
 * Picks the same colour for the same name every time.
 *
 * A mark that changed between renders would be worse than no mark: the whole
 * value is that the eye learns "the blue one is Bank of Palestine".
 */
function markFor(name: string): string {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) % 100_000;
  }
  return MARKS[hash % MARKS.length] ?? MARKS[5];
}

export function BankMark({
  name,
  logoUrl,
  size = 'md',
}: {
  name: string | null;
  logoUrl?: string | null;
  size?: 'sm' | 'md';
}) {
  const box = size === 'sm' ? 'size-7 text-xs' : 'size-9 text-sm';

  if (!name) {
    return (
      <span
        aria-hidden
        className={`flex ${box} shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-300`}
      >
        —
      </span>
    );
  }

  if (logoUrl) {
    return (
      // A plain <img>: these are small, remote, already-sized marks, so
      // next/image would add a loader round-trip for no gain. The name is
      // beside it in every use, so the image is decorative.
      <img
        src={logoUrl}
        alt=""
        aria-hidden
        className={`${box} shrink-0 rounded-lg object-contain`}
      />
    );
  }

  return (
    <span
      aria-hidden
      className={`flex ${box} shrink-0 items-center justify-center rounded-lg font-bold ${markFor(name)}`}
    >
      {name.trim().charAt(0)}
    </span>
  );
}
