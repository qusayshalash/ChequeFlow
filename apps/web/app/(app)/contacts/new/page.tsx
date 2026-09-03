'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { ApiClientError } from '@cheque-flow/api-client';
import { ContactType } from '@cheque-flow/shared-types';
import { createContactSchema } from '@cheque-flow/validation';
import { Button, Field, inputClassName } from '@cheque-flow/ui';

import { PageHeader } from '@/components/page-header';
import { Panel } from '@/components/panel';
import { useApi, useTranslator } from '@/components/providers';

const CURRENCIES = ['USD', 'ILS', 'JOD', 'EUR'];

/**
 * Recording a contact.
 *
 * A page rather than the slide-over it replaces, for reasons that showed up
 * once the panel existed:
 *
 *  - The panel could only fit four fields, so five real ones — company, tax
 *    and national numbers, address, notes — had no way in at all until someone
 *    saved the contact and opened it again to edit.
 *  - It had no address. `/contacts/new` can be bookmarked, opened in a second
 *    tab, or sent to a colleague; a panel is a state that only exists after
 *    somebody clicks the right button.
 *  - Closing it by mis-clicking the backdrop discarded everything typed, with
 *    no warning and no way back.
 *
 * `?next=` carries where to return to, so the cheque form can send someone
 * here mid-entry and get them back to the half-filled cheque afterwards.
 */
export default function NewContactPage() {
  const api = useApi();
  const t = useTranslator();
  const router = useRouter();
  const params = useSearchParams();
  const queryClient = useQueryClient();

  const returnTo = params.get('next');

  const [form, setForm] = useState({
    name: '',
    type: ContactType.CUSTOMER as ContactType,
    companyName: '',
    phone: '',
    email: '',
    nationalId: '',
    taxNumber: '',
    address: '',
    notes: '',
    creditLimit: '',
    creditLimitCurrency: 'USD',
  });

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  function update<K extends keyof typeof form>(key: K, value: string): void {
    setForm((current) => ({ ...current, [key]: value }));
  }

  const create = useMutation({
    mutationFn: () => {
      const parsed = createContactSchema.safeParse({
        type: form.type,
        name: form.name,
        companyName: form.companyName || null,
        phone: form.phone || null,
        email: form.email || null,
        nationalId: form.nationalId || null,
        taxNumber: form.taxNumber || null,
        address: form.address || null,
        notes: form.notes || null,
        // The currency travels only with an actual limit; on its own it is the
        // half-written pair the schema rejects.
        creditLimit: form.creditLimit || null,
        creditLimitCurrency: form.creditLimit ? form.creditLimitCurrency : null,
      });

      if (!parsed.success) {
        setFieldErrors(
          Object.fromEntries(
            parsed.error.issues.map((issue) => [issue.path.join('.'), t(issue.message)]),
          ),
        );
        setFormError(t('errors.VALIDATION_ERROR'));
        throw new Error('validation');
      }

      setFieldErrors({});
      return api.createContact(parsed.data);
    },
    onSuccess: (contact) => {
      void queryClient.invalidateQueries({ queryKey: ['contacts'] });
      // Back where they came from, with the new contact named so the caller
      // can select it — coming back to an unchanged form would mean picking it
      // out of the list by hand.
      router.push(
        returnTo
          ? `${returnTo}${returnTo.includes('?') ? '&' : '?'}contact=${contact.id}`
          : `/contacts/${contact.id}`,
      );
    },
    onError: (caught: unknown) => {
      if (caught instanceof Error && caught.message === 'validation') return;
      if (caught instanceof ApiClientError) {
        setFieldErrors(caught.fieldErrorMap);
        setFormError(t(caught.messageKey));
        return;
      }
      setFormError(t('errors.saveFailed'));
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setFormError(null);
    create.mutate();
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <PageHeader title={t('contact.newTitle')} />

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <Panel title={t('contact.title')}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('contact.name')} htmlFor="name" required error={fieldErrors.name}>
              <input
                id="name"
                required
                autoFocus
                className={inputClassName}
                value={form.name}
                onChange={(event) => update('name', event.target.value)}
              />
            </Field>

            <Field label={t('contact.type')} htmlFor="type" required>
              <select
                id="type"
                className={inputClassName}
                value={form.type}
                onChange={(event) => update('type', event.target.value)}
              >
                {Object.values(ContactType).map((value) => (
                  <option key={value} value={value}>
                    {t(`contactType.${value}`)}
                  </option>
                ))}
              </select>
            </Field>

            {/* First of the optional fields: a contact with no number cannot be
                sent a reminder, which is the most common reason to come back
                and edit one. */}
            <Field label={t('contact.phone')} htmlFor="phone" error={fieldErrors.phone}>
              <input
                id="phone"
                dir="ltr"
                inputMode="tel"
                autoComplete="tel"
                className={inputClassName}
                value={form.phone}
                onChange={(event) => update('phone', event.target.value)}
              />
            </Field>

            <Field label={t('contact.email')} htmlFor="email" error={fieldErrors.email}>
              <input
                id="email"
                type="email"
                dir="ltr"
                className={inputClassName}
                value={form.email}
                onChange={(event) => update('email', event.target.value)}
              />
            </Field>

            <Field label={t('contact.companyName')} htmlFor="companyName">
              <input
                id="companyName"
                className={inputClassName}
                value={form.companyName}
                onChange={(event) => update('companyName', event.target.value)}
              />
            </Field>

            <Field label={t('contact.nationalId')} htmlFor="nationalId">
              <input
                id="nationalId"
                dir="ltr"
                className={inputClassName}
                value={form.nationalId}
                onChange={(event) => update('nationalId', event.target.value)}
              />
            </Field>

            <Field label={t('contact.taxNumber')} htmlFor="taxNumber">
              <input
                id="taxNumber"
                dir="ltr"
                className={inputClassName}
                value={form.taxNumber}
                onChange={(event) => update('taxNumber', event.target.value)}
              />
            </Field>

            <Field
              label={t('contact.creditLimit')}
              htmlFor="creditLimit"
              hint={t('contact.creditLimitHint')}
              error={fieldErrors.creditLimit ?? fieldErrors.creditLimitCurrency}
            >
              <div className="flex gap-2">
                <input
                  id="creditLimit"
                  dir="ltr"
                  inputMode="decimal"
                  placeholder="0.00"
                  className={inputClassName}
                  value={form.creditLimit}
                  onChange={(event) => update('creditLimit', event.target.value)}
                />
                <select
                  aria-label={t('contact.creditLimitCurrency')}
                  className={`${inputClassName} w-24`}
                  value={form.creditLimitCurrency}
                  onChange={(event) => update('creditLimitCurrency', event.target.value)}
                >
                  {CURRENCIES.map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </select>
              </div>
            </Field>
          </div>

          <div className="mt-4 flex flex-col gap-4">
            <Field label={t('contact.address')} htmlFor="address">
              <input
                id="address"
                className={inputClassName}
                value={form.address}
                onChange={(event) => update('address', event.target.value)}
              />
            </Field>

            <Field label={t('common.notes')} htmlFor="notes">
              <textarea
                id="notes"
                rows={3}
                className={`${inputClassName} py-2`}
                value={form.notes}
                onChange={(event) => update('notes', event.target.value)}
              />
            </Field>
          </div>
        </Panel>

        {formError ? (
          <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
            {formError}
          </p>
        ) : null}

        <div className="sticky bottom-4 z-10 -mx-1 flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-[0_18px_48px_-30px_rgb(16_24_40/0.6)] backdrop-blur-xl">
          <Button type="submit" size="lg" loading={create.isPending}>
            {t('common.save')}
          </Button>
          <Link
            href={returnTo ?? '/contacts'}
            className="inline-flex h-11 items-center rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            {t('common.cancel')}
          </Link>
        </div>
      </form>
    </div>
  );
}
