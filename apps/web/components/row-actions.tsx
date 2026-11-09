'use client';

import Link from 'next/link';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

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
  const button = useRef<HTMLButtonElement | null>(null);
  const menu = useRef<HTMLDivElement | null>(null);
  const [place, setPlace] = useState<{ top: number; left: number } | null>(null);

  // Fixed to the window, not absolute inside the row.
  //
  // Tables scroll inside their own container, and that container clips what
  // leaves it: with one or two rows the menu opened below the last row and
  // was cut off, reachable only by scrolling the table. Placed against the
  // window, it opens below the button, or above when there is no room, and
  // stays inside the screen sideways.
  useLayoutEffect(() => {
    if (!open || !button.current || !menu.current) return;
    const anchor = button.current.getBoundingClientRect();
    const { offsetWidth: width, offsetHeight: height } = menu.current;
    const gap = 6;
    const below = anchor.bottom + gap;
    const top =
      below + height <= window.innerHeight - gap ? below : Math.max(gap, anchor.top - gap - height);
    // Growing from the button towards the middle of the row, as before: the
    // button sits at the row's left end in this RTL layout. Kept on screen.
    const left = Math.min(Math.max(gap, anchor.left), window.innerWidth - width - gap);
    setPlace({ top, left });
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (holder.current && !holder.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    // A fixed menu would float away from its row on scroll, so it closes.
    const onScroll = () => setOpen(false);

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
      setPlace(null);
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
        ref={button}
        onClick={() => setOpen((value) => !value)}
        className="flex size-9 items-center justify-center rounded-lg border border-line text-ink-muted hover:bg-subtle hover:text-ink"
      >
        <IconDots width="18" height="18" />
      </button>

      {open ? (
        <div
          ref={menu}
          role="menu"
          className="fixed z-50 w-48 overflow-hidden rounded-xl border border-line bg-surface p-1 shadow-lg"
          // Hidden for the one layout pass before it is measured and placed.
          style={
            place ? { top: place.top, left: place.left } : { top: 0, left: 0, visibility: 'hidden' }
          }
        >
          {plain.map((action) =>
            action.href ? (
              <Link
                key={action.key}
                role="menuitem"
                href={action.href}
                onClick={() => setOpen(false)}
                className="block rounded-lg px-3 py-2.5 text-sm text-ink-soft hover:bg-subtle"
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
                className="block w-full rounded-lg px-3 py-2.5 text-start text-sm text-ink-soft hover:bg-subtle"
              >
                {action.label}
              </button>
            ),
          )}

          {destructive.length > 0 ? <div className="my-1 border-t border-line-soft" /> : null}

          {destructive.map((action) => (
            <button
              key={action.key}
              type="button"
              role="menuitem"
              onClick={() => {
                action.onSelect?.();
                setOpen(false);
              }}
              className="block w-full rounded-lg px-3 py-2.5 text-start text-sm text-danger hover:bg-danger-soft"
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
