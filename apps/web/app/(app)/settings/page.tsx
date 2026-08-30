'use client';

import { LOCALE_LABELS, LOCALES } from '@cheque-flow/localization';
import { Card } from '@cheque-flow/ui';

import { Permission } from '@cheque-flow/shared-types';

import { BackupPanel } from '@/components/backup-panel';
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
    <div className="mx-auto flex max-w-[1180px] flex-col gap-5">
      <PageHeader title={t('nav.settings')} />

      <SystemStatus />

      <BackupPanel />

      <Card className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-slate-900">{t('common.appName')}</h2>
        <dl className="grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-sm text-slate-600">organizationId</dt>
            <dd dir="ltr" className="text-sm">
              {user?.organizationId}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-slate-600">branchId</dt>
            <dd dir="ltr" className="text-sm">
              {user?.branchId ?? '—'}
            </dd>
          </div>
        </dl>
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-slate-900">{LOCALE_LABELS[locale]}</h2>
        <p className="text-sm text-slate-600">
          {LOCALES.map((value) => LOCALE_LABELS[value]).join(' · ')}
        </p>
        <p className="text-xs text-slate-500">NEXT_PUBLIC_DEFAULT_LOCALE</p>
      </Card>
    </div>
  );
}
