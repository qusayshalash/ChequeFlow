'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';

import { Permission } from '@cheque-flow/shared-types';

import { Badge, EmptyState, ErrorState, LoadingState } from '@cheque-flow/ui';

import { DataTable } from '@/components/data-table';
import { IconPlus } from '@/components/icons';
import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { Panel } from '@/components/panel';
import { useApi, useTranslator } from '@/components/providers';
import { usePermission } from '@/components/session';

export default function ContactsPage() {
  const api = useApi();
  const t = useTranslator();
  const canManage = usePermission(Permission.CONTACT_MANAGE);

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const contacts = useQuery({
    queryKey: ['contacts', { search, page }],
    queryFn: () => api.listContacts({ page, pageSize: 25, ...(search ? { search } : {}) }),
  });

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-5">
      <PageHeader
        title={t('contact.title')}
        subtitle={t('pageDescription.contacts')}
        search={{
          value: search,
          onChange: (value) => {
            setSearch(value);
            setPage(1);
          },
          placeholder: t('contact.searchPlaceholder'),
        }}
        actions={
          canManage ? (
            <Link
              href="/contacts/new"
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-teal-800 px-4 text-sm font-semibold text-white hover:bg-teal-900"
            >
              <IconPlus width="18" height="18" />
              {t('contact.newTitle')}
            </Link>
          ) : undefined
        }
      />

      {contacts.isPending ? <LoadingState label={t('common.loading')} /> : null}
      {contacts.isError ? (
        <ErrorState
          title={t('errors.INTERNAL_ERROR')}
          onRetry={() => void contacts.refetch()}
          retryLabel={t('common.retry')}
        />
      ) : null}

      {contacts.data ? (
        <Panel bodyClassName="">
          <DataTable
            rows={contacts.data.data}
            rowKey={(contact) => contact.id}
            empty={<EmptyState title={t('contact.empty')} />}
            columns={[
              {
                key: 'name',
                header: t('contact.name'),
                cell: (contact) => (
                  <Link
                    href={`/contacts/${contact.id}`}
                    className="font-semibold text-slate-900 hover:text-teal-700"
                  >
                    {contact.name}
                  </Link>
                ),
              },
              {
                key: 'type',
                header: t('contact.type'),
                cell: (contact) => t(`contactType.${contact.type}`),
              },
              {
                key: 'phone',
                header: t('contact.phone'),
                numeric: true,
                cell: (contact) => <span dir="ltr">{contact.phone ?? '—'}</span>,
              },
              {
                key: 'active',
                header: t('contact.isActive'),
                cell: (contact) =>
                  contact.isActive ? (
                    <Badge tone="success">{t('common.yes')}</Badge>
                  ) : (
                    <Badge>{t('common.no')}</Badge>
                  ),
              },
            ]}
          />
        </Panel>
      ) : null}

      {contacts.data ? <Pagination meta={contacts.data.meta} onPageChange={setPage} /> : null}
    </div>
  );
}
