'use client';

import { useQuery } from '@tanstack/react-query';

import { ChequeStatus } from '@cheque-flow/shared-types';
import { Card, ErrorState, LoadingState } from '@cheque-flow/ui';

import { ChequeTable } from '@/components/cheque-table';
import { useApi, useTranslator } from '@/components/providers';

export default function ReviewQueuePage() {
  const api = useApi();
  const t = useTranslator();

  const query = useQuery({
    queryKey: ['cheques', 'pending-review'],
    queryFn: () =>
      api.listCheques({ status: [ChequeStatus.PENDING_REVIEW, ChequeStatus.DRAFT], pageSize: 100 }),
  });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-slate-900">{t('nav.review')}</h1>
      <Card className="bg-amber-50 text-amber-900">{t('ocr.suggestionNotice')}</Card>
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
