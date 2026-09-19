'use client';

import Link from 'next/link';
import { use } from 'react';

import { ChequeTimeline } from '@/components/cheque-timeline';
import { PageHeader } from '@/components/page-header';
import { useTranslator } from '@/components/providers';

export default function ChequeTimelinePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslator();

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-5">
      <PageHeader
        title={t('cheque.timeline')}
        actions={
          <Link
            href={`/cheques/${id}`}
            className="inline-flex min-h-11 items-center rounded-xl border border-line bg-surface px-4 text-sm font-semibold text-ink-soft shadow-sm hover:bg-subtle"
          >
            {t('common.back')}
          </Link>
        }
      />
      <ChequeTimeline chequeId={id} />
    </div>
  );
}
