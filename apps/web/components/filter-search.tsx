'use client';

import { useEffect, useRef, useState } from 'react';

import { IconSearch } from '@/components/icons';
import { useTranslator } from '@/components/providers';

/**
 * How long typing must pause before the list is refetched.
 *
 * Long enough that a word typed at speed is one request, short enough that the
 * list still feels like it answers as you type.
 */
const SETTLE_MS = 300;

/**
 * The search that narrows the list in front of you.
 *
 * There are two searches in this application and they do different things:
 *
 *  - The one in the top bar crosses pages. Typing there and pressing Enter
 *    leaves wherever you are and opens the cheques list on the match.
 *  - This one filters the rows already on screen and nothing else.
 *
 * They used to sit one above the other, both bare fields with a magnifier,
 * and nothing distinguished them. This one now lives inside the filter row
 * with the status and bank selects, so its scope is legible from where it is,
 * and it says so in words too — "filter this list", not "search".
 *
 * Typing is debounced. The value goes straight into the list's query key, so
 * every keystroke used to be its own request: typing "صائب" fired five in
 * about a second. At 120 requests a minute that empties the budget quickly,
 * and the next request the page makes — the refetch after a bulk action, say —
 * comes back 429 and the whole list turns into an error. The field itself
 * stays immediate; only the refetch waits.
 */
export function FilterSearch({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  /** What this list is searched by, e.g. cheque number or contact name. */
  placeholder: string;
}) {
  const t = useTranslator();

  const [draft, setDraft] = useState(value);

  // The parent can change the value on its own — clearing the filters, or
  // arriving with one in the URL — and the field has to follow when it does.
  useEffect(() => {
    setDraft(value);
  }, [value]);

  // Held in a ref because every parent passes an inline arrow: as a dependency
  // it would change on each render, restarting the timer forever so the search
  // never actually ran.
  const commit = useRef(onChange);
  commit.current = onChange;

  useEffect(() => {
    if (draft === value) return;
    const timer = setTimeout(() => commit.current(draft), SETTLE_MS);
    return () => clearTimeout(timer);
  }, [draft, value]);

  return (
    <label className="relative flex h-11 min-w-0 flex-1 items-center sm:w-64 sm:flex-none">
      <span className="pointer-events-none absolute start-3 text-slate-400">
        <IconSearch width="18" height="18" />
      </span>
      <input
        type="search"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        // Enter is a deliberate "now": it skips the wait rather than adding a
        // second way to search.
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commit.current(draft);
          }
        }}
        placeholder={placeholder}
        // Named for what it does rather than repeating the placeholder, so a
        // screen reader announces the difference from the global field.
        aria-label={`${t('common.filterThisList')} — ${placeholder}`}
        className="h-11 w-full rounded-xl border border-slate-200 bg-white ps-10 pe-3 text-sm text-slate-800 outline-none placeholder:text-slate-400 hover:border-slate-300 focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10"
      />
    </label>
  );
}
