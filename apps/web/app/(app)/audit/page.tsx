'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { AUDIT_ACTIONS, Permission, auditActionKey } from '@cheque-flow/shared-types';
import { Badge, EmptyState, ErrorState, LoadingState } from '@cheque-flow/ui';

import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { Panel } from '@/components/panel';
import { useApi, useApp, useTranslator } from '@/components/providers';
import { formatDateTime } from '@/lib/format';
import { RequirePermission } from '@/components/session';

/**
 * The audit trail, finally readable.
 *
 * `cheque_events` and `audit_logs` refuse UPDATE and DELETE at the database
 * level, not by convention — the system's central promise is that the record
 * of what happened cannot be edited afterwards. The endpoint and its
 * permission have existed since the beginning, and no client could call
 * either, so the promise was kept and shown to nobody.
 *
 * Read-only by construction, which is the point: there is nothing to act on
 * here, only something to look at when somebody asks who changed a cheque.
 */
export default function AuditPagePage() {
  return (
    <RequirePermission permission={Permission.AUDIT_VIEW}>
      <AuditPageBody />
    </RequirePermission>
  );
}

const PAGE_SIZE = 50;

function AuditPageBody() {
  const api = useApi();
  const t = useTranslator();
  const { locale } = useApp();

  const [page, setPage] = useState(1);
  // One of the recorded actions, chosen by name. This was a free-text box
  // asking for the internal code, with `CHEQUE_DEPOSITED` as its example — an
  // action that is not even recorded under that name.
  const [action, setAction] = useState('');

  // Names for what the trail stores as codes. A code with no name yet is shown
  // as it is rather than as a translation key.
  const named = (key: string, raw: string) => {
    const text = t(key);
    return text === key ? raw : text;
  };

  const query = useQuery({
    queryKey: ['audit-logs', page, action],
    queryFn: () => api.auditLogs({ page, pageSize: PAGE_SIZE, ...(action ? { action } : {}) }),
  });

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-5">
      <PageHeader title={t('nav.auditLogs')} subtitle={t('pageDescription.auditLogs')} />

      <Panel bodyClassName="">
        <div className="border-b border-line-soft p-4">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-semibold text-ink-soft">{t('audit.action')}</span>
            <select
              value={action}
              onChange={(event) => {
                setAction(event.target.value);
                // A filter that keeps the old page number shows an empty
                // table and reads as "no results".
                setPage(1);
              }}
              className="h-11 max-w-sm rounded-xl border border-line bg-surface px-3 text-sm text-ink"
            >
              <option value="">{t('audit.allActions')}</option>
              {AUDIT_ACTIONS.map((name) => (
                <option key={name} value={name}>
                  {named(auditActionKey(name), name)}
                </option>
              ))}
            </select>
          </label>
        </div>

        {query.isPending ? <LoadingState label={t('common.loading')} /> : null}
        {query.isError ? (
          <div className="p-4">
            <ErrorState
              title={t('errors.loadFailed')}
              onRetry={() => void query.refetch()}
              retryLabel={t('common.retry')}
            />
          </div>
        ) : null}

        {query.data && query.data.data.length === 0 ? (
          <EmptyState title={t('audit.empty')} description={t('audit.emptyHint')} />
        ) : null}

        {query.data && query.data.data.length > 0 ? (
          <>
            {/* Cards on a phone. The 880px table showed the date and the user
                and cut the action in half; the record and its origin were off
                screen behind a sideways scroll. */}
            <ul className="flex flex-col gap-2.5 p-3 md:hidden">
              {query.data.data.map((row) => (
                <li key={row.id} className="rounded-2xl border border-line/90 bg-surface p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <Badge tone="info">{named(auditActionKey(row.action), row.action)}</Badge>
                    <span className="shrink-0 text-xs text-ink-muted tabular-nums">
                      {formatDateTime(locale, row.createdAt)}
                    </span>
                  </div>
                  <p className="mt-2.5 text-sm">
                    <span className="font-semibold text-ink">
                      {row.userName ?? t('common.unknown')}
                    </span>
                    <span className="text-ink-muted">
                      {' · '}
                      {named(`auditEntity.${row.entityType}`, row.entityType)}
                    </span>
                  </p>
                  {row.ipAddress || row.deviceInfo ? (
                    <p className="mt-1 truncate text-xs text-ink-muted" dir="ltr">
                      {[row.ipAddress, row.deviceInfo].filter(Boolean).join(' · ')}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>

            <div className="hidden overflow-auto md:block">
              <table className="w-full min-w-[880px] border-separate border-spacing-0 text-sm">
                <thead className="bg-subtle/95 text-ink-muted">
                  <tr>
                    {(
                      [
                        'audit.when',
                        'audit.who',
                        'audit.action',
                        'audit.entity',
                        'audit.origin',
                      ] as const
                    ).map((key) => (
                      <th
                        key={key}
                        scope="col"
                        className="border-b border-line px-4 py-3 text-start text-xs font-bold"
                      >
                        {t(key)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {query.data.data.map((row) => (
                    <tr key={row.id} className="align-top">
                      <td className="border-b border-line-soft px-4 py-3 whitespace-nowrap text-ink-soft tabular-nums">
                        {formatDateTime(locale, row.createdAt)}
                      </td>
                      <td className="border-b border-line-soft px-4 py-3">
                        {/* A deleted user leaves their trail behind — the row
                            keeps the action, and the name is simply gone. */}
                        <span className="font-semibold text-ink">
                          {row.userName ?? t('common.unknown')}
                        </span>
                        {row.userEmail ? (
                          <span className="block text-xs text-ink-muted" dir="ltr">
                            {row.userEmail}
                          </span>
                        ) : null}
                      </td>
                      <td className="border-b border-line-soft px-4 py-3">
                        <Badge tone="info">{named(auditActionKey(row.action), row.action)}</Badge>
                      </td>
                      <td className="border-b border-line-soft px-4 py-3 text-ink-soft">
                        <span className="font-semibold">
                          {named(`auditEntity.${row.entityType}`, row.entityType)}
                        </span>
                        {row.entityId ? (
                          <span className="block font-mono text-xs text-ink-muted" dir="ltr">
                            {row.entityId}
                          </span>
                        ) : null}
                      </td>
                      <td
                        className="border-b border-line-soft px-4 py-3 text-xs text-ink-muted"
                        dir="ltr"
                      >
                        {/* Where it came from. This is what distinguishes a
                            change made in the app from one made by a script. */}
                        {row.ipAddress ?? '—'}
                        {row.deviceInfo ? (
                          <span className="block max-w-56 truncate" title={row.deviceInfo}>
                            {row.deviceInfo}
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="p-4">
              <Pagination meta={query.data.meta} onPageChange={setPage} />
            </div>
          </>
        ) : null}
      </Panel>
    </div>
  );
}
