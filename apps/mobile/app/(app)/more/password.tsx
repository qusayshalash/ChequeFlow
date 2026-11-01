import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';

import { ApiClientError } from '@cheque-flow/api-client';
import { changePasswordSchema } from '@cheque-flow/validation';

import { FormScreen } from '@/components/form-screen';
import { useApi, useTranslator } from '@/components/providers';
import { Banner, ErrorView, Field, Section } from '@/components/ui';
import { fieldErrorsFrom, validateForm, type FieldErrors } from '@/lib/form';
import * as haptics from '@/lib/haptics';

/**
 * Changing your own password from the phone.
 *
 * Open to every signed-in user, from the More tab — not only to whoever may
 * manage the organization. The server ends every other session the account
 * has and hands this one a fresh pair of tokens, which the client stores, so
 * the person stays signed in here and nowhere else.
 */
export default function ChangePasswordScreen() {
  const api = useApi();
  const t = useTranslator();

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const change = useMutation({
    mutationFn: async () => {
      const validated = validateForm(changePasswordSchema, {
        currentPassword: current,
        newPassword: next,
      });
      const found: FieldErrors = validated.ok ? {} : { ...validated.errors };
      // Checked here and never sent: a mistyped new password is otherwise
      // discovered at the next sign-in, after this session has ended.
      if (confirm !== next) found.confirmPassword = 'account.passwordsDiffer';

      if (!validated.ok || Object.keys(found).length > 0) {
        setErrors(found);
        throw new Error('validation');
      }
      setErrors({});
      return api.changePassword(validated.data);
    },
    onSuccess: () => {
      haptics.recorded();
      // Cleared at once: a password left in a field is one more place it can
      // be read from.
      setCurrent('');
      setNext('');
      setConfirm('');
      setDone(true);
    },
    onError: (error: unknown) => {
      if (error instanceof Error && error.message === 'validation') return;
      haptics.refused();
      if (error instanceof ApiClientError) {
        const serverErrors = fieldErrorsFrom(error);
        if (Object.keys(serverErrors).length > 0) {
          setErrors(serverErrors);
          return;
        }
        setFormError(t(error.messageKey));
        return;
      }
      setFormError(t('errors.saveFailed'));
    },
  });

  const error = (field: string): string | undefined =>
    errors[field] ? t(errors[field]) : undefined;

  return (
    <FormScreen
      submitLabel={t('account.passwordTitle')}
      onSubmit={() => {
        setFormError(null);
        setDone(false);
        change.mutate();
      }}
      submitting={change.isPending}
    >
      {done ? <Banner tone="info" text={t('account.passwordChanged')} /> : null}

      <Section title={t('account.passwordTitle')}>
        <Field
          label={t('account.currentPassword')}
          value={current}
          onChangeText={setCurrent}
          secret="current"
          ltr
          required
          error={error('currentPassword')}
        />
        <Field
          label={t('account.newPassword')}
          value={next}
          onChangeText={setNext}
          secret="new"
          ltr
          required
          hint={t('auth.passwordHint')}
          error={error('newPassword')}
        />
        <Field
          label={t('account.confirmPassword')}
          value={confirm}
          onChangeText={setConfirm}
          secret="new"
          ltr
          required
          error={error('confirmPassword')}
        />
      </Section>

      <Banner tone="warning" text={t('account.otherSessionsNote')} />

      {formError ? <ErrorView label={formError} /> : null}
    </FormScreen>
  );
}
