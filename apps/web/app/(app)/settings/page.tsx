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
          className="rounded-2xl border border-slate-200/90 bg-white p-2 shadow-[0_1px_2px_rgb(16_24_40/0.035)] lg:sticky lg:top-20"
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
              className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-950"
            >
              <Icon width="18" height="18" className="text-slate-400" />
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
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="text-[15px] font-bold text-slate-900">
                {t('settings.organizationTitle')}
              </h2>
            </div>
            <dl className="grid gap-4 p-5 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                <dt className="text-xs font-semibold text-slate-500">
                  {t('settings.organizationId')}
                </dt>
                <dd dir="ltr" className="mt-2 truncate font-mono text-xs text-slate-800">
                  {user?.organizationId}
                </dd>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                <dt className="text-xs font-semibold text-slate-500">{t('settings.branchId')}</dt>
                <dd dir="ltr" className="mt-2 truncate font-mono text-xs text-slate-800">
                  {user?.branchId ?? '—'}
                </dd>
              </div>
            </dl>
          </Card>

          <Card id="appearance" className="scroll-mt-24 p-0">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="text-[15px] font-bold text-slate-900">{t('common.language')}</h2>
            </div>
            <div className="p-5">
              <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 p-4">
                <div>
                  <p className="font-semibold text-slate-900">{LOCALE_LABELS[locale]}</p>
                  <p className="mt-1 text-sm text-slate-500">{t('settings.languageHint')}</p>
                </div>
                <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500">
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
