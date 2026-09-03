'use client';

import { IconSearch } from '@/components/icons';
import { useTranslator } from '@/components/providers';

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

  return (
    <label className="relative flex h-11 min-w-0 flex-1 items-center sm:w-64 sm:flex-none">
      <span className="pointer-events-none absolute start-3 text-slate-400">
        <IconSearch width="18" height="18" />
      </span>
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        // Named for what it does rather than repeating the placeholder, so a
        // screen reader announces the difference from the global field.
        aria-label={`${t('common.filterThisList')} — ${placeholder}`}
        className="h-11 w-full rounded-xl border border-slate-200 bg-white ps-10 pe-3 text-sm text-slate-800 outline-none placeholder:text-slate-400 hover:border-slate-300 focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10"
      />
    </label>
  );
}
