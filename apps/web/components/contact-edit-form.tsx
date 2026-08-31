'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';

import { ApiClientError } from '@cheque-flow/api-client';
import { ContactType, type ContactView } from '@cheque-flow/shared-types';
import { updateContactSchema } from '@cheque-flow/validation';
import { Button, Field, inputClassName } from '@cheque-flow/ui';

import { useApi, useTranslator } from '@/components/providers';

const CURRENCIES = ['USD', 'ILS', 'JOD', 'EUR'];

/**
 * Edits everything about a contact that can be edited.
 *
 * The phone number is the reason this exists: a contact with no number cannot
 * be sent a reminder, and until now that could only be corrected on the phone
 * — which is the one place a person is *not* sitting when they notice.
 *
 * The whole record is here rather than just the missing field, because a form
 * that fixes one thing sends people back to the phone for the next one.
 */
export function ContactEditForm({
  contact,
  onDone,
  onCancel,
}: {
  contact: ContactView;
  onDone: () => void;
  onCancel: () => void;
}) {
  const api = useApi();
  const t = useTranslator();
  const queryClient = useQueryClient();

  const [form, setForm] = useState({
    name: contact.name,
    type: contact.type,
    companyName: contact.companyName ?? '',
    phone: contact.phone ?? '',
    email: contact.email ?? '',
    nationalId: contact.nationalId ?? '',
    taxNumber: contact.taxNumber ?? '',
    address: contact.address ?? '',
    notes: contact.notes ?? '',
    creditLimit: contact.creditLimit ?? '',
    creditLimitCurrency: contact.creditLimitCurrency ?? 'USD',
    isActive: contact.isActive,
  });

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]): void {
    setForm((current) => ({ ...current, [key]: value }));
  }

  const save = useMutation({
    mutationFn: () => {
      // Validated with the API's own schema, so the two never drift.
      const parsed = updateContactSchema.safeParse({
        name: form.name,
        type: form.type,
        companyName: form.companyName || null,
        phone: form.phone || null,
        email: form.email || null,
        nationalId: form.nationalId || null,
        taxNumber: form.taxNumber || null,
        address: form.address || null,
        notes: form.notes || null,
        // The currency travels only with an actual limit: on its own it is the
        // half-written pair the schema rejects.
        creditLimit: form.creditLimit || null,
        creditLimitCurrency: form.creditLimit ? form.creditLimitCurrency : null,
        isActive: form.isActive,
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
      return api.updateContact(contact.id, parsed.data);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['contact-statement', contact.id] });
      void queryClient.invalidateQueries({ queryKey: ['contacts'] });
      onDone();
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
    save.mutate();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('contact.name')} htmlFor="edit-name" required error={fieldErrors.name}>
          <input
            id="edit-name"
            required
            className={inputClassName}
            value={form.name}
            onChange={(event) => update('name', event.target.value)}
          />
        </Field>

        <Field label={t('contact.type')} htmlFor="edit-type" required>
          <select
            id="edit-type"
            className={inputClassName}
            value={form.type}
            onChange={(event) => update('type', event.target.value as ContactType)}
          >
            {Object.values(ContactType).map((value) => (
              <option key={value} value={value}>
                {t(`contactType.${value}`)}
              </option>
            ))}
          </select>
        </Field>

        {/* First of the optional fields: a contact with no number cannot be
            reminded, which is the whole reason someone opens this form. */}
        <Field label={t('contact.phone')} htmlFor="edit-phone" error={fieldErrors.phone}>
          <input
            id="edit-phone"
            dir="ltr"
            inputMode="tel"
            autoComplete="tel"
            className={inputClassName}
            value={form.phone}
            onChange={(event) => update('phone', event.target.value)}
          />
        </Field>

        <Field label={t('contact.email')} htmlFor="edit-email" error={fieldErrors.email}>
          <input
            id="edit-email"
            dir="ltr"
            type="email"
            className={inputClassName}
            value={form.email}
            onChange={(event) => update('email', event.target.value)}
          />
        </Field>

        <Field label={t('contact.companyName')} htmlFor="edit-company">
          <input
            id="edit-company"
            className={inputClassName}
            value={form.companyName}
            onChange={(event) => update('companyName', event.target.value)}
          />
        </Field>

        <Field label={t('contact.nationalId')} htmlFor="edit-national">
          <input
            id="edit-national"
            dir="ltr"
            className={inputClassName}
            value={form.nationalId}
            onChange={(event) => update('nationalId', event.target.value)}
          />
        </Field>

        <Field label={t('contact.taxNumber')} htmlFor="edit-tax">
          <input
            id="edit-tax"
            dir="ltr"
            className={inputClassName}
            value={form.taxNumber}
            onChange={(event) => update('taxNumber', event.target.value)}
          />
        </Field>

        <Field
          label={t('contact.creditLimit')}
          htmlFor="edit-credit"
          hint={t('contact.creditLimitHint')}
          error={fieldErrors.creditLimit ?? fieldErrors.creditLimitCurrency}
        >
          <div className="flex gap-2">
            <input
              id="edit-credit"
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

      <Field label={t('contact.address')} htmlFor="edit-address">
        <input
          id="edit-address"
          className={inputClassName}
          value={form.address}
          onChange={(event) => update('address', event.target.value)}
        />
      </Field>

      <Field label={t('common.notes')} htmlFor="edit-notes">
        <textarea
          id="edit-notes"
          rows={3}
          className={`${inputClassName} py-2`}
          value={form.notes}
          onChange={(event) => update('notes', event.target.value)}
        />
      </Field>

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          className="size-4 accent-teal-800"
          checked={form.isActive}
          onChange={(event) => update('isActive', event.target.checked)}
        />
        {t('contact.isActive')}
      </label>

      {formError ? (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
          {formError}
        </p>
      ) : null}

      <div className="flex gap-3">
        <Button type="submit" loading={save.isPending}>
          {t('common.save')}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
      </div>
    </form>
  );
}
