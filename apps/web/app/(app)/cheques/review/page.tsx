'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { ChequeStatus } from '@cheque-flow/shared-types';
import { Card, ErrorState, LoadingState } from '@cheque-flow/ui';

import { BulkActionBar } from '@/components/bulk-action-bar';
import { ChequeTable } from '@/components/cheque-table';
import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { Panel } from '@/components/panel';
import { useApi, useTranslator } from '@/components/providers';
import { useSession } from '@/components/session';

export default function ReviewQueuePage() {
  const api = useApi();
  const t = useTranslator();
  const ocrOff = useSession().data?.ocrEnabled === false;

  const [page, setPage] = useState(1);
  // The queue is where new cheques wait to be received, usually several at a
  // time from one customer, so it selects like the main list and acts on all
  // of them at once instead of one cheque page after another.
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());

  function toggle(id: string): void {
    setSelected((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  function toggleAll(keys: string[]): void {
    setSelected((current) => {
      const allOn = keys.length > 0 && keys.every((key) => current.has(key));
      const next = new Set(current);
      for (const key of keys) {
        if (allOn) next.delete(key);
        else next.add(key);
      }
      return next;
    });
  }

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
      {ocrOff ? null : (
        <Card className="flex items-start gap-3 border-warning-line bg-warning-soft/70 text-sm leading-6 text-warning">
          <span className="mt-1 size-2 shrink-0 rounded-full bg-warning" aria-hidden="true" />
          {t('ocr.suggestionNotice')}
        </Card>
      )}
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
            <ChequeTable
              cheques={query.data.data}
              selection={{
                selected,
                onToggle: toggle,
                onToggleAll: toggleAll,
                selectAllLabel: t('bulk.selectAll'),
              }}
            />
          </Panel>
          <Pagination
            meta={query.data.meta}
            onPageChange={(next) => {
              setPage(next);
              // Per page: a bulk action applies to the rows on screen.
              setSelected(new Set());
            }}
          />
        </>
      ) : null}

      <BulkActionBar
        selected={selected}
        onClear={() => setSelected(new Set())}
        initialAction="RECEIVE"
      />
    </div>
  );
}
