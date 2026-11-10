'use client';

import Link from 'next/link';

import { LOCALE_LABELS, LOCALES } from '@cheque-flow/localization';
import { Card } from '@cheque-flow/ui';

import { Permission } from '@cheque-flow/shared-types';

import { BackupPanel } from '@/components/backup-panel';
import { IconBranch, IconReports, IconSettings, IconShield } from '@/components/icons';
import { PageHeader } from '@/components/page-header';
import { SystemStatus } from '@/components/system-status';
import { ThemeChoiceControl } from '@/components/theme-choice';
import { useApp, useTranslator } from '@/components/providers';
import { useSession, RequirePermission } from '@/components/session';
import { SETTINGS_NAV } from '@/components/app-shell';

/**
 * Settings overview.
 *
 * Writing organization settings is a phase-2 endpoint; the locale switcher is
 * wired to the same catalogue the whole app uses, so adding English later is
 * a configuration change rather than a code change.
 */
export default function SettingsPagePage() {
  return (
    <RequirePermission permission={Permission.SETTINGS_MANAGE}>
      <SettingsPageBody />
    </RequirePermission>
  );
}

function SettingsPageBody() {
  const t = useTranslator();
  const { locale } = useApp();
  const { data: user } = useSession();

  return (
    <div className="mx-auto flex max-w-[1360px] flex-col gap-5">
      <PageHeader title={t('nav.settings')} subtitle={t('settings.subtitle')} />

      <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)] lg:items-start">
        <nav
          aria-label={t('nav.settings')}
          className="hidden rounded-2xl border border-line/90 bg-surface p-2 shadow-[0_1px_2px_rgb(16_24_40/0.035)] lg:sticky lg:top-20 lg:block"
        >
          {[
            { href: '#manage', label: t('settings.manageTitle'), Icon: IconBranch },
            { href: '#appearance', label: t('settings.appearanceTitle'), Icon: IconSettings },
            { href: '#backup', label: t('backup.title'), Icon: IconReports },
            { href: '#system', label: t('diagnostics.title'), Icon: IconShield },
          ].map(({ href, label, Icon }) => (
            <a
              key={href}
              href={href}
              className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold text-ink-soft hover:bg-subtle hover:text-ink"
            >
              <Icon width="18" height="18" className="text-ink-muted" />
              {label}
            </a>
          ))}
        </nav>

        <div className="flex min-w-0 flex-col gap-5">
          {/* Every management area this person may open, in one place: in the
              sidebar they are seven links under a heading, and on a phone they
              are behind the menu. Same list, same permissions, as the sidebar. */}
          <section id="manage" className="scroll-mt-24">
            <h2 className="mb-3 text-[15px] font-bold text-ink">{t('settings.manageTitle')}</h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {SETTINGS_NAV.filter(
                (item) =>
                  item.href !== '/settings' &&
                  (!item.permission || (user?.permissions.includes(item.permission) ?? false)),
              ).map(({ href, labelKey, Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className="flex items-start gap-3 rounded-2xl border border-line/90 bg-surface p-4 transition hover:border-line-strong hover:bg-subtle/40"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary-ink">
                    <Icon width="20" height="20" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-ink">{t(labelKey)}</span>
                    <span className="mt-0.5 block text-xs leading-5 text-ink-muted">
                      {t(`settingsHub.${href.slice(1)}`)}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          </section>

          <Card id="appearance" className="scroll-mt-24 p-0">
            <div className="border-b border-line-soft px-5 py-4">
              <h2 className="text-[15px] font-bold text-ink">{t('settings.appearanceTitle')}</h2>
            </div>
            <div className="flex flex-col gap-4 p-5">
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-line p-4">
                <div>
                  <p className="font-semibold text-ink">{t('theme.label')}</p>
                  <p className="mt-1 text-sm text-ink-muted">{t('theme.hint')}</p>
                </div>
                <ThemeChoiceControl />
              </div>

              <div className="flex items-center justify-between gap-4 rounded-xl border border-line p-4">
                <div>
                  <p className="font-semibold text-ink">{LOCALE_LABELS[locale]}</p>
                  <p className="mt-1 text-sm text-ink-muted">{t('settings.languageHint')}</p>
                </div>
                <span className="rounded-lg border border-line bg-subtle px-3 py-2 text-xs font-semibold text-ink-muted">
                  {LOCALES.map((value) => LOCALE_LABELS[value]).join(' · ')}
                </span>
              </div>
            </div>
          </Card>

          <div id="backup" className="scroll-mt-24">
            <BackupPanel />
          </div>

          <div id="system" className="scroll-mt-24">
            <SystemStatus />
          </div>
        </div>
      </div>
    </div>
  );
}
