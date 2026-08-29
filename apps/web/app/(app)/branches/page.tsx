'use client';

import { useQuery } from '@tanstack/react-query';

import { Card, EmptyState, ErrorState, LoadingState } from '@cheque-flow/ui';

import { useApi, useTranslator } from '@/components/providers';

export default function BranchesPage() {
  const api = useApi();
  const t = useTranslator();
  const query = useQuery({ queryKey: ['branches'], queryFn: () => api.listBranches() });

  if (query.isPending) return <LoadingState label={t('common.loading')} />;
  if (query.isError) {
    return (
      <ErrorState
        title={t('errors.INTERNAL_ERROR')}
        onRetry={() => void query.refetch()}
        retryLabel={t('common.retry')}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-slate-900">{t('nav.branches')}</h1>
      {query.data && query.data.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {query.data.map((branch) => (
            <Card key={branch.id}>
              <p className="text-lg font-medium text-slate-900">{branch.name}</p>
              <p className="text-sm text-slate-600" dir="ltr">
                {branch.code}
              </p>
              {branch.address ? (
                <p className="mt-2 text-sm text-slate-600">{branch.address}</p>
              ) : null}
              {branch.phone ? (
                <p className="text-sm text-slate-600" dir="ltr">
                  {branch.phone}
                </p>
              ) : null}
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState title={t('common.noResults')} />
      )}
    </div>
  );
}
