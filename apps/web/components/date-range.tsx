'use client';

import { useEffect, useRef, useState } from 'react';

import { IconCalendar, IconChevronDown } from '@/components/icons';
import { useTranslator } from '@/components/providers';

export interface DateRange {
  /** `YYYY-MM-DD`, or empty for open-ended. */
  from: string;
  to: string;
}

export const EMPTY_RANGE: DateRange = { from: '', to: '' };

/** `YYYY-MM-DD` for today, in the viewer's own calendar day. */
function today(): string {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
}

function addDays(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/** Last day of the month containing `iso`. */
function endOfMonth(iso: string): string {
  const [year, month] = iso.split('-').map(Number);
  if (!year || !month) return iso;
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

/** Whether the range is the wrong way round; the caller must not query on it. */
export function isRangeInvalid(range: DateRange): boolean {
  return Boolean(range.from && range.to && range.from > range.to);
}

/** `2026-08-31` -> `31/08`, short enough to sit inside a button. */
function short(iso: string): string {
  const [, month, day] = iso.split('-');
  return month && day ? `${day}/${month}` : iso;
}

/**
 * A from/to window, collapsed into one button.
 *
 * The first version laid the shortcuts and both date inputs out in a row, which
 * took more space than the figures it was filtering. A filter should be a
 * quiet control that says what it is doing and gets out of the way, so the
 * whole thing now folds into a button carrying the current window, and opens
 * only when someone actually wants to change it.
 */
export function DateRangePicker({
  value,
  onChange,
}: {
  value: DateRange;
  onChange: (range: DateRange) => void;
}) {
  const t = useTranslator();
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);

  const start = today();
  const presets = [
    { key: 'all', label: t('range.all'), range: EMPTY_RANGE },
    { key: 'month', label: t('range.thisMonth'), range: { from: start, to: endOfMonth(start) } },
    { key: 'd30', label: t('range.next30'), range: { from: start, to: addDays(start, 30) } },
    { key: 'd90', label: t('range.next90'), range: { from: start, to: addDays(start, 90) } },
  ];

  const activePreset = presets.find(
    (preset) => preset.range.from === value.from && preset.range.to === value.to,
  );
  const invalid = isRangeInvalid(value);

  /** What the closed button says: a name when there is one, dates otherwise. */
  const label = activePreset
    ? activePreset.label
    : `${value.from ? short(value.from) : '…'} — ${value.to ? short(value.to) : '…'}`;

  // Close on an outside click or Escape, the two things people try.
  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent): void {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={container} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`inline-flex h-11 items-center gap-2 rounded-xl border bg-white px-3 text-sm font-semibold shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 ${
          invalid ? 'border-red-300 text-red-600' : 'border-slate-200 text-slate-700'
        }`}
      >
        <IconCalendar className="shrink-0 text-slate-400" />
        <span className="tabular-nums">{label}</span>
        <IconChevronDown
          width="16"
          height="16"
          className={`shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label={t('common.period')}
          className="absolute end-0 z-20 mt-2 w-72 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl"
        >
          <div className="grid grid-cols-2 gap-1.5">
            {presets.map((preset) => (
              <button
                key={preset.key}
                type="button"
                onClick={() => {
                  onChange(preset.range);
                  setOpen(false);
                }}
                aria-pressed={activePreset?.key === preset.key}
                className={`h-9 rounded-lg px-2 text-sm font-semibold transition-colors ${
                  activePreset?.key === preset.key
                    ? 'bg-teal-700 text-white'
                    : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="mt-3 flex flex-col gap-2 border-t border-slate-100 pt-3">
            <label className="flex items-center justify-between gap-2 text-sm text-slate-500">
              <span>{t('range.from')}</span>
              <input
                type="date"
                value={value.from}
                max={value.to || undefined}
                onChange={(event) => onChange({ ...value, from: event.target.value })}
                aria-invalid={invalid}
                className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-slate-700 outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10"
              />
            </label>
            <label className="flex items-center justify-between gap-2 text-sm text-slate-500">
              <span>{t('range.to')}</span>
              <input
                type="date"
                value={value.to}
                min={value.from || undefined}
                onChange={(event) => onChange({ ...value, to: event.target.value })}
                aria-invalid={invalid}
                className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-slate-700 outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10"
              />
            </label>
          </div>

          {invalid ? (
            <p role="alert" className="mt-2 text-xs text-red-600">
              {t('range.invalid')}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
