'use client';

import { LOCALE_LABELS, LOCALES } from '@cheque-flow/localization';
import { Card } from '@cheque-flow/ui';

import { Permission } from '@cheque-flow/shared-types';

import { BackupPanel } from '@/components/backup-panel';
import { IconBranch, IconReports, IconSettings, IconShield } from '@/components/icons';
import { PageHeader } from '@/components/page-header';
import { SystemStatus } from '@/components/system-status';
import { useApp, useTranslator } from '@/components/providers';
import { useSession, RequirePermission } from '@/components/session';

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
          className="rounded-2xl border border-line/90 bg-surface p-2 shadow-[0_1px_2px_rgb(16_24_40/0.035)] lg:sticky lg:top-20"
        >
          {[
            { href: '#system', label: t('diagnostics.title'), Icon: IconShield },
            { href: '#backup', label: t('backup.title'), Icon: IconReports },
            { href: '#organization', label: t('settings.organizationTitle'), Icon: IconBranch },
            { href: '#appearance', label: t('common.language'), Icon: IconSettings },
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
          <div id="system" className="scroll-mt-24">
            <SystemStatus />
          </div>

          <div id="backup" className="scroll-mt-24">
            <BackupPanel />
          </div>

          <Card id="organization" className="scroll-mt-24 p-0">
            <div className="border-b border-line-soft px-5 py-4">
              <h2 className="text-[15px] font-bold text-ink">{t('settings.organizationTitle')}</h2>
            </div>
            <dl className="grid gap-4 p-5 sm:grid-cols-2">
              <div className="rounded-xl border border-line bg-subtle/50 p-4">
                <dt className="text-xs font-semibold text-ink-muted">
                  {t('settings.organizationId')}
                </dt>
                <dd dir="ltr" className="mt-2 truncate font-mono text-xs text-ink">
                  {user?.organizationId}
                </dd>
              </div>
              <div className="rounded-xl border border-line bg-subtle/50 p-4">
                <dt className="text-xs font-semibold text-ink-muted">{t('settings.branchId')}</dt>
                <dd dir="ltr" className="mt-2 truncate font-mono text-xs text-ink">
                  {user?.branchId ?? '—'}
                </dd>
              </div>
            </dl>
          </Card>

          <Card id="appearance" className="scroll-mt-24 p-0">
            <div className="border-b border-line-soft px-5 py-4">
              <h2 className="text-[15px] font-bold text-ink">{t('common.language')}</h2>
            </div>
            <div className="p-5">
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
        </div>
      </div>
    </div>
  );
}
