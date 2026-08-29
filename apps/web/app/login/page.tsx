'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { ApiClientError } from '@cheque-flow/api-client';
import { Button, Card, Field, inputClassName } from '@cheque-flow/ui';

import { useApi, useTranslator } from '@/components/providers';

export default function LoginPage() {
  const t = useTranslator();
  const api = useApi();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      await api.login(email, password);
      router.replace('/dashboard');
    } catch (caught) {
      // Errors arrive as translation keys, so the message stays Arabic.
      setError(
        caught instanceof ApiClientError ? t(caught.messageKey) : t('errors.INTERNAL_ERROR'),
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <h1 className="mb-1 text-2xl font-semibold text-slate-900">{t('auth.loginTitle')}</h1>
        <p className="mb-6 text-sm text-slate-600">{t('auth.loginSubtitle')}</p>

        <form onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-4">
          <Field label={t('auth.username')} htmlFor="email" hint={t('auth.usernameHint')} required>
            {/* `type="text"`, not `email`: the field accepts a user name too. */}
            <input
              id="email"
              name="email"
              type="text"
              inputMode="email"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
              dir="ltr"
              className={inputClassName}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </Field>

          <Field label={t('auth.password')} htmlFor="password" required>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              dir="ltr"
              className={inputClassName}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </Field>

          {error ? (
            <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
              {error}
            </p>
          ) : null}

          <Button type="submit" size="lg" loading={pending}>
            {pending ? t('auth.loggingIn') : t('auth.submit')}
          </Button>
        </form>
      </Card>
    </div>
  );
}
