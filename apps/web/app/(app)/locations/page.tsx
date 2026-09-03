'use client';

import { useQuery } from '@tanstack/react-query';

import { Badge, Card, EmptyState, ErrorState, LoadingState } from '@cheque-flow/ui';

import { IconSafe } from '@/components/icons';
import { PageHeader } from '@/components/page-header';
import { useApi, useTranslator } from '@/components/providers';

export default function LocationsPage() {
  const api = useApi();
  const t = useTranslator();
  const query = useQuery({ queryKey: ['locations'], queryFn: () => api.listLocations() });

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
      <PageHeader title={t('nav.locations')} subtitle={t('pageDescription.locations')} />
      {query.data && query.data.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {query.data.map((location) => (
            <Card
              key={location.id}
              className="group p-0 transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
            >
              <div className="flex items-start gap-4 p-5">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-700 ring-1 ring-sky-100">
                  <IconSafe />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-base font-bold text-slate-950">{location.name}</p>
                    <Badge tone="info">{t(`locationType.${location.type}`)}</Badge>
                  </div>
                  {location.description ? (
                    <p className="mt-2 text-sm leading-6 text-slate-500">{location.description}</p>
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
