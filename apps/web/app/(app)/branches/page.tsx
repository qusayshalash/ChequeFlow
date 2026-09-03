'use client';

import { useQuery } from '@tanstack/react-query';

import { Card, EmptyState, ErrorState, LoadingState } from '@cheque-flow/ui';

import { IconBranch } from '@/components/icons';
import { PageHeader } from '@/components/page-header';
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
    <div className="mx-auto flex max-w-[1440px] flex-col gap-5">
      <PageHeader title={t('nav.branches')} subtitle={t('pageDescription.branches')} />
      {query.data && query.data.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {query.data.map((branch) => (
            <Card
              key={branch.id}
              className="group p-0 transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
            >
              <div className="flex items-start gap-4 p-5">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700 ring-1 ring-teal-100">
                  <IconBranch />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-base font-bold text-slate-950">{branch.name}</p>
                    <span
                      className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-[11px] font-semibold text-slate-500"
                      dir="ltr"
                    >
                      {branch.code}
                    </span>
                  </div>
                  {branch.address ? (
                    <p className="mt-2 text-sm leading-6 text-slate-500">{branch.address}</p>
                  ) : null}
                  {branch.phone ? (
                    <p className="mt-1 text-sm font-medium text-slate-600 tabular-nums" dir="ltr">
                      {branch.phone}
                    </p>
                  ) : null}
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState title={t('common.noResults')} />
      )}
    </div>
  );
}
