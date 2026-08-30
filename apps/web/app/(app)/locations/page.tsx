'use client';

import { useQuery } from '@tanstack/react-query';

import { Badge, Card, EmptyState, ErrorState, LoadingState } from '@cheque-flow/ui';

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
    <div className="mx-auto flex max-w-[1180px] flex-col gap-5">
      <PageHeader title={t('nav.locations')} />
      {query.data && query.data.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {query.data.map((location) => (
            <Card key={location.id} className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-lg font-medium text-slate-900">{location.name}</p>
                <Badge tone="info">{t(`locationType.${location.type}`)}</Badge>
              </div>
              {location.description ? (
                <p className="text-sm text-slate-600">{location.description}</p>
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
