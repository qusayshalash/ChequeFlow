'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { ApiClientError } from '@cheque-flow/api-client';
import { Button, Field, inputClassName } from '@cheque-flow/ui';

import { IconCheque, IconClock, IconLogo, IconShield } from '@/components/icons';
import { useApi, useTranslator } from '@/components/providers';

export default function LoginPage() {
  const t = useTranslator();
  const api = useApi();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
    <main className="grid min-h-screen bg-[var(--app-bg)] lg:grid-cols-[minmax(420px,0.9fr)_minmax(520px,1.1fr)]">
      <aside className="relative hidden overflow-hidden bg-[#111c1b] p-10 text-white lg:flex lg:flex-col lg:justify-between xl:p-14">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,rgb(52_211_153/0.13),transparent_34%),radial-gradient(circle_at_20%_90%,rgb(45_212_191/0.08),transparent_30%)]" />
        <div className="relative flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-xl bg-emerald-400 text-emerald-950 shadow-[0_12px_28px_-14px_rgb(52_211_153/0.8)]">
            <IconLogo width="25" height="25" strokeWidth="1.9" />
          </span>
          <div>
            <p className="text-lg font-bold">{t('common.appName')}</p>
            <p className="text-[10px] tracking-[0.18em] text-white/40">CHEQUE OPERATIONS</p>
          </div>
        </div>

        <div className="relative max-w-xl py-12">
          <p className="mb-4 text-xs font-semibold tracking-[0.18em] text-emerald-300">
            ENTERPRISE WORKSPACE
          </p>
          <h1 className="text-4xl leading-[1.35] font-bold tracking-[-0.035em] xl:text-5xl">
            {t('auth.productTitle')}
          </h1>
          <p className="mt-5 max-w-lg text-base leading-8 text-white/55">
            {t('auth.productSubtitle')}
          </p>

          <ul className="mt-10 grid gap-3">
            {[
              { Icon: IconCheque, labelKey: 'auth.featureTracking' },
              { Icon: IconClock, labelKey: 'auth.featureOperations' },
              { Icon: IconShield, labelKey: 'auth.featureSecurity' },
            ].map(({ Icon: FeatureIcon, labelKey }) => (
              <li
                key={labelKey}
                className="flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.04] p-3.5 text-sm text-white/75"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-300">
                  <FeatureIcon width="18" height="18" />
                </span>
                {t(labelKey)}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-white/30">© 2026 {t('common.appName')}</p>
      </aside>

      <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-10 lg:px-16">
        <div className="w-full max-w-[460px]">
          <div className="mb-10 flex items-center gap-3 lg:hidden">
            <span className="flex size-10 items-center justify-center rounded-xl bg-teal-700 text-white">
              <IconLogo width="22" height="22" />
            </span>
            <span className="text-lg font-bold text-slate-900">{t('common.appName')}</span>
          </div>

          <div className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-[0_24px_60px_-42px_rgb(16_24_40/0.5)] sm:p-8">
            <span className="mb-4 block h-1 w-9 rounded-full bg-teal-600" />
            <h2 className="text-3xl font-bold tracking-[-0.03em] text-slate-950">
              {t('auth.loginTitle')}
            </h2>
            <p className="mt-2 mb-8 text-sm leading-6 text-slate-500">{t('auth.loginSubtitle')}</p>

            <form onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-4">
              <Field
                label={t('auth.username')}
                htmlFor="email"
                hint={t('auth.usernameHint')}
                required
              >
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
                  className={`${inputClassName} h-12`}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </Field>

              <Field label={t('auth.password')} htmlFor="password" required>
                <div className="relative">
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    dir="ltr"
                    className={`${inputClassName} h-12 pe-16`}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 end-3 my-auto h-8 rounded-lg px-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                    aria-label={showPassword ? t('common.hide') : t('common.show')}
                    onClick={() => setShowPassword((visible) => !visible)}
                  >
                    {showPassword ? t('common.hide') : t('common.show')}
                  </button>
                </div>
              </Field>

              {error ? (
                <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
                  {error}
                </p>
              ) : null}

              <Button type="submit" size="lg" loading={pending} className="mt-2 w-full">
                {pending ? t('auth.loggingIn') : t('auth.submit')}
              </Button>
            </form>
          </div>
          <p className="mt-5 text-center text-xs text-slate-400">{t('auth.featureSecurity')}</p>
        </div>
      </section>
    </main>
  );
}
