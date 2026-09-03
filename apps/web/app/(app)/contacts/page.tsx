'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';

import { ContactType, Permission } from '@cheque-flow/shared-types';

import { Badge, EmptyState, ErrorState, LoadingState } from '@cheque-flow/ui';

import { ContactAvatar } from '@/components/contact-avatar';
import { DataTable } from '@/components/data-table';
import { FilterSearch } from '@/components/filter-search';
import { IconPlus } from '@/components/icons';
import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { Panel } from '@/components/panel';
import { useApi, useApp, useTranslator } from '@/components/providers';
import { usePermission } from '@/components/session';
import { Tabs } from '@/components/tabs';
import { money } from '@/lib/format';

export default function ContactsPage() {
  const api = useApi();
  const t = useTranslator();
  const { locale } = useApp();
  const canManage = usePermission(Permission.CONTACT_MANAGE);

  const [search, setSearch] = useState('');
  const [type, setType] = useState<'ALL' | ContactType>('ALL');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const contacts = useQuery({
    queryKey: ['contacts', { search, type, page, pageSize }],
    queryFn: () =>
      api.listContacts({
        page,
        pageSize,
        ...(search ? { search } : {}),
        ...(type === 'ALL' ? {} : { type }),
      }),
  });

  // One count per tab, fetched as the smallest page the API will return: the
  // number wanted is `meta.total`, and asking for a page of contacts to read a
  // total off it would move real rows over the wire for nothing. The search box
  // is part of the key, so the counts describe what the tabs would actually
  // show rather than the whole address book.
  const counts = useQuery({
    queryKey: ['contacts', 'counts', { search }],
    queryFn: async () => {
      const query = search ? { search } : {};
      const [all, customers, suppliers] = await Promise.all([
        api.listContacts({ ...query, pageSize: 1 }),
        api.listContacts({ ...query, pageSize: 1, type: ContactType.CUSTOMER }),
        api.listContacts({ ...query, pageSize: 1, type: ContactType.SUPPLIER }),
      ]);
      return {
        ALL: all.meta.total,
        [ContactType.CUSTOMER]: customers.meta.total,
        [ContactType.SUPPLIER]: suppliers.meta.total,
      };
    },
  });

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-5">
      <PageHeader
        title={t('contact.title')}
        subtitle={t('pageDescription.contacts')}
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

      {/* Customers and suppliers are read for different reasons — one is money
          coming in, the other money going out — and the counts say how much of
          each there is before the list is even scrolled. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs
          tabs={[
            { key: 'ALL', label: t('common.all'), count: counts.data?.ALL },
            {
              key: ContactType.CUSTOMER,
              label: t(`contactType.${ContactType.CUSTOMER}`),
              count: counts.data?.[ContactType.CUSTOMER],
            },
            {
              key: ContactType.SUPPLIER,
              label: t(`contactType.${ContactType.SUPPLIER}`),
              count: counts.data?.[ContactType.SUPPLIER],
            },
          ]}
          active={type}
          onChange={(key) => {
            setType(key as 'ALL' | ContactType);
            setPage(1);
          }}
        />

        <FilterSearch
          value={search}
          onChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
          placeholder={t('contact.searchPlaceholder')}
        />
      </div>

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
                    className="flex min-w-0 items-center gap-3 font-semibold text-slate-900 hover:text-teal-700"
                  >
                    <ContactAvatar name={contact.name} />
                    <span className="min-w-0">
                      <span className="block truncate">{contact.name}</span>
                      {contact.companyName ? (
                        <span className="block truncate text-xs font-normal text-slate-400">
                          {contact.companyName}
                        </span>
                      ) : null}
                    </span>
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
                key: 'balance',
                header: t('contact.balance'),
                numeric: true,
                cell: (contact) =>
                  contact.balances.length === 0 ? (
                    <span className="text-sm text-slate-400">{t('contact.settled')}</span>
                  ) : (
                    // One line per currency. A single figure would mean adding
                    // dollars to shekels, which has no honest answer.
                    <span className="flex flex-col items-end gap-0.5">
                      {contact.balances.map((balance) => {
                        const owed = !balance.net.startsWith('-');
                        return (
                          <span
                            key={balance.currency}
                            dir="ltr"
                            title={owed ? t('contact.owesUs') : t('contact.weOwe')}
                            className={`text-sm font-semibold tabular-nums ${
                              owed ? 'text-emerald-700' : 'text-red-700'
                            }`}
                          >
                            {money(locale, balance.net, balance.currency)}
                          </span>
                        );
                      })}
                    </span>
                  ),
              },
              {
                key: 'cheques',
                header: t('contact.chequeCount'),
                numeric: true,
                cell: (contact) => (
                  <span className="tabular-nums">
                    {contact.chequeCount > 0 ? contact.chequeCount : '—'}
                  </span>
                ),
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

      {contacts.data ? (
        <Pagination
          meta={contacts.data.meta}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
        />
      ) : null}
    </div>
  );
}
