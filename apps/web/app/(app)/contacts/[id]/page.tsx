'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { use, useState } from 'react';

import { ApiClientError } from '@cheque-flow/api-client';
import {
  OUTSTANDING_CHEQUE_STATUSES,
  Permission,
  contactRiskLevel,
  toWhatsAppNumber,
  type ContactStatementView,
} from '@cheque-flow/shared-types';
import { Badge, Button, ErrorState, LoadingState, SuccessBanner } from '@cheque-flow/ui';

import { ChequeTable } from '@/components/cheque-table';
import { ReliabilitySummary } from '@/components/contact-reliability';
import { WhatsAppReminder } from '@/components/whatsapp-reminder';
import { useToday } from '@/lib/today';
import { ContactEditForm } from '@/components/contact-edit-form';
import { Drawer } from '@/components/drawer';
import { FactGrid } from '@/components/fact-grid';
import { PageHeader } from '@/components/page-header';
import { Panel } from '@/components/panel';
import { useApi, useApp, useTranslator } from '@/components/providers';
import { usePermission } from '@/components/session';
import { money } from '@/lib/format';

export default function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const api = useApi();
  const t = useTranslator();
  const { locale } = useApp();
  const router = useRouter();
  const queryClient = useQueryClient();
  const canManage = usePermission(Permission.CONTACT_MANAGE);

  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mergeTarget, setMergeTarget] = useState('');
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const statement = useQuery<ContactStatementView>({
    queryKey: ['contact-statement', id],
    queryFn: () => api.getContactStatement(id),
  });
  // Every cheque, not the latest fifty, for the reminder: the oldest overdue
  // ones are exactly the ones a capped list would leave out. Only fetched
  // when there is a number to send it to.
  const hasPhone = Boolean(statement.data?.contact.phone);
  const fullStatement = useQuery<ContactStatementView>({
    queryKey: ['contact-statement', id, 'full'],
    queryFn: () => api.getContactStatement(id, { full: true }),
    enabled: hasPhone,
  });
  const today = useToday();

  const others = useQuery({
    queryKey: ['contacts', 'merge-targets'],
    enabled: canManage,
    queryFn: () => api.listContacts({ pageSize: 100, isActive: true }),
  });

  const remove = useMutation({
    mutationFn: () => api.deleteContact(id),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['contacts'] });
      // The API deactivates instead of deleting when cheques reference the
      // contact; say which happened rather than claiming a deletion.
      if (result.deleted) router.replace('/contacts');
      else {
        setConfirmDelete(false);
        setNotice(t('contact.deactivated'));
        void statement.refetch();
      }
    },
    onError: (caught: unknown) =>
      setError(caught instanceof ApiClientError ? t(caught.messageKey) : t('errors.saveFailed')),
  });

  const merge = useMutation({
    mutationFn: (targetId: string) => api.mergeContacts({ sourceId: id, targetId }),
    onSuccess: (target) => {
      void queryClient.invalidateQueries({ queryKey: ['contacts'] });
      void queryClient.invalidateQueries({ queryKey: ['cheques'] });
      router.replace(`/contacts/${target.id}`);
    },
    onError: (caught: unknown) =>
      setError(caught instanceof ApiClientError ? t(caught.messageKey) : t('errors.saveFailed')),
  });

  if (statement.isPending) return <LoadingState label={t('common.loading')} />;
  if (statement.isError || !statement.data) {
    return (
      <ErrorState
        title={t('errors.NOT_FOUND')}
        onRetry={() => void statement.refetch()}
        retryLabel={t('common.retry')}
      />
    );
  }

  const { contact, currencies, creditLimit, cheques, totalCheques, reliability } = statement.data;

  // What a reminder names: cheques this contact gave us that are due within
  // the week or already late, and those that came back and are still open.
  const weekAhead = new Date(Date.parse(`${today}T00:00:00Z`) + 7 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const remindable = (fullStatement.data?.cheques ?? []).filter(
    (cheque) =>
      cheque.direction === 'INCOMING' &&
      cheque.originalSourceName === contact.name &&
      ((OUTSTANDING_CHEQUE_STATUSES.includes(cheque.status) && cheque.dueDate <= weekAhead) ||
        cheque.status === 'BOUNCED' ||
        cheque.status === 'RETURNED'),
  );

  return (
    <div className="mx-auto flex max-w-[1360px] flex-col gap-5">
      <PageHeader
        title={contact.name}
        subtitle={t(`contactType.${contact.type}`)}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/contacts/${id}/statement`}
              className="inline-flex min-h-11 items-center rounded-xl border border-line bg-surface px-4 text-sm font-semibold text-ink hover:border-line-strong"
            >
              {t('contact.printStatement')}
            </Link>
            {canManage ? (
              <Button
                variant="secondary"
                className="border-danger-line text-danger hover:border-danger-line hover:bg-danger-soft"
                onClick={() => setConfirmDelete(true)}
              >
                {t('common.delete')}
              </Button>
            ) : null}
          </div>
        }
      />

      {/* The contact at a glance: how to reach them, and how they have paid. */}
      <section className="flex flex-wrap items-center gap-4 rounded-2xl border border-line/90 bg-gradient-to-bl from-surface-raised to-surface p-4 sm:p-5">
        <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-subtle text-xl font-bold text-ink-soft">
          {contact.name.trim().charAt(0)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-ink-muted">{t('contact.riskLevel')}</span>
            <span
              className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${RISK_TONE[contactRiskLevel(reliability)]}`}
            >
              {t(`dashboard.risk.${contactRiskLevel(reliability)}`)}
            </span>
          </div>
          <p className="mt-1 text-sm text-ink-muted">
            {[t(`contactType.${contact.type}`), contact.companyName, contact.address]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        {contact.phone ? (
          <div className="flex flex-wrap gap-2">
            <a
              href={`tel:${contact.phone.replace(/[^\d+]/g, '')}`}
              className="inline-flex h-10 items-center rounded-xl border border-line bg-surface px-3 text-sm font-semibold text-ink hover:border-line-strong"
              dir="ltr"
            >
              {contact.phone}
            </a>
            {toWhatsAppNumber(contact.phone) ? (
              <a
                href={`https://wa.me/${toWhatsAppNumber(contact.phone)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 items-center rounded-xl bg-primary-soft px-3 text-sm font-semibold text-primary-ink hover:opacity-90"
              >
                {t('contact.whatsappChat')}
              </a>
            ) : null}
          </div>
        ) : null}
      </section>

      {notice ? <SuccessBanner message={notice} /> : null}
      {error ? <ErrorState title={error} /> : null}

      {confirmDelete ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-contact-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-scrim/40 p-4 backdrop-blur-[2px]"
        >
          <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-2xl">
            <div className="flex size-11 items-center justify-center rounded-xl bg-danger-soft text-danger">
              !
            </div>
            <h2 id="delete-contact-title" className="mt-4 text-xl font-bold text-ink">
              {t('common.confirmDelete')}
            </h2>
            <p className="mt-2 text-sm leading-6 text-ink-muted">{contact.name}</p>
            <div className="mt-6 flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
                {t('common.cancel')}
              </Button>
              <Button
                variant="danger"
                loading={remove.isPending}
                onClick={() => {
                  setError(null);
                  remove.mutate();
                }}
              >
                {t('common.delete')}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
      {!contact.isActive ? (
        <p className="rounded-xl border border-line bg-subtle px-4 py-3 text-sm text-ink-soft">
          {t('userStatus.DISABLED')}
        </p>
      ) : null}

      <Panel
        title={t('contact.title')}
        action={
          canManage ? (
            <Button variant="secondary" onClick={() => setEditing(true)}>
              {t('common.edit')}
            </Button>
          ) : undefined
        }
      >
        <FactGrid
          facts={[
            // A missing number is the most consequential blank here: it is
            // what stops a reminder being sent, so it is said plainly rather
            // than shown as another dash.
            {
              label: t('contact.phone'),
              value: contact.phone ?? t('contact.noPhone'),
              ltr: contact.phone !== null,
            },
            { label: t('contact.email'), value: contact.email ?? '—', ltr: true },
            { label: t('contact.companyName'), value: contact.companyName ?? '—' },
            { label: t('contact.nationalId'), value: contact.nationalId ?? '—', ltr: true },
            { label: t('contact.taxNumber'), value: contact.taxNumber ?? '—', ltr: true },
            { label: t('contact.address'), value: contact.address ?? '—' },
          ]}
        />
      </Panel>

      <Drawer
        open={editing}
        onClose={() => setEditing(false)}
        eyebrow={contact.name}
        title={t('contact.editTitle')}
        width="2xl"
      >
        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          <ContactEditForm
            contact={contact}
            onCancel={() => setEditing(false)}
            onDone={() => {
              setEditing(false);
              setNotice(t('contact.updateSuccess'));
              void statement.refetch();
            }}
          />
        </div>
      </Drawer>

      {/* Above the statement on purpose: whether this customer is already
          holding more than agreed is the question you ask before taking
          another cheque, not after reading the whole history. */}
      <Panel title={t('contact.creditLimit')}>
        {creditLimit === null ? (
          <p className="text-sm text-ink-muted">{t('contact.creditNotSet')}</p>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-line p-3">
                <p className="text-xs text-ink-muted">{t('contact.creditLimit')}</p>
                <p className="mt-1 text-sm font-bold text-ink tabular-nums">
                  {money(locale, creditLimit.limit, creditLimit.currency)}
                </p>
              </div>
              <div className="rounded-xl border border-line p-3">
                <p className="text-xs text-ink-muted">{t('contact.creditUsed')}</p>
                <p className="mt-1 text-sm font-bold text-warning tabular-nums">
                  {money(locale, creditLimit.used, creditLimit.currency)}
                </p>
              </div>
              <div
                className={`rounded-xl border p-3 ${
                  creditLimit.exceeded ? 'border-danger-line bg-danger-soft' : 'border-line'
                }`}
              >
                <p className="text-xs text-ink-muted">
                  {creditLimit.exceeded ? t('contact.creditExceeded') : t('contact.creditHeadroom')}
                </p>
                <p
                  className={`mt-1 text-sm font-bold tabular-nums ${
                    creditLimit.exceeded ? 'text-danger' : 'text-primary-ink'
                  }`}
                >
                  {money(locale, creditLimit.headroom, creditLimit.currency)}
                </p>
              </div>
            </div>

            {/* Named rather than folded in: converting them at today's rate
                would make the headroom move on days when nothing happened. */}
            {creditLimit.otherCurrencies.length > 0 ? (
              <p className="text-xs text-ink-muted">
                {t('contact.creditOther')}:{' '}
                {creditLimit.otherCurrencies
                  .map((entry) => money(locale, entry.total, entry.currency))
                  .join(' · ')}
              </p>
            ) : null}
          </div>
        )}
      </Panel>

      {/* The position, per currency. A single figure across currencies would
          be meaningless, so each gets its own balance and its own breakdown. */}
      {currencies.length > 0 ? (
        <Panel title={t('contact.statement')}>
          <div className="flex flex-col gap-5">
            {currencies.map((entry) => {
              // The net is the number the statement exists to answer, so it
              // leads rather than having to be worked out from four buckets.
              const owed = !entry.net.startsWith('-');
              const settled = Number(entry.net) === 0;

              return (
                <div key={entry.currency}>
                  <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 rounded-xl bg-subtle px-4 py-3">
                    <div>
                      <p className="text-sm font-bold text-ink">{entry.currency}</p>
                      <p className="text-xs text-ink-muted">
                        {settled
                          ? t('contact.settled')
                          : owed
                            ? t('contact.owesUs')
                            : t('contact.weOwe')}
                      </p>
                    </div>
                    <p
                      dir="ltr"
                      className={`text-xl font-bold tabular-nums ${
                        settled ? 'text-ink-muted' : owed ? 'text-success' : 'text-danger'
                      }`}
                    >
                      {money(locale, entry.net, entry.currency)}
                    </p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                    {(
                      [
                        ['contact.pending', entry.pending, 'text-warning'],
                        ['contact.collected', entry.collected, 'text-primary-ink'],
                        ['contact.bounced', entry.bounced, 'text-danger'],
                        ['contact.returned', entry.returned, 'text-ink-soft'],
                        ['contact.unconfirmed', entry.unconfirmed, 'text-ink-muted'],
                      ] as const
                    ).map(([labelKey, bucket, tone]) => (
                      <div key={labelKey} className="rounded-xl border border-line p-3">
                        <p className="text-xs text-ink-muted">
                          {t(labelKey)} ({bucket.count})
                        </p>
                        <p className={`mt-1 text-sm font-bold tabular-nums ${tone}`}>
                          {money(locale, bucket.total, entry.currency)}
                        </p>
                      </div>
                    ))}
                  </div>

                  {/* Said only when there is something to explain: otherwise
                      cheques sitting in the list but not in the balance look
                      like a missing number. */}
                  {entry.unconfirmed.count > 0 ? (
                    <p className="mt-2 text-xs text-ink-muted">{t('contact.unconfirmedHint')}</p>
                  ) : null}
                </div>
              );
            })}
          </div>
        </Panel>
      ) : null}

      <Panel title={t('reliability.title')}>
        <ReliabilitySummary reliability={reliability} />
      </Panel>

      {remindable.length > 0 ? (
        <Panel title={t('reminders.whatsapp')}>
          <p className="-mt-1 mb-3 text-sm text-ink-muted">{t('reminders.contactHint')}</p>
          <WhatsAppReminder cheques={remindable} phone={contact.phone} contactName={contact.name} />
        </Panel>
      ) : null}

      {canManage && (others.data?.data.length ?? 0) > 1 ? (
        <Panel title={t('contact.merge')}>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-ink-soft">{t('contact.mergeInto')}</span>
              <select
                className="min-h-11 rounded-xl border border-line bg-surface px-3 text-sm"
                value={mergeTarget}
                onChange={(event) => setMergeTarget(event.target.value)}
              >
                <option value="">{t('common.unknown')}</option>
                {(others.data?.data ?? [])
                  .filter((entry) => entry.id !== id)
                  .map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.name}
                    </option>
                  ))}
              </select>
            </label>
            <Button
              disabled={!mergeTarget}
              loading={merge.isPending}
              onClick={() => {
                setError(null);
                merge.mutate(mergeTarget);
              }}
            >
              {t('common.confirm')}
            </Button>
          </div>
          <p className="mt-3 text-sm text-ink-muted">
            {t('contact.mergeConfirm', {
              source: contact.name,
              target:
                (others.data?.data ?? []).find((entry) => entry.id === mergeTarget)?.name ?? '…',
            })}
          </p>
        </Panel>
      ) : null}

      <Panel
        title={t('cheque.listTitle')}
        bodyClassName=""
        action={
          totalCheques > cheques.length ? (
            <Badge>{t('contact.statementLimited', { count: cheques.length })}</Badge>
          ) : undefined
        }
      >
        <ChequeTable cheques={cheques} />
      </Panel>
    </div>
  );
}

const RISK_TONE = {
  high: 'bg-danger-soft text-danger',
  medium: 'bg-warning-soft text-warning',
  low: 'bg-success-soft text-success',
} as const;
