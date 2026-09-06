'use client';

import { useEffect, useRef, type ReactNode } from 'react';

import { IconClose } from '@/components/icons';
import { useTranslator } from '@/components/providers';

/** Focusable descendants, in document order, skipping anything disabled or hidden. */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * The side panel the application opens over a page.
 *
 * There were three of these — editing a contact, adding a user, acting on a
 * cheque — written out separately and identical to the character apart from a
 * width and a title. All three said `aria-modal="true"` and none of them
 * behaved like a modal: `Escape` did nothing, Tab walked out of the panel and
 * into the page behind it, and closing left focus wherever it had drifted.
 * Elsewhere in the app the row menu, the date picker and the top bar all close
 * on `Escape`, so this was a gap rather than a decision.
 *
 * Everything a dialog owes the keyboard is here, once:
 *
 *  - `Escape` closes it, and so does a click on the backdrop.
 *  - Tab and Shift+Tab cycle inside the panel instead of escaping behind it.
 *  - Focus moves in on open and returns to whatever opened it on close, so the
 *    reader is put back where they were rather than at the top of the document.
 *  - The page behind cannot scroll while it is open.
 *
 * The content behind is still reachable by a screen reader's virtual cursor;
 * sealing that needs `inert` on the rest of the page, which is a larger change
 * than this one and is not pretended at here.
 */
export function Drawer({
  open,
  onClose,
  eyebrow,
  title,
  width = 'lg',
  children,
}: {
  open: boolean;
  onClose: () => void;
  /** The small line above the title — whose contact, which cheque. */
  eyebrow: ReactNode;
  title: string;
  /** `2xl` for panels holding a full form, `lg` for the rest. */
  width?: 'lg' | '2xl';
  children: ReactNode;
}) {
  const t = useTranslator();
  const panel = useRef<HTMLElement | null>(null);
  const titleId = useRef(`drawer-title-${Math.random().toString(36).slice(2, 9)}`).current;

  useEffect(() => {
    if (!open) return;

    // Where to put focus back. Read before anything else moves it.
    const opener = document.activeElement as HTMLElement | null;

    const node = panel.current;
    const first = node?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? node)?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !node) return;

      const stops = [...node.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (element) => element.offsetParent !== null,
      );
      if (stops.length === 0) return;

      const edge = event.shiftKey ? stops[0] : stops[stops.length - 1];
      // Only the two ends need handling; in between, the browser is right.
      if (document.activeElement === edge) {
        event.preventDefault();
        (event.shiftKey ? stops[stops.length - 1] : stops[0])?.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    const scroll = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = scroll;
      // By the time this runs the panel is usually already detached, which
      // leaves focus on `body` rather than inside `node` — so both count as
      // "focus came from here". Anything else means the close moved focus
      // somewhere deliberate, and pulling it back would fight the app.
      const active = document.activeElement;
      const cameFromPanel = !active || active === document.body || node?.contains(active);
      if (opener?.isConnected && cameFromPanel) opener.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <button
        type="button"
        aria-label={t('common.close')}
        className="fixed inset-0 z-40 bg-slate-950/35 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <aside
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`fixed inset-y-0 end-0 z-50 flex w-full flex-col bg-white shadow-2xl outline-none ${
          width === '2xl' ? 'max-w-2xl' : 'max-w-lg'
        }`}
      >
        <div className="flex h-20 shrink-0 items-center justify-between border-b border-slate-200 px-6">
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-teal-700">{eyebrow}</p>
            <h2 id={titleId} className="mt-1 truncate text-xl font-bold text-slate-950">
              {title}
            </h2>
          </div>
          <button
            type="button"
            aria-label={t('common.close')}
            className="flex size-10 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            onClick={onClose}
          >
            <IconClose />
          </button>
        </div>

        {children}
      </aside>
    </>
  );
}
