'use client';

import Link from 'next/link';
import { useEffect } from 'react';

import { Button, Card } from '@cheque-flow/ui';

import { useTranslator } from '@/components/providers';

/**
 * What a screen shows when its own code throws.
 *
 * Until now there was nothing here, which in the App Router means the segment
 * unmounts and the person is left looking at a blank page: no message, no way
 * back, and no sign that anything went wrong at all. A blank page is the worst
 * possible answer, because it is indistinguishable from a slow one — people
 * wait, then reload, then assume the product lost their work.
 *
 * Scoped to the authenticated area rather than the root, so the sidebar and
 * the navigation survive: whatever broke, it was one screen, and being able to
 * walk to another one is most of the recovery.
 */
export default function AppSegmentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslator();

  useEffect(() => {
    // The browser console is the only recorder this product has. Without this
    // line the stack is swallowed by the boundary and nobody ever sees it —
    // not the person, and not whoever they send a screenshot to.
    console.error('Screen failed:', error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5 py-10">
      <Card className="flex flex-col gap-4 p-6 text-center">
        <h1 className="text-xl font-bold text-ink">{t('errors.crashTitle')}</h1>
        <p className="text-sm leading-6 text-ink-muted">{t('errors.crashBody')}</p>

        <div className="flex flex-wrap justify-center gap-3">
          {/* `reset` re-renders the segment. A reload would also work and
              would lose anything typed on another screen, so it is offered
              second rather than first. */}
          <Button onClick={reset}>{t('common.retry')}</Button>
          <Link
            href="/dashboard"
            className="inline-flex h-11 items-center rounded-xl border border-line bg-surface px-4 text-sm font-semibold text-ink-soft hover:bg-subtle"
          >
            {t('common.home')}
          </Link>
        </div>

        {/* The digest is the only thread between this screen and the server
            log that recorded the same failure. */}
        {error.digest ? (
          <p className="text-xs text-ink-faint" dir="ltr">
            {t('errors.crashReference')}: {error.digest}
          </p>
        ) : null}
      </Card>
    </div>
  );
}
