'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';

import { ChequeStatus, type Paginated, type ChequeSummaryView } from '@cheque-flow/shared-types';
import { Button, Card, ErrorState, Field, LoadingState, inputClassName } from '@cheque-flow/ui';

import { ChequeTable } from '@/components/cheque-table';
import { useApi, useTranslator } from '@/components/providers';

export default function ChequesPage() {
  const api = useApi();
  const t = useTranslator();

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string>('');
  const [page, setPage] = useState(1);

  const query = useQuery<Paginated<ChequeSummaryView>>({
    queryKey: ['cheques', { search, status, page }],
    queryFn: () =>
      api.listCheques({
        page,
        pageSize: 20,
        ...(search ? { search } : {}),
        ...(status ? { status: [status as ChequeStatus] } : {}),
      }),
    placeholderData: keepPreviousData,
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-slate-900">{t('cheque.listTitle')}</h1>
        <Link href="/cheques/new">
          <Button size="lg">{t('cheque.newTitle')}</Button>
        </Link>
      </div>

      <Card>
        <form
          className="grid gap-4 sm:grid-cols-3"
          onSubmit={(event) => {
            event.preventDefault();
            setPage(1);
          }}
        >
          <Field label={t('common.search')} htmlFor="search">
            <input
              id="search"
              className={inputClassName}
              value={search}
              placeholder={t('cheque.number')}
              onChange={(event) => setSearch(event.target.value)}
            />
          </Field>

          <Field label={t('common.status')} htmlFor="status">
            <select
              id="status"
              className={inputClassName}
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
            >
              <option value="">{t('common.all')}</option>
              {Object.values(ChequeStatus).map((value) => (
                <option key={value} value={value}>
                  {t(`status.${value}`)}
                </option>
              ))}
            </select>
          </Field>

          <div className="flex items-end">
            <Button type="submit" variant="secondary" className="w-full">
              {t('common.filter')}
            </Button>
          </div>
        </form>
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
          <ChequeTable cheques={query.data.data} />
          <nav className="flex items-center justify-between gap-3" aria-label={t('common.page')}>
            <Button
              variant="secondary"
              disabled={query.data.meta.page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              {t('common.previous')}
            </Button>
            <span className="text-sm text-slate-600">
              {t('common.page')} {query.data.meta.page} {t('common.of')}{' '}
              {query.data.meta.totalPages}
              {' · '}
              {t('common.total')}: {query.data.meta.total}
            </span>
            <Button
              variant="secondary"
              disabled={!query.data.meta.hasNextPage}
              onClick={() => setPage((current) => current + 1)}
            >
              {t('common.next')}
            </Button>
          </nav>
        </>
      ) : null}
    </div>
  );
}
