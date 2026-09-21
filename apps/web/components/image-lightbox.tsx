'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { useTranslator } from '@/components/providers';

/**
 * Looking at a cheque properly.
 *
 * The photographs are around six megapixels and the record showed them inside
 * a side panel, scaled to whatever was left of the column. At that size a
 * handwritten amount is a smudge, which leaves the product storing the one
 * thing it was built to store and declining to show it.
 *
 * So: the whole window, on black, with the image magnified by clicking it and
 * pushed around by dragging. No library — a transform and two event handlers
 * are the entire mechanism, and a dependency here would be larger than the
 * feature.
 */
const STEPS = [1, 2, 3.5] as const;

export function ImageLightbox({
  url,
  label,
  onClose,
}: {
  url: string | null;
  label: string;
  onClose: () => void;
}) {
  const t = useTranslator();
  const [step, setStep] = useState(0);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragging = useRef<{ x: number; y: number } | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  const scale = STEPS[step] ?? 1;

  const reset = useCallback(() => {
    setStep(0);
    setOffset({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    if (!url) return;
    reset();
    // The keyboard has to be able to leave: a full-window overlay with no
    // Escape is a trap for anyone not using a mouse.
    closeRef.current?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);

    // Nothing behind the overlay should scroll while it is open.
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [url, onClose, reset]);

  if (!url) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      className="fixed inset-0 z-[100] flex flex-col bg-scrim/95"
    >
      <div className="flex items-center gap-3 p-3">
        <span className="flex-1 truncate text-sm font-semibold text-on-primary">{label}</span>

        <button
          type="button"
          onClick={() => setStep((current) => (current + 1) % STEPS.length)}
          className="min-h-11 rounded-xl px-4 text-sm font-semibold text-on-primary hover:bg-surface/10"
        >
          {/* The current magnification, so the control says what it will do
              rather than only that it does something. */}
          {scale}×
        </button>

        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          className="min-h-11 rounded-xl px-4 text-sm font-semibold text-on-primary hover:bg-surface/10"
        >
          {t('common.close')}
        </button>
      </div>

      <div
        className="flex flex-1 items-center justify-center overflow-hidden"
        onPointerDown={(event) => {
          if (scale === 1) return;
          dragging.current = { x: event.clientX - offset.x, y: event.clientY - offset.y };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const from = dragging.current;
          if (!from) return;
          setOffset({ x: event.clientX - from.x, y: event.clientY - from.y });
        }}
        onPointerUp={() => {
          dragging.current = null;
        }}
      >
        {/* A plain <img>: the source is a short-lived signed storage URL,
            which Next's image optimiser can neither cache nor re-sign. */}
        <img
          src={url}
          alt={label}
          draggable={false}
          onClick={() => setStep((current) => (current + 1) % STEPS.length)}
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            cursor: scale === 1 ? 'zoom-in' : 'grab',
          }}
          className="max-h-full max-w-full select-none object-contain transition-transform duration-200"
        />
      </div>

      <p className="p-3 text-center text-xs text-ink-faint">{t('cheque.imageZoomHintWeb')}</p>
    </div>
  );
}
