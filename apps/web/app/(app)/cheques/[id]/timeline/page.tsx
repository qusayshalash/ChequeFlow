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
    <div className="mx-auto flex max-w-[1180px] flex-col gap-5">
      <div className="flex items-center gap-3">
        <PageHeader title={t('cheque.timeline')} />
        <Link href={`/cheques/${id}`} className="ms-auto text-teal-800 hover:underline">
          {t('common.back')}
        </Link>
      </div>
      <ChequeTimeline chequeId={id} />
    </div>
  );
}
