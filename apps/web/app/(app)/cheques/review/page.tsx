'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { ChequeStatus } from '@cheque-flow/shared-types';
import { Card, ErrorState, LoadingState } from '@cheque-flow/ui';

import { ChequeTable } from '@/components/cheque-table';
import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { Panel } from '@/components/panel';
import { useApi, useTranslator } from '@/components/providers';

export default function ReviewQueuePage() {
  const api = useApi();
  const t = useTranslator();

  const [page, setPage] = useState(1);

  const query = useQuery({
    queryKey: ['cheques', 'pending-review', page],
    queryFn: () =>
      api.listCheques({
        status: [ChequeStatus.PENDING_REVIEW, ChequeStatus.DRAFT],
        page,
        pageSize: 25,
      }),
  });

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-5">
      <PageHeader title={t('nav.review')} subtitle={t('pageDescription.review')} />
      <Card className="flex items-start gap-3 border-amber-200 bg-amber-50/70 text-sm leading-6 text-amber-900">
        <span className="mt-1 size-2 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
        {t('ocr.suggestionNotice')}
      </Card>
      {query.isPending ? <LoadingState label={t('common.loading')} /> : null}
      {query.isError ? (
        <ErrorState
          title={t('errors.INTERNAL_ERROR')}
          onRetry={() => void query.refetch()}
          retryLabel={t('common.retry')}
        />
      ) : null}
      {query.data ? (
        <>
          <Panel bodyClassName="">
            <ChequeTable cheques={query.data.data} />
          </Panel>
          <Pagination meta={query.data.meta} onPageChange={setPage} />
        </>
      ) : null}
    </div>
  );
}
