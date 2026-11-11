'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { ApiClientError } from '@cheque-flow/api-client';
import { whatsAppLink } from '@cheque-flow/shared-types';
import { Badge, Button, inputClassName } from '@cheque-flow/ui';

import { Panel } from '@/components/panel';
import { useApi, useApp, useTranslator } from '@/components/providers';
import { formatDateTime } from '@/lib/format';

const DAYS = [1, 7, 14, 30] as const;

/**
 * Share links for this contact's statement.
 *
 * A new link is shown once, here, and never again: the server keeps only a
 * hash of it, so the list below can say a link exists and how often it was
 * opened, but cannot show it. Revoking stops it at once.
 */
export function StatementLinksPanel({
  contactId,
  contactName,
  phone,
}: {
  contactId: string;
  contactName: string;
  phone: string | null;
}) {
  const api = useApi();
  const t = useTranslator();
  const { locale } = useApp();
  const queryClient = useQueryClient();
  const [days, setDays] = useState<(typeof DAYS)[number]>(7);
  const [fresh, setFresh] = useState<{ url: string; expiresAt: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const links = useQuery({
    queryKey: ['statement-links', contactId],
    queryFn: () => api.listStatementLinks(contactId),
  });

  const refresh = () =>
    void queryClient.invalidateQueries({ queryKey: ['statement-links', contactId] });

  const create = useMutation({
    mutationFn: () => api.createStatementLink(contactId, days),
    onSuccess: (link) => {
      setError(null);
      setCopied(false);
      setFresh({ url: `${window.location.origin}/s/${link.token}`, expiresAt: link.expiresAt });
      refresh();
    },
    onError: (caught: unknown) =>
      setError(caught instanceof ApiClientError ? t(caught.messageKey) : t('errors.saveFailed')),
  });

  const revoke = useMutation({
    mutationFn: (linkId: string) => api.revokeStatementLink(contactId, linkId),
    onSuccess: refresh,
  });

  const now = Date.now();
  const stateOf = (link: { revokedAt: string | null; expiresAt: string }) =>
    link.revokedAt ? 'revoked' : Date.parse(link.expiresAt) <= now ? 'expired' : 'active';

  const whatsapp = fresh
    ? whatsAppLink(
        phone,
        [
          t('reminders.whatsappGreeting', { name: contactName }),
          t('statementLinks.message', { date: formatDateTime(locale, fresh.expiresAt) }),
          fresh.url,
        ].join('\n'),
      )
    : null;

  return (
    <Panel title={t('statementLinks.title')}>
      <p className="-mt-1 mb-3 text-sm text-ink-muted">{t('statementLinks.hint')}</p>

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-ink-soft">{t('statementLinks.validFor')}</span>
          <select
            className={`${inputClassName} min-w-36`}
            value={days}
            onChange={(event) => setDays(Number(event.target.value) as (typeof DAYS)[number])}
          >
            {DAYS.map((value) => (
              <option key={value} value={value}>
                {t(`statementLinks.days.${value}`)}
              </option>
            ))}
          </select>
        </label>
        <Button type="button" loading={create.isPending} onClick={() => create.mutate()}>
          {t('statementLinks.create')}
        </Button>
      </div>
      {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}

      {fresh ? (
        <div className="mt-4 rounded-2xl border border-primary/40 bg-primary-soft/40 p-4">
          <p className="mb-2 text-sm font-semibold text-ink">{t('statementLinks.shownOnce')}</p>
          <input
            readOnly
            dir="ltr"
            value={fresh.url}
            onFocus={(event) => event.currentTarget.select()}
            className={`${inputClassName} font-mono text-xs`}
            aria-label={t('statementLinks.title')}
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                void navigator.clipboard?.writeText(fresh.url).then(() => setCopied(true));
              }}
            >
              {copied ? t('statementLinks.copied') : t('statementLinks.copy')}
            </Button>
            {whatsapp ? (
              <a
                href={whatsapp}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-9 items-center rounded-lg bg-primary px-3 text-xs font-semibold text-on-primary"
              >
                {t('statementLinks.sendWhatsapp')}
              </a>
            ) : null}
          </div>
        </div>
      ) : null}

      {(links.data ?? []).length > 0 ? (
        <ul className="mt-4 divide-y divide-line">
          {(links.data ?? []).map((link) => {
            const state = stateOf(link);
            return (
              <li key={link.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                <Badge
                  tone={state === 'active' ? 'success' : state === 'revoked' ? 'danger' : 'neutral'}
                >
                  {t(`statementLinks.state.${state}`)}
                </Badge>
                <span className="text-ink-soft tabular-nums">
                  {t('statementLinks.until', { date: formatDateTime(locale, link.expiresAt) })}
                </span>
                <span className="text-ink-muted tabular-nums">
                  {t('statementLinks.views', { count: link.viewCount })}
                </span>
                {state === 'active' ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="ms-auto text-danger"
                    loading={revoke.isPending && revoke.variables === link.id}
                    onClick={() => revoke.mutate(link.id)}
                  >
                    {t('statementLinks.revoke')}
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </Panel>
  );
}
