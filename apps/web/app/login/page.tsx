'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { ApiClientError } from '@cheque-flow/api-client';
import { Button, Field, inputClassName } from '@cheque-flow/ui';

import { IconCalendar, IconLogo, IconMessage, IconShield } from '@/components/icons';
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
        caught instanceof ApiClientError
          ? t(caught.messageKey, signInMessageValues(caught))
          : t('errors.INTERNAL_ERROR'),
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="grid min-h-screen bg-[var(--app-bg)] lg:grid-cols-[minmax(420px,0.9fr)_minmax(520px,1.1fr)]">
      <aside className="relative hidden overflow-hidden bg-hero p-10 text-hero-ink lg:flex lg:flex-col lg:justify-between xl:p-14">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,color-mix(in_srgb,var(--app-hero-glow)_13%,transparent),transparent_34%),radial-gradient(circle_at_20%_90%,color-mix(in_srgb,var(--app-hero-glow)_8%,transparent),transparent_30%)]" />
        <div className="relative flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-xl bg-hero-accent text-hero shadow-[0_12px_28px_-14px_color-mix(in_srgb,var(--app-hero-glow)_80%,transparent)]">
            <IconLogo width="25" height="25" strokeWidth="1.9" />
          </span>
          <div>
            <p className="text-lg font-bold">{t('common.appName')}</p>
            <p className="text-[10px] tracking-[0.18em] text-hero-ink/40">CHEQUE OPERATIONS</p>
          </div>
        </div>

        <div className="relative max-w-xl py-10">
          <p className="mb-4 text-xs font-semibold tracking-[0.18em] text-hero-accent">
            ENTERPRISE WORKSPACE
          </p>
          <h1 className="text-4xl leading-[1.35] font-bold tracking-[-0.035em] xl:text-5xl">
            {t('auth.productTitle')}
          </h1>
          <p className="mt-5 max-w-lg text-base leading-8 text-hero-ink/55">
            {t('auth.productSubtitle')}
          </p>

          {/* A picture of the product rather than a list about it: the
              projected-balance curve the dashboard opens on, with its low
              point marked. Decorative, so it carries no figures that could be
              read as someone's books, and is hidden from screen readers. */}
          <div
            aria-hidden="true"
            className="mt-10 rounded-3xl border border-hero-ink/[0.08] bg-hero-ink/[0.04] p-5 backdrop-blur"
          >
            <div className="mb-3 flex items-center gap-2">
              <span className="h-2 w-16 rounded-full bg-hero-ink/20" />
              <span className="ms-auto h-2 w-10 rounded-full bg-hero-accent/50" />
            </div>
            <svg viewBox="0 0 400 120" className="h-28 w-full" preserveAspectRatio="none">
              <defs>
                <linearGradient id="loginCurve" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--app-hero-accent)" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="var(--app-hero-accent)" stopOpacity="0" />
                </linearGradient>
              </defs>
              <line
                x1="0"
                x2="400"
                y1="84"
                y2="84"
                stroke="var(--app-hero-ink)"
                strokeOpacity="0.18"
                strokeDasharray="4 6"
              />
              <path
                d="M400,30 L360,26 L320,40 L280,34 L240,58 L200,96 L160,88 L120,54 L80,46 L40,30 L0,22 L0,120 L400,120 Z"
                fill="url(#loginCurve)"
              />
              <path
                d="M400,30 L360,26 L320,40 L280,34 L240,58 L200,96 L160,88 L120,54 L80,46 L40,30 L0,22"
                fill="none"
                stroke="var(--app-hero-accent)"
                strokeWidth="3"
                strokeLinejoin="round"
              />
              <circle cx="200" cy="96" r="5" fill="var(--app-danger-solid)" />
            </svg>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {[
                { Icon: IconCalendar, labelKey: 'auth.featureForecast' },
                { Icon: IconMessage, labelKey: 'auth.featureReminders' },
                { Icon: IconShield, labelKey: 'auth.featureRisk' },
              ].map(({ Icon: FeatureIcon, labelKey }) => (
                <span
                  key={labelKey}
                  className="flex flex-col items-start gap-2 rounded-2xl bg-hero-ink/[0.05] p-3 text-xs text-hero-ink/75"
                >
                  <span className="flex size-8 items-center justify-center rounded-xl bg-hero-accent/10 text-hero-accent">
                    <FeatureIcon width="16" height="16" />
                  </span>
                  {t(labelKey)}
                </span>
              ))}
            </div>
          </div>
        </div>

        <p className="relative text-xs text-hero-ink/30">© 2026 {t('common.appName')}</p>
      </aside>

      <section className="relative flex min-h-screen items-center justify-center overflow-hidden px-5 py-10 sm:px-10 lg:px-16">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,color-mix(in_srgb,var(--app-primary)_14%,transparent),transparent_45%)]"
        />
        <div className="relative w-full max-w-[460px]">
          <div className="mb-10 flex items-center gap-3 lg:hidden">
            <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-on-primary">
              <IconLogo width="22" height="22" />
            </span>
            <span className="text-lg font-bold text-ink">{t('common.appName')}</span>
          </div>

          <div className="rounded-3xl border border-line/90 bg-surface p-6 shadow-[0_24px_60px_-42px_rgb(16_24_40/0.5)] sm:p-8">
            <span className="mb-4 block h-1 w-9 rounded-full bg-primary" />
            <h2 className="text-3xl font-bold tracking-[-0.03em] text-ink">
              {t('auth.welcomeBack')}
            </h2>
            <p className="mt-2 mb-8 text-sm leading-6 text-ink-muted">{t('auth.loginSubtitle')}</p>

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
                {/* LTR like the input inside it. In the page's RTL the button's
                    `end-3` resolved to the left edge while the input's `pe-16`
                    reserved space on the right, so the password was typed
                    underneath the show button. */}
                <div className="relative" dir="ltr">
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
                    className="absolute inset-y-0 end-3 my-auto h-8 rounded-lg px-2 text-xs font-semibold text-ink-muted hover:bg-sunken hover:text-ink"
                    aria-label={showPassword ? t('common.hide') : t('common.show')}
                    onClick={() => setShowPassword((visible) => !visible)}
                  >
                    {showPassword ? t('common.hide') : t('common.show')}
                  </button>
                </div>
              </Field>

              {error ? (
                <p role="alert" className="rounded-lg bg-danger-soft p-3 text-sm text-danger">
                  {error}
                </p>
              ) : null}

              <Button type="submit" size="lg" loading={pending} className="mt-2 w-full">
                {pending ? t('auth.loggingIn') : t('auth.submit')}
              </Button>
            </form>
          </div>
          <p className="mt-5 text-center text-xs text-ink-muted">{t('auth.featureSecurity')}</p>
        </div>
      </section>
    </main>
  );
}

/**
 * Values a sign-in error's message needs. Only the lock has any: it says how
 * many minutes are left, because "try again later" with no time makes the
 * owner of the account try again at once and find it still locked.
 */
function signInMessageValues(error: ApiClientError): Record<string, string> | undefined {
  const minutes = error.details.minutes;
  return error.code === 'ACCOUNT_LOCKED' && typeof minutes === 'number'
    ? { minutes: String(minutes) }
    : undefined;
}
