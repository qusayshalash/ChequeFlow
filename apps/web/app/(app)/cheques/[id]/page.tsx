'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { use } from 'react';

import { ChequeStatus, Permission, type ChequeDetailView } from '@cheque-flow/shared-types';
import { Card, ErrorState, LoadingState, StatusBadge } from '@cheque-flow/ui';

import { ChequeActionsPanel } from '@/components/cheque-actions';
import { ChequeImagesPanel } from '@/components/cheque-images';
import { ChequeTimeline } from '@/components/cheque-timeline';
import { OcrReviewPanel } from '@/components/ocr-review';
import { useApi, useApp, useTranslator } from '@/components/providers';
import { usePermission } from '@/components/session';
import { formatDate, money } from '@/lib/format';

export default function ChequeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const api = useApi();
  const t = useTranslator();
  const { locale } = useApp();
  const canViewImages = usePermission(Permission.CHEQUE_VIEW_IMAGE);

  const cheque = useQuery<ChequeDetailView>({
    queryKey: ['cheque', id],
    queryFn: () => api.getCheque(id),
  });

  const contacts = useQuery({
    queryKey: ['contacts', 'all'],
    queryFn: () => api.listContacts({ pageSize: 100 }),
  });
  const locations = useQuery({ queryKey: ['locations'], queryFn: () => api.listLocations() });

  if (cheque.isPending) return <LoadingState label={t('common.loading')} />;
  if (cheque.isError || !cheque.data) {
    return (
      <ErrorState
        title={t('errors.NOT_FOUND')}
        onRetry={() => void cheque.refetch()}
        retryLabel={t('common.retry')}
      />
    );
  }

  const data = cheque.data;
  const rows: Array<{ label: string; value: string }> = [
    { label: t('cheque.direction'), value: t(`direction.${data.direction}`) },
    { label: t('common.amount'), value: money(locale, data.amount, data.currency) },
    { label: t('cheque.dueDate'), value: formatDate(locale, data.dueDate) },
    {
      label: t('cheque.issueDate'),
      value: data.issueDate ? formatDate(locale, data.issueDate) : t('common.unknown'),
    },
    { label: t('cheque.bank'), value: data.bankName ?? t('common.unknown') },
    { label: t('cheque.bankBranch'), value: data.bankBranchRaw ?? t('common.unknown') },
    { label: t('cheque.accountNumber'), value: data.accountNumberMasked ?? t('common.unknown') },
    { label: t('cheque.drawerName'), value: data.drawerName ?? t('common.unknown') },
    { label: t('cheque.originalSource'), value: data.originalSourceName ?? t('common.unknown') },
    { label: t('cheque.originalPayee'), value: data.originalPayeeName ?? t('common.unknown') },
    {
      label: t('cheque.currentRecipient'),
      value: data.currentRecipientName ?? t('common.unknown'),
    },
    { label: t('cheque.currentLocation'), value: data.currentLocationName ?? t('common.unknown') },
    { label: t('cheque.branch'), value: data.branchName ?? t('common.unknown') },
    { label: t('cheque.referenceNumber'), value: data.referenceNumber ?? t('common.unknown') },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold text-slate-900" dir="ltr">
          {data.chequeNumber}
        </h1>
        <StatusBadge status={data.status} label={t(`status.${data.status}`)} />
        <Link
          href={`/cheques/${data.id}/timeline`}
          className="ms-auto text-teal-800 underline-offset-2 hover:underline"
        >
          {t('cheque.timeline')}
        </Link>
      </div>

      <Card>
        <h2 className="mb-4 text-lg font-semibold text-slate-900">{t('common.details')}</h2>
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((row) => (
            <div key={row.label} className="flex flex-col">
              <dt className="text-sm text-slate-600">{row.label}</dt>
              <dd className="text-base text-slate-900">{row.value}</dd>
            </div>
          ))}
        </dl>
        {data.notes ? <p className="mt-4 text-sm text-slate-700">{data.notes}</p> : null}
      </Card>

      {data.status === ChequeStatus.DRAFT || data.status === ChequeStatus.PENDING_REVIEW ? (
        <OcrReviewPanel cheque={data} />
      ) : null}

      <ChequeActionsPanel
        cheque={data}
        contacts={(contacts.data?.data ?? []).map((contact) => ({
          id: contact.id,
          name: contact.name,
        }))}
        locations={(locations.data ?? []).map((location) => ({
          id: location.id,
          name: location.name,
        }))}
      />

      <ChequeImagesPanel chequeId={data.id} canViewImages={canViewImages} />

      <ChequeTimeline chequeId={data.id} />
    </div>
  );
}
