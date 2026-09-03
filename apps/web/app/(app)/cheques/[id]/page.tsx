'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { use, useState } from 'react';

import {
  ChequeStatus,
  Permission,
  utcToday,
  type ChequeDetailView,
  type ChequeLinkView,
} from '@cheque-flow/shared-types';
import { ErrorState, LoadingState, StatusBadge } from '@cheque-flow/ui';

import { ChequeActionsPanel } from '@/components/cheque-actions';
import { WhatsAppReminder } from '@/components/whatsapp-reminder';
import { ChequeHero } from '@/components/cheque-hero';
import { ChequeImagesPanel } from '@/components/cheque-images';
import { Tabs } from '@/components/tabs';
import { ChequeTimeline } from '@/components/cheque-timeline';
import { CustodyStrip } from '@/components/custody-strip';
import { FactGrid, type Fact } from '@/components/fact-grid';
import { IconChevronEnd } from '@/components/icons';
import { OcrReviewPanel } from '@/components/ocr-review';
import { Panel } from '@/components/panel';
import { useApi, useApp, useTranslator } from '@/components/providers';
import { usePermission } from '@/components/session';
import { formatDate, formatDateTime, money } from '@/lib/format';

export default function ChequeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const api = useApi();
  const t = useTranslator();
  const { locale } = useApp();
  /**
   * Which face of the record is showing.
   *
   * The page used to stack all four, which put the ledger — the reason most
   * people open a cheque — at the bottom of a long scroll.
   */
  const [tab, setTab] = useState('overview');
  const canViewImages = usePermission(Permission.CHEQUE_VIEW_IMAGE);

  const today = utcToday();

  const cheque = useQuery<ChequeDetailView>({
    queryKey: ['cheque', id],
    queryFn: () => api.getCheque(id),
  });

  const contacts = useQuery({
    queryKey: ['contacts', 'all'],
    queryFn: () => api.listContacts({ pageSize: 100 }),
  });
  const locations = useQuery({ queryKey: ['locations'], queryFn: () => api.listLocations() });

  if (cheque.isPending) return <LoadingState label={t('common.loading')} />;
  if (cheque.isError || !cheque.data) {
    return (
      <ErrorState
        title={t('errors.NOT_FOUND')}
        onRetry={() => void cheque.refetch()}
        retryLabel={t('common.retry')}
      />
    );
  }

  const data = cheque.data;
  const unknown = t('common.unknown');
  // The party the cheque came from, looked up for their phone number.
  const source = (contacts.data?.data ?? []).find(
    (contact) => contact.id === data.originalSourceId,
  );
  // Nothing more is owed on these, so nudging the customer would be noise.
  const settled: ReadonlySet<string> = new Set([
    ChequeStatus.CLEARED,
    ChequeStatus.CANCELLED,
    ChequeStatus.TRANSFERRED,
  ]);
  const unreviewed =
    data.status === ChequeStatus.DRAFT || data.status === ChequeStatus.PENDING_REVIEW;

  // Six groups, each small enough to read at a glance, rather than the three
  // long lists this page used to stack: "which bank" and "where is it kept"
  // are different questions and were answered eleven rows apart.
  const info: Fact[] = [
    { label: t('cheque.number'), value: data.chequeNumber, ltr: true },
    { label: t('common.amount'), value: money(locale, data.amount, data.currency), ltr: true },
    { label: t('cheque.currency'), value: data.currency, ltr: true },
    { label: t('cheque.direction'), value: t(`direction.${data.direction}`) },
    { label: t('cheque.referenceNumber'), value: data.referenceNumber ?? unknown, ltr: true },
    { label: t('cheque.purpose'), value: data.purpose ?? unknown },
  ];

  const parties: Fact[] = [
    { label: t('cheque.drawerName'), value: data.drawerName ?? unknown },
    { label: t('cheque.originalPayee'), value: data.originalPayeeName ?? unknown },
    { label: t('cheque.originalSource'), value: data.originalSourceName ?? unknown },
    { label: t('cheque.currentRecipient'), value: data.currentRecipientName ?? unknown },
  ];

  const bank: Fact[] = [
    { label: t('cheque.bank'), value: data.bankName ?? unknown },
    { label: t('cheque.bankBranch'), value: data.bankBranchRaw ?? unknown },
    // Always the masked form; the full number never leaves the server.
    { label: t('cheque.accountNumber'), value: data.accountNumberMasked ?? unknown, ltr: true },
  ];

  const dates: Fact[] = [
    { label: t('cheque.dueDate'), value: formatDate(locale, data.dueDate), ltr: true },
    {
      label: t('cheque.issueDate'),
      value: data.issueDate ? formatDate(locale, data.issueDate) : unknown,
      ltr: true,
    },
    {
      label: t('cheque.receivedDate'),
      value: data.receivedDate ? formatDate(locale, data.receivedDate) : unknown,
      ltr: true,
    },
    { label: t('common.createdAt'), value: formatDateTime(locale, data.createdAt), ltr: true },
    { label: t('common.updatedAt'), value: formatDateTime(locale, data.updatedAt), ltr: true },
    {
      label: t('cheque.reviewedBy'),
      value: data.reviewedAt ? formatDateTime(locale, data.reviewedAt) : t('cheque.notYet'),
      ltr: true,
    },
  ];

  const place: Fact[] = [
    { label: t('cheque.currentLocation'), value: data.currentLocationName ?? unknown },
    { label: t('cheque.branch'), value: data.branchName ?? unknown },
    { label: t('cheque.status'), value: t(`status.${data.status}`) },
  ];

  return (
    <div className="mx-auto max-w-[1360px]">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 pb-5">
        <nav className="flex items-center gap-1.5 text-sm text-slate-500" aria-label="breadcrumb">
          <Link href="/cheques" className="hover:text-teal-700">
            {t('cheque.listTitle')}
          </Link>
          <IconChevronEnd width="14" height="14" className="text-slate-300" />
          <span className="font-mono text-slate-700" dir="ltr">
            {data.chequeNumber}
          </span>
        </nav>

        <Link
          href={`/cheques/${data.id}/timeline`}
          className="inline-flex items-center gap-1 text-sm font-semibold text-teal-700 hover:text-teal-900"
        >
          {t('cheque.openTimeline')}
          <IconChevronEnd width="16" height="16" />
        </Link>
      </div>

      {unreviewed ? (
        <p className="mb-4 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          {t('cheque.awaitingReview')}
        </p>
      ) : null}

      <ChequeHero cheque={data} today={today} />

      <Tabs
        tabs={[
          { key: 'overview', label: t('cheque.tabOverview') },
          { key: 'timeline', label: t('cheque.tabTimeline') },
          { key: 'attachments', label: t('cheque.tabAttachments'), count: data.images.length },
        ]}
        active={tab}
        onChange={setTab}
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(330px,0.85fr)] xl:items-start">
        {/* Main column: what this cheque is and where it has been. */}
        <div className="flex min-w-0 flex-col gap-5">
          {/* Panels are hidden rather than unmounted: switching tabs must not
              refetch the timeline or drop a half-written action. */}
          <div hidden={tab !== 'overview'} className="flex flex-col gap-5">
            {/* Only when it happened, and then near the top: a bank's refusal is
              the most consequential thing on the page. */}
            {data.bounceReason ? (
              <section className="rounded-2xl border border-red-100 bg-red-50 p-5">
                <h2 className="text-base font-bold text-red-700">{t('cheque.bounceGroup')}</h2>
                <p className="mt-2 text-sm text-red-700">{data.bounceReason}</p>
                {data.bounceFee ? (
                  <p className="mt-1 text-sm font-semibold text-red-700 tabular-nums">
                    {t('cheque.bounceFee')}: {money(locale, data.bounceFee, data.currency)}
                  </p>
                ) : null}

                {/* Offered right here, because this is the moment the question
                  comes up: the cheque came back, so what was written instead? */}
                {data.replacedBy.length === 0 ? (
                  <Link
                    href={`/cheques/new?replaces=${data.id}`}
                    className="mt-3 inline-flex h-10 items-center rounded-xl border border-red-300 bg-white px-4 text-sm font-semibold text-red-700 hover:bg-red-100"
                  >
                    {t('cheque.recordReplacement')}
                  </Link>
                ) : null}
              </section>
            ) : null}

            {/* The chain in both directions. Without it, three replacements for
              one debt read as three unrelated cheques. */}
            {data.replaces || data.replacedBy.length > 0 ? (
              <Panel title={t('cheque.replacementChain')}>
                <div className="flex flex-col gap-3">
                  {data.replaces ? (
                    <ChainRow label={t('cheque.replaces')} link={data.replaces} />
                  ) : null}
                  {data.replacedBy.map((entry) => (
                    <ChainRow key={entry.id} label={t('cheque.replacedBy')} link={entry} />
                  ))}
                </div>
              </Panel>
            ) : null}

            {/* A grid of small cards rather than a stack of long lists.
                Three across on a wide screen, two on a laptop, one on a
                phone — so a fact is found by looking, not by scrolling. */}
            <div className="grid gap-5 md:grid-cols-2 2xl:grid-cols-3">
              <CustodyStrip cheque={data} />

              <Panel title={t('cheque.parties')}>
                <FactGrid facts={parties} columns={1} />
              </Panel>

              <Panel title={t('cheque.infoGroup')}>
                <FactGrid facts={info} columns={1} />
              </Panel>

              <Panel title={t('cheque.bankGroup')}>
                <FactGrid facts={bank} columns={1} />
              </Panel>

              <Panel title={t('cheque.dates')}>
                <FactGrid facts={dates} columns={1} />
              </Panel>

              <Panel title={t('cheque.locationGroup')}>
                <FactGrid facts={place} columns={1} />
              </Panel>
            </div>

            {data.notes ? (
              <Panel title={t('cheque.notesGroup')}>
                <p className="text-sm leading-relaxed whitespace-pre-line text-slate-700">
                  {data.notes}
                </p>
              </Panel>
            ) : null}
          </div>

          <div hidden={tab !== 'timeline'}>
            <ChequeTimeline chequeId={data.id} />
          </div>

          <div hidden={tab !== 'attachments'}>
            <ChequeImagesPanel chequeId={data.id} canViewImages={canViewImages} />
          </div>
        </div>

        {/* Aside: the things you do, kept beside the facts rather than below
            them, so acting never means scrolling past the whole record. */}
        <div className="flex min-w-0 flex-col gap-5 xl:sticky xl:top-20">
          {unreviewed ? <OcrReviewPanel cheque={data} /> : null}

          <ChequeActionsPanel
            cheque={data}
            contacts={(contacts.data?.data ?? []).map((contact) => ({
              id: contact.id,
              name: contact.name,
            }))}
            locations={(locations.data ?? []).map((location) => ({
              id: location.id,
              name: location.name,
            }))}
          />

          {/* Only for money still owed to us: nudging a customer about a
              cheque that already cleared is how a system loses trust. */}
          {data.direction === 'INCOMING' && !settled.has(data.status) ? (
            <Panel title={t('reminders.whatsapp')}>
              <WhatsAppReminder
                cheque={data}
                phone={source?.phone ?? null}
                contactName={data.originalSourceName}
              />
            </Panel>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** One end of a replacement chain: what it was, and a way to open it. */
function ChainRow({ label, link }: { label: string; link: ChequeLinkView }) {
  const t = useTranslator();
  const { locale } = useApp();

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-slate-200 p-3">
      <span className="text-xs font-semibold text-slate-500">{label}</span>
      <Link
        href={`/cheques/${link.id}`}
        dir="ltr"
        className="font-semibold text-slate-900 tabular-nums hover:text-teal-700"
      >
        {link.chequeNumber}
      </Link>
      <span className="text-sm text-slate-600 tabular-nums">
        {money(locale, link.amount, link.currency)}
      </span>
      <StatusBadge status={link.status} label={t(`status.${link.status}`)} />
    </div>
  );
}
