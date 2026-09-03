'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { IconDots } from '@/components/icons';
import { useTranslator } from '@/components/providers';

export interface RowAction {
  key: string;
  label: string;
  href?: string;
  onSelect?: () => void;
  /** Rendered apart, below a rule. */
  destructive?: boolean;
}

/**
 * The "…" menu at the end of a table row.
 *
 * A row used to be a link and nothing else, so anything beyond opening the
 * cheque meant opening it first and coming back. This puts the two or three
 * things people actually do from a list within one click of the row.
 *
 * What it deliberately does not carry is the state machine: a list row knows
 * a cheque's status but not which transitions the *caller* may perform, and
 * offering a deposit that the server will refuse is worse than not offering
 * it. Those stay on the cheque's own page, where the allowed set is known.
 */
export function RowActions({ label, actions }: { label: string; actions: RowAction[] }) {
  const t = useTranslator();
  const [open, setOpen] = useState(false);
  const holder = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (holder.current && !holder.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const plain = actions.filter((action) => !action.destructive);
  const destructive = actions.filter((action) => action.destructive);

  return (
    <div ref={holder} className="relative flex justify-center">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        // Icon-only, so it has to say what it acts on: "actions for cheque
        // 3000001", not just "actions".
        aria-label={`${t('common.actions')} — ${label}`}
        onClick={() => setOpen((value) => !value)}
        className="flex size-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900"
      >
        <IconDots width="18" height="18" />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute end-0 top-11 z-30 w-48 overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-lg"
        >
          {plain.map((action) =>
            action.href ? (
              <Link
                key={action.key}
                role="menuitem"
                href={action.href}
                onClick={() => setOpen(false)}
                className="block rounded-lg px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
              >
                {action.label}
              </Link>
            ) : (
              <button
                key={action.key}
                type="button"
                role="menuitem"
                onClick={() => {
                  action.onSelect?.();
                  setOpen(false);
                }}
                className="block w-full rounded-lg px-3 py-2.5 text-start text-sm text-slate-700 hover:bg-slate-50"
              >
                {action.label}
              </button>
            ),
          )}

          {destructive.length > 0 ? <div className="my-1 border-t border-slate-100" /> : null}

          {destructive.map((action) => (
            <button
              key={action.key}
              type="button"
              role="menuitem"
              onClick={() => {
                action.onSelect?.();
                setOpen(false);
              }}
              className="block w-full rounded-lg px-3 py-2.5 text-start text-sm text-red-600 hover:bg-red-50"
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
