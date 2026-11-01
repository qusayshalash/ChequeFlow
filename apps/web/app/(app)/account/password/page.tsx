'use client';

import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';

import { ApiClientError } from '@cheque-flow/api-client';
import { changePasswordSchema } from '@cheque-flow/validation';
import { Button, Field, SuccessBanner, inputClassName } from '@cheque-flow/ui';

import { PageHeader } from '@/components/page-header';
import { Panel } from '@/components/panel';
import { useApi, useTranslator } from '@/components/providers';

const EMPTY = { currentPassword: '', newPassword: '', confirmPassword: '' };

/**
 * Changing your own password.
 *
 * There was nowhere to do this. Deliberately outside Settings, which is behind
 * `settings.manage`: a cashier has the same right to change their password as
 * the owner does, and a page they cannot open is not a place they can do it.
 * Every signed-in user reaches it from the account menu.
 *
 * The confirmation field is checked here and never sent. It exists because a
 * mistyped new password is otherwise discovered at the next sign-in, by which
 * time the session that could have fixed it has ended.
 */
export default function ChangePasswordPage() {
  const api = useApi();
  const t = useTranslator();

  const [form, setForm] = useState(EMPTY);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const change = useMutation({
    mutationFn: () => {
      const parsed = changePasswordSchema.safeParse({
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
      });

      const errors: Record<string, string> = {};
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          errors[issue.path.join('.') || '_'] ??= t(issue.message);
        }
      }
      if (form.confirmPassword !== form.newPassword) {
        errors.confirmPassword = t('account.passwordsDiffer');
      }
      if (!parsed.success || Object.keys(errors).length > 0) {
        setFieldErrors(errors);
        return Promise.reject(new Error('validation'));
      }

      setFieldErrors({});
      return api.changePassword(parsed.data);
    },
    onSuccess: () => {
      // Cleared at once: a password left sitting in a field is one more place
      // it can be read from.
      setForm(EMPTY);
      setFormError(null);
      setDone(true);
    },
    onError: (error: unknown) => {
      if (error instanceof Error && error.message === 'validation') return;
      if (error instanceof ApiClientError) {
        if (error.fieldErrors.length > 0) {
          setFieldErrors(Object.fromEntries(error.fieldErrors.map((f) => [f.path, t(f.message)])));
          return;
        }
        setFormError(t(error.messageKey));
        return;
      }
      setFormError(t('errors.saveFailed'));
    },
  });

  const field = (key: keyof typeof EMPTY) => ({
    value: form[key],
    onChange: (event: { target: { value: string } }) => {
      setDone(false);
      setForm((current) => ({ ...current, [key]: event.target.value }));
    },
  });

  function submit(event: FormEvent): void {
    event.preventDefault();
    setFormError(null);
    change.mutate();
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5">
      <PageHeader title={t('account.passwordTitle')} subtitle={t('account.otherSessionsNote')} />

      <Panel>
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          {done ? <SuccessBanner message={t('account.passwordChanged')} /> : null}

          <Field
            label={t('account.currentPassword')}
            htmlFor="currentPassword"
            required
            error={fieldErrors.currentPassword}
          >
            <input
              id="currentPassword"
              type="password"
              dir="ltr"
              // Lets a password manager offer the saved one here.
              autoComplete="current-password"
              className={inputClassName}
              {...field('currentPassword')}
            />
          </Field>

          <Field
            label={t('account.newPassword')}
            htmlFor="newPassword"
            required
            hint={t('auth.passwordHint')}
            error={fieldErrors.newPassword}
          >
            <input
              id="newPassword"
              type="password"
              dir="ltr"
              // And lets it generate and save a new one.
              autoComplete="new-password"
              className={inputClassName}
              {...field('newPassword')}
            />
          </Field>

          <Field
            label={t('account.confirmPassword')}
            htmlFor="confirmPassword"
            required
            error={fieldErrors.confirmPassword}
          >
            <input
              id="confirmPassword"
              type="password"
              dir="ltr"
              autoComplete="new-password"
              className={inputClassName}
              {...field('confirmPassword')}
            />
          </Field>

          {formError ? (
            <p role="alert" className="text-sm text-danger">
              {formError}
            </p>
          ) : null}

          <Button type="submit" loading={change.isPending} className="self-start">
            {t('account.passwordTitle')}
          </Button>
        </form>
      </Panel>
    </div>
  );
}
