'use client';

import { useQuery } from '@tanstack/react-query';
import { use } from 'react';

import { Card, ErrorState, LoadingState } from '@cheque-flow/ui';

import { ChequeTable } from '@/components/cheque-table';
import { useApi, useTranslator } from '@/components/providers';

export default function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const api = useApi();
  const t = useTranslator();

  const contact = useQuery({ queryKey: ['contact', id], queryFn: () => api.getContact(id) });
  const cheques = useQuery({
    queryKey: ['cheques', 'by-source', id],
    queryFn: () => api.listCheques({ sourceId: id, pageSize: 50 }),
  });

  if (contact.isPending) return <LoadingState label={t('common.loading')} />;
  if (!contact.data) return <ErrorState title={t('errors.NOT_FOUND')} />;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-slate-900">{contact.data.name}</h1>

      <Card>
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-3">
          <div>
            <dt className="text-sm text-slate-600">{t('contact.type')}</dt>
            <dd>{t(`contactType.${contact.data.type}`)}</dd>
          </div>
          <div>
            <dt className="text-sm text-slate-600">{t('contact.phone')}</dt>
            <dd dir="ltr">{contact.data.phone ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-sm text-slate-600">{t('contact.email')}</dt>
            <dd dir="ltr">{contact.data.email ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-sm text-slate-600">{t('contact.companyName')}</dt>
            <dd>{contact.data.companyName ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-sm text-slate-600">{t('contact.taxNumber')}</dt>
            <dd dir="ltr">{contact.data.taxNumber ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-sm text-slate-600">{t('contact.isActive')}</dt>
            <dd>{contact.data.isActive ? t('common.yes') : t('common.no')}</dd>
          </div>
        </dl>
      </Card>

      <h2 className="text-lg font-semibold text-slate-900">{t('cheque.listTitle')}</h2>
      {cheques.data ? (
        <ChequeTable cheques={cheques.data.data} />
      ) : (
        <LoadingState label={t('common.loading')} />
      )}
    </div>
  );
}
