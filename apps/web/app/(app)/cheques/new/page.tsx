'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { ApiClientError } from '@cheque-flow/api-client';
import { ChequeDirection } from '@cheque-flow/shared-types';
import { createChequeSchema, type CreateChequeInput } from '@cheque-flow/validation';
import { Button, ErrorState, Field, SuccessBanner, inputClassName } from '@cheque-flow/ui';

import { PageHeader } from '@/components/page-header';
import { Panel } from '@/components/panel';
import { useApi, useTranslator } from '@/components/providers';

interface FormState {
  direction: string;
  chequeNumber: string;
  amount: string;
  currency: string;
  issueDate: string;
  dueDate: string;
  bankId: string;
  drawerName: string;
  originalSourceId: string;
  currentLocationId: string;
  notes: string;
}

const EMPTY: FormState = {
  direction: ChequeDirection.INCOMING,
  chequeNumber: '',
  amount: '',
  currency: 'USD',
  issueDate: '',
  dueDate: '',
  bankId: '',
  drawerName: '',
  originalSourceId: '',
  currentLocationId: '',
  notes: '',
};

export default function NewChequePage() {
  const api = useApi();
  const t = useTranslator();
  const router = useRouter();

  const [form, setForm] = useState<FormState>(EMPTY);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState(false);

  const banks = useQuery({ queryKey: ['banks'], queryFn: () => api.listBanks() });
  const locations = useQuery({ queryKey: ['locations'], queryFn: () => api.listLocations() });
  const contacts = useQuery({
    queryKey: ['contacts', 'all'],
    queryFn: () => api.listContacts({ pageSize: 100 }),
  });

  const mutation = useMutation({
    mutationFn: (input: { payload: CreateChequeInput; allowDuplicate: boolean }) =>
      api.createCheque(input.payload, input.allowDuplicate),
    onSuccess: (result) => {
      router.push(`/cheques/${result.cheque.id}`);
    },
    onError: (error: unknown) => {
      if (error instanceof ApiClientError) {
        setFieldErrors(error.fieldErrorMap);
        setFormError(t(error.messageKey));
        setDuplicateWarning(error.isDuplicate);
      } else {
        setFormError(t('errors.INTERNAL_ERROR'));
      }
    },
  });

  function submit(allowDuplicate: boolean): void {
    setFieldErrors({});
    setFormError(null);

    // Validated with the same Zod schema the API uses, so the two never drift.
    const parsed = createChequeSchema.safeParse({
      ...form,
      issueDate: form.issueDate || null,
      bankId: form.bankId || null,
      originalSourceId: form.originalSourceId || null,
      currentLocationId: form.currentLocationId || null,
      drawerName: form.drawerName || null,
      notes: form.notes || null,
    });

    if (!parsed.success) {
      setFieldErrors(
        Object.fromEntries(
          parsed.error.issues.map((issue) => [issue.path.join('.'), t(issue.message)]),
        ),
      );
      setFormError(t('errors.VALIDATION_ERROR'));
      return;
    }

    mutation.mutate({ payload: parsed.data, allowDuplicate });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    submit(false);
  }

  function update<K extends keyof FormState>(key: K, value: string): void {
    setForm((current) => ({ ...current, [key]: value }));
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <PageHeader title={t('cheque.newTitle')} />

      {duplicateWarning ? (
        <ErrorState
          title={`${t('cheque.duplicateWarning')} — ${t('cheque.duplicateBusinessKey')}`}
        />
      ) : null}

      {mutation.isSuccess ? <SuccessBanner message={t('cheque.createSuccess')} /> : null}

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <Panel title={t('cheque.identityGroup')}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('cheque.direction')} htmlFor="direction" required>
              <select
                id="direction"
                className={inputClassName}
                value={form.direction}
                onChange={(event) => update('direction', event.target.value)}
              >
                {Object.values(ChequeDirection).map((value) => (
                  <option key={value} value={value}>
                    {t(`direction.${value}`)}
                  </option>
                ))}
              </select>
            </Field>

            <Field
              label={t('cheque.number')}
              htmlFor="chequeNumber"
              required
              error={fieldErrors.chequeNumber}
            >
              <input
                id="chequeNumber"
                dir="ltr"
                className={inputClassName}
                value={form.chequeNumber}
                onChange={(event) => update('chequeNumber', event.target.value)}
                aria-invalid={Boolean(fieldErrors.chequeNumber)}
              />
            </Field>

            <Field label={t('common.amount')} htmlFor="amount" required error={fieldErrors.amount}>
              <input
                id="amount"
                dir="ltr"
                inputMode="decimal"
                placeholder="0.00"
                className={inputClassName}
                value={form.amount}
                onChange={(event) => update('amount', event.target.value)}
                aria-invalid={Boolean(fieldErrors.amount)}
              />
            </Field>

            <Field
              label={t('common.currency')}
              htmlFor="currency"
              required
              error={fieldErrors.currency}
            >
              <input
                id="currency"
                dir="ltr"
                maxLength={3}
                className={inputClassName}
                value={form.currency}
                onChange={(event) => update('currency', event.target.value)}
              />
            </Field>
          </div>
        </Panel>

        <Panel title={t('cheque.dates')}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('cheque.issueDate')} htmlFor="issueDate" error={fieldErrors.issueDate}>
              <input
                id="issueDate"
                type="date"
                className={inputClassName}
                value={form.issueDate}
                onChange={(event) => update('issueDate', event.target.value)}
              />
            </Field>

            <Field
              label={t('cheque.dueDate')}
              htmlFor="dueDate"
              required
              error={fieldErrors.dueDate}
            >
              <input
                id="dueDate"
                type="date"
                required
                className={inputClassName}
                value={form.dueDate}
                onChange={(event) => update('dueDate', event.target.value)}
                aria-invalid={Boolean(fieldErrors.dueDate)}
              />
            </Field>
          </div>
        </Panel>

        <Panel title={t('cheque.bank')}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('cheque.bank')} htmlFor="bankId">
              <select
                id="bankId"
                className={inputClassName}
                value={form.bankId}
                onChange={(event) => update('bankId', event.target.value)}
              >
                <option value="">{t('common.unknown')}</option>
                {(banks.data ?? []).map((bank) => (
                  <option key={bank.id} value={bank.id}>
                    {bank.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </Panel>

        <Panel title={t('cheque.parties')}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('cheque.originalSource')} htmlFor="originalSourceId">
              <select
                id="originalSourceId"
                className={inputClassName}
                value={form.originalSourceId}
                onChange={(event) => update('originalSourceId', event.target.value)}
              >
                <option value="">{t('common.unknown')}</option>
                {(contacts.data?.data ?? []).map((contact) => (
                  <option key={contact.id} value={contact.id}>
                    {contact.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label={t('cheque.drawerName')} htmlFor="drawerName">
              <input
                id="drawerName"
                className={inputClassName}
                value={form.drawerName}
                onChange={(event) => update('drawerName', event.target.value)}
              />
            </Field>

            <Field label={t('cheque.currentLocation')} htmlFor="currentLocationId">
              <select
                id="currentLocationId"
                className={inputClassName}
                value={form.currentLocationId}
                onChange={(event) => update('currentLocationId', event.target.value)}
              >
                <option value="">{t('common.unknown')}</option>
                {(locations.data ?? []).map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </Panel>

        <Panel title={t('cheque.notesGroup')}>
          <Field label={t('common.notes')} htmlFor="notes">
            <textarea
              id="notes"
              rows={3}
              className={`${inputClassName} py-2`}
              value={form.notes}
              onChange={(event) => update('notes', event.target.value)}
            />
          </Field>
        </Panel>

        {formError ? (
          <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
            {formError}
          </p>
        ) : null}

        {/* The save bar sticks to the bottom: the form is now five panels tall,
            and a submit button you have to go looking for is a form people
            abandon halfway. */}
        <div className="sticky bottom-0 -mx-1 flex flex-wrap gap-3 rounded-2xl border border-slate-200 bg-white/95 p-4 backdrop-blur">
          <Button type="submit" size="lg" loading={mutation.isPending}>
            {t('common.save')}
          </Button>
          {duplicateWarning ? (
            <Button
              type="button"
              variant="danger"
              onClick={() => submit(true)}
              loading={mutation.isPending}
            >
              {t('common.confirm')}
            </Button>
          ) : null}
        </div>
      </form>
    </div>
  );
}
