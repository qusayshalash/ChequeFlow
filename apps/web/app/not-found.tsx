'use client';

import Link from 'next/link';

import { Card } from '@cheque-flow/ui';

import { useTranslator } from '@/components/providers';

/**
 * An address that leads nowhere.
 *
 * Next ships a default for this, in English, in the browser's own font, with
 * no way back — which on an Arabic product reads as somebody else's error page
 * showing through. A mistyped URL or a bookmark to a deleted cheque is an
 * ordinary thing, and it should look like part of the product.
 */
export default function NotFound() {
  const t = useTranslator();

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5 px-4 py-16">
      <Card className="flex flex-col gap-4 p-6 text-center">
        <h1 className="text-xl font-bold text-ink">{t('errors.notFoundTitle')}</h1>
        <p className="text-sm leading-6 text-ink-muted">{t('errors.notFoundBody')}</p>
        <Link
          href="/dashboard"
          className="mx-auto inline-flex h-11 items-center rounded-xl bg-primary px-5 text-sm font-semibold text-on-primary"
        >
          {t('common.home')}
        </Link>
      </Card>
    </div>
  );
}
