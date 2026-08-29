'use client';

import Link from 'next/link';
import { use } from 'react';

import { ChequeTimeline } from '@/components/cheque-timeline';
import { useTranslator } from '@/components/providers';

export default function ChequeTimelinePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslator();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold text-slate-900">{t('cheque.timeline')}</h1>
        <Link href={`/cheques/${id}`} className="ms-auto text-teal-800 hover:underline">
          {t('common.back')}
        </Link>
      </div>
      <ChequeTimeline chequeId={id} />
    </div>
  );
}
