'use client';

import { useEffect } from 'react';

/**
 * The last boundary: the root layout itself threw.
 *
 * This one replaces the whole document, including `<html>` — which means the
 * stylesheet, the fonts, the providers and the translator are all gone. So
 * every word here is written out in Arabic and every colour is inline, not
 * because literals are acceptable but because at this point there is nothing
 * left to read them from. Anything imported here is another thing that can
 * fail while already handling a failure.
 *
 * It should be unreachable in practice. `(app)/error.tsx` catches what breaks
 * inside a screen; this only fires if the shell around them could not render
 * at all, and a blank page is exactly the situation it exists to prevent.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('The application failed to render:', error);
  }, [error]);

  return (
    <html lang="ar" dir="rtl">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#f4f6f8',
          color: '#15211f',
          fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
          padding: 24,
        }}
      >
        <div style={{ maxWidth: 420, textAlign: 'center' }}>
          <h1 style={{ fontSize: 20, margin: '0 0 12px' }}>تعذّر تشغيل التطبيق</h1>
          <p style={{ fontSize: 14, lineHeight: 1.7, color: '#64716e', margin: '0 0 20px' }}>
            لم يُفقد شيء مما حُفظ. أعد المحاولة، وإن تكرّر أغلق التبويب وافتحه من جديد.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              minHeight: 44,
              padding: '0 20px',
              border: 0,
              borderRadius: 12,
              background: '#087f6d',
              color: '#ffffff',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            إعادة المحاولة
          </button>
          {error.digest ? (
            <p style={{ fontSize: 12, color: '#7c8986', marginTop: 20 }} dir="ltr">
              Reference: {error.digest}
            </p>
          ) : null}
        </div>
      </body>
    </html>
  );
}
