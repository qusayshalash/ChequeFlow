'use client';

import { useQuery } from '@tanstack/react-query';

import { ChequeStatus } from '@cheque-flow/shared-types';
import { ErrorState, LoadingState } from '@cheque-flow/ui';

import { ChequeTable } from '@/components/cheque-table';
import { useApi, useTranslator } from '@/components/providers';

export default function BouncedChequesPage() {
  const api = useApi();
  const t = useTranslator();

  const query = useQuery({
    queryKey: ['cheques', 'bounced'],
    queryFn: () =>
      api.listCheques({
        status: [ChequeStatus.BOUNCED, ChequeStatus.RETURNED],
        pageSize: 100,
        sortBy: 'dueDate',
        sortOrder: 'desc',
      }),
  });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-slate-900">{t('nav.bounced')}</h1>
      {query.isPending ? <LoadingState label={t('common.loading')} /> : null}
      {query.isError ? (
        <ErrorState
          title={t('errors.INTERNAL_ERROR')}
          onRetry={() => void query.refetch()}
          retryLabel={t('common.retry')}
        />
      ) : null}
      {query.data ? <ChequeTable cheques={query.data.data} /> : null}
    </div>
  );
}
