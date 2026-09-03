'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';

import { ApiClientError } from '@cheque-flow/api-client';
import { ContactType, Permission } from '@cheque-flow/shared-types';
import { createContactSchema } from '@cheque-flow/validation';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  SuccessBanner,
  inputClassName,
} from '@cheque-flow/ui';

import { DataTable } from '@/components/data-table';
import { IconClose, IconPlus } from '@/components/icons';
import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { Panel } from '@/components/panel';
import { useApi, useTranslator } from '@/components/providers';
import { usePermission } from '@/components/session';

export default function ContactsPage() {
  const api = useApi();
  const t = useTranslator();
  const queryClient = useQueryClient();
  const canManage = usePermission(Permission.CONTACT_MANAGE);

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [name, setName] = useState('');
  const [type, setType] = useState<string>(ContactType.CUSTOMER);
  const [phone, setPhone] = useState('');
  const [creditLimit, setCreditLimit] = useState('');
  const [creditCurrency, setCreditCurrency] = useState('USD');
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const contacts = useQuery({
    queryKey: ['contacts', { search, page }],
    queryFn: () => api.listContacts({ page, pageSize: 25, ...(search ? { search } : {}) }),
  });

  const create = useMutation({
    mutationFn: () => {
      const parsed = createContactSchema.safeParse({
        type,
        name,
        phone: phone || null,
        // The currency only travels with an actual limit: sending one on its
        // own is the half-written pair the schema rejects.
        creditLimit: creditLimit || null,
        creditLimitCurrency: creditLimit ? creditCurrency : null,
      });
      if (!parsed.success) {
        const first = parsed.error.issues[0];
        throw new ApiClientError({
          code: 'VALIDATION_ERROR',
          messageKey: first ? first.message : 'errors.VALIDATION_ERROR',
          message: 'invalid',
          status: 422,
        });
      }
      return api.createContact(parsed.data);
    },
    onSuccess: () => {
      setName('');
      setPhone('');
      setCreditLimit('');
      setError(null);
      setCreateOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['contacts'] });
    },
    onError: (caught: unknown) => {
      setError(
        caught instanceof ApiClientError ? t(caught.messageKey) : t('errors.INTERNAL_ERROR'),
      );
    },
  });

  function handleCreate(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setError(null);
    create.mutate();
  }

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
            <Button onClick={() => setCreateOpen(true)}>
              <IconPlus width="18" height="18" />
              {t('contact.newTitle')}
            </Button>
          ) : undefined
        }
      />

      {create.isSuccess ? <SuccessBanner message={t('contact.createSuccess')} /> : null}

      {canManage && createOpen ? (
        <>
          <button
            type="button"
            aria-label={t('common.close')}
            className="fixed inset-0 z-40 bg-slate-950/35 backdrop-blur-[2px]"
            onClick={() => setCreateOpen(false)}
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-contact-title"
            className="fixed inset-y-0 end-0 z-50 flex w-full max-w-lg flex-col bg-white shadow-2xl"
          >
            <div className="flex h-20 shrink-0 items-center justify-between border-b border-slate-200 px-6">
              <div>
                <p className="text-xs font-semibold text-teal-700">{t('contact.title')}</p>
                <h2 id="new-contact-title" className="mt-1 text-xl font-bold text-slate-950">
                  {t('contact.newTitle')}
                </h2>
              </div>
              <button
                type="button"
                aria-label={t('common.close')}
                className="flex size-10 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                onClick={() => setCreateOpen(false)}
              >
                <IconClose />
              </button>
            </div>

            <form onSubmit={handleCreate} className="flex min-h-0 flex-1 flex-col">
              <div className="flex-1 space-y-5 overflow-y-auto p-6">
                <Field label={t('contact.name')} htmlFor="contact-name" required>
                  <input
                    id="contact-name"
                    required
                    className={inputClassName}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                </Field>
                <Field label={t('contact.type')} htmlFor="contact-type" required>
                  <select
                    id="contact-type"
                    className={inputClassName}
                    value={type}
                    onChange={(event) => setType(event.target.value)}
                  >
                    {Object.values(ContactType).map((value) => (
                      <option key={value} value={value}>
                        {t(`contactType.${value}`)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field
                  label={t('contact.creditLimit')}
                  htmlFor="contact-credit"
                  hint={t('contact.creditLimitHint')}
                >
                  <div className="flex gap-2">
                    <input
                      id="contact-credit"
                      dir="ltr"
                      inputMode="decimal"
                      placeholder="0.00"
                      className={inputClassName}
                      value={creditLimit}
                      onChange={(event) => setCreditLimit(event.target.value)}
                    />
                    <select
                      aria-label={t('contact.creditLimitCurrency')}
                      className={`${inputClassName} w-24`}
                      value={creditCurrency}
                      onChange={(event) => setCreditCurrency(event.target.value)}
                    >
                      {['USD', 'ILS', 'JOD', 'EUR'].map((code) => (
                        <option key={code} value={code}>
                          {code}
                        </option>
                      ))}
                    </select>
                  </div>
                </Field>

                <Field label={t('contact.phone')} htmlFor="contact-phone">
                  <input
                    id="contact-phone"
                    dir="ltr"
                    className={inputClassName}
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                  />
                </Field>
                {error ? (
                  <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">
                    {error}
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center justify-end gap-3 border-t border-slate-200 bg-slate-50/70 p-4">
                <Button type="button" variant="secondary" onClick={() => setCreateOpen(false)}>
                  {t('common.cancel')}
                </Button>
                <Button type="submit" loading={create.isPending}>
                  {t('common.save')}
                </Button>
              </div>
            </form>
          </aside>
        </>
      ) : null}

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
