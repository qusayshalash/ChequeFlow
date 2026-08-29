'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';

import { ApiClientError } from '@cheque-flow/api-client';
import { ContactType, Permission } from '@cheque-flow/shared-types';
import { createContactSchema } from '@cheque-flow/validation';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  SuccessBanner,
  inputClassName,
} from '@cheque-flow/ui';

import { useApi, useTranslator } from '@/components/providers';
import { usePermission } from '@/components/session';

export default function ContactsPage() {
  const api = useApi();
  const t = useTranslator();
  const queryClient = useQueryClient();
  const canManage = usePermission(Permission.CONTACT_MANAGE);

  const [search, setSearch] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<string>(ContactType.CUSTOMER);
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);

  const contacts = useQuery({
    queryKey: ['contacts', { search }],
    queryFn: () => api.listContacts({ pageSize: 50, ...(search ? { search } : {}) }),
  });

  const create = useMutation({
    mutationFn: () => {
      const parsed = createContactSchema.safeParse({
        type,
        name,
        phone: phone || null,
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
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-slate-900">{t('contact.title')}</h1>

      {canManage ? (
        <Card>
          <h2 className="mb-4 text-lg font-semibold text-slate-900">{t('contact.newTitle')}</h2>
          {create.isSuccess ? <SuccessBanner message={t('contact.createSuccess')} /> : null}
          <form onSubmit={handleCreate} className="mt-3 grid gap-4 sm:grid-cols-4">
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
            <Field label={t('contact.phone')} htmlFor="contact-phone">
              <input
                id="contact-phone"
                dir="ltr"
                className={inputClassName}
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
              />
            </Field>
            <div className="flex items-end">
              <Button type="submit" className="w-full" loading={create.isPending}>
                {t('common.save')}
              </Button>
            </div>
            {error ? (
              <p
                role="alert"
                className="sm:col-span-4 rounded-lg bg-red-50 p-3 text-sm text-red-800"
              >
                {error}
              </p>
            ) : null}
          </form>
        </Card>
      ) : null}

      <Card>
        <Field label={t('common.search')} htmlFor="contact-search">
          <input
            id="contact-search"
            className={inputClassName}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </Field>
      </Card>

      {contacts.isPending ? <LoadingState label={t('common.loading')} /> : null}
      {contacts.isError ? (
        <ErrorState
          title={t('errors.INTERNAL_ERROR')}
          onRetry={() => void contacts.refetch()}
          retryLabel={t('common.retry')}
        />
      ) : null}

      {contacts.data ? (
        contacts.data.data.length === 0 ? (
          <EmptyState title={t('contact.empty')} />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full min-w-[600px] text-sm">
              <thead className="bg-slate-50 text-slate-700">
                <tr>
                  <th scope="col" className="p-3 text-start font-medium">
                    {t('contact.name')}
                  </th>
                  <th scope="col" className="p-3 text-start font-medium">
                    {t('contact.type')}
                  </th>
                  <th scope="col" className="p-3 text-start font-medium">
                    {t('contact.phone')}
                  </th>
                  <th scope="col" className="p-3 text-start font-medium">
                    {t('contact.isActive')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {contacts.data.data.map((contact) => (
                  <tr key={contact.id} className="hover:bg-slate-50">
                    <td className="p-3">
                      <Link
                        href={`/contacts/${contact.id}`}
                        className="font-medium text-teal-800 hover:underline"
                      >
                        {contact.name}
                      </Link>
                    </td>
                    <td className="p-3">{t(`contactType.${contact.type}`)}</td>
                    <td className="p-3" dir="ltr">
                      {contact.phone ?? '—'}
                    </td>
                    <td className="p-3">{contact.isActive ? t('common.yes') : t('common.no')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : null}
    </div>
  );
}
