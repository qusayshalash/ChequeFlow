'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { ChequeStatus } from '@cheque-flow/shared-types';
import { ErrorState, LoadingState } from '@cheque-flow/ui';

import { ChequeTable } from '@/components/cheque-table';
import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { Panel } from '@/components/panel';
import { useApi, useTranslator } from '@/components/providers';

export default function BouncedChequesPage() {
  const api = useApi();
  const t = useTranslator();

  const [page, setPage] = useState(1);

  const query = useQuery({
    queryKey: ['cheques', 'bounced', page],
    queryFn: () =>
      api.listCheques({
        status: [ChequeStatus.BOUNCED, ChequeStatus.RETURNED],
        page,
        pageSize: 25,
        sortBy: 'dueDate',
        sortOrder: 'desc',
      }),
  });

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-5">
      <PageHeader title={t('nav.bounced')} subtitle={t('pageDescription.bounced')} />
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
