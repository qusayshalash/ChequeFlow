'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useMemo, useState, type ChangeEvent } from 'react';

import { ApiClientError } from '@cheque-flow/api-client';
import {
  ApiErrorCode,
  ContactType,
  MAX_SERIAL_CHEQUES,
  Permission,
  foldBankName,
} from '@cheque-flow/shared-types';
import { COMMON_CURRENCIES, createChequeBatchSchema } from '@cheque-flow/validation';
import { Badge, Button, EmptyState, Field, inputClassName } from '@cheque-flow/ui';

import { PageHeader } from '@/components/page-header';
import { Panel } from '@/components/panel';
import { useApi, useApp, useTranslator } from '@/components/providers';
import { RequirePermission } from '@/components/session';
import { IMPORT_TEMPLATE_CSV, parseChequeSheet, type ImportRow } from '@/lib/cheque-import';
import { formatDate, money } from '@/lib/format';
import { parseDelimited, readXlsx, type Sheet } from '@/lib/spreadsheet';

/**
 * Importing cheques from a spreadsheet.
 *
 * For the books kept in Excel before this system: the file is read in the
 * browser, every row is checked and shown before anything is written, and
 * the cheques go in through the same batch endpoint as typed ones, so the
 * duplicate check, the audit trail and the state machine all apply. They go
 * in as drafts, into the review queue, where they are received like any
 * other: an import is a pile of paper someone typed, not cheques in the safe.
 */
export default function ChequeImportPage() {
  return (
    <RequirePermission permission={Permission.CHEQUE_CREATE}>
      <ChequeImportBody />
    </RequirePermission>
  );
}

type Outcome = { state: 'created' } | { state: 'duplicate' } | { state: 'failed'; key: string };

/** A row with what it resolved to in this organization. */
interface ResolvedRow extends ImportRow {
  bankId: string | null;
  contactId: string | null;
  /** A contact the import will create, by the name the sheet gives. */
  newContact: string | null;
}

function ChequeImportBody() {
  const api = useApi();
  const t = useTranslator();
  const { locale } = useApp();
  const queryClient = useQueryClient();

  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [fileName, setFileName] = useState('');
  const [readError, setReadError] = useState<string | null>(null);
  const [pasted, setPasted] = useState('');
  const [currency, setCurrency] = useState('ILS');
  const [direction, setDirection] = useState<'INCOMING' | 'OUTGOING'>('INCOMING');
  const [createContacts, setCreateContacts] = useState(true);
  const [running, setRunning] = useState(false);
  const [outcomes, setOutcomes] = useState<Map<number, Outcome> | null>(null);

  const banks = useQuery({ queryKey: ['banks'], queryFn: () => api.listBanks() });
  // Every contact, to match names against: the list is paged at a hundred.
  const contacts = useQuery({
    queryKey: ['contacts', 'all-for-import'],
    queryFn: async () => {
      const all: Array<{ id: string; name: string }> = [];
      for (let page = 1; page < 100; page++) {
        const result = await api.listContacts({ page, pageSize: 100 });
        all.push(...result.data.map((contact) => ({ id: contact.id, name: contact.name })));
        if (result.data.length < 100) break;
      }
      return all;
    },
    enabled: sheet !== null,
  });

  const parsed = useMemo(
    () => (sheet ? parseChequeSheet(sheet, { currency, direction }) : null),
    [sheet, currency, direction],
  );

  const rows: ResolvedRow[] = useMemo(() => {
    if (!parsed) return [];
    const bankByName = new Map(
      (banks.data ?? []).map((bank) => [foldBankName(bank.name), bank.id]),
    );
    const contactByName = new Map(
      (contacts.data ?? []).map((contact) => [foldBankName(contact.name), contact.id]),
    );
    return parsed.rows.map((row) => {
      const errors = [...row.errors];
      let bankId: string | null = null;
      if (row.bankName !== '') {
        bankId = bankByName.get(foldBankName(row.bankName)) ?? null;
        if (!bankId) errors.push('import.error.bank');
      }
      let contactId: string | null = null;
      let newContact: string | null = null;
      if (row.contactName !== '') {
        contactId = contactByName.get(foldBankName(row.contactName)) ?? null;
        if (!contactId) {
          if (createContacts) newContact = row.contactName;
          else errors.push('import.error.contact');
        }
      }
      return { ...row, errors, bankId, contactId, newContact };
    });
  }, [parsed, banks.data, contacts.data, createContacts]);

  const ready = rows.filter((row) => row.errors.length === 0);
  const newContactNames = [
    ...new Map(
      ready.flatMap((row) =>
        row.newContact ? [[foldBankName(row.newContact), row.newContact]] : [],
      ),
    ).values(),
  ];

  function reset(next: Sheet | null, name: string) {
    setSheet(next);
    setFileName(name);
    setOutcomes(null);
    setReadError(null);
  }

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const next = /\.xlsx$/i.test(file.name)
        ? await readXlsx(await file.arrayBuffer())
        : parseDelimited(await file.text());
      reset(next, file.name);
    } catch {
      reset(null, '');
      setReadError('import.unreadable');
    }
  }

  async function runImport() {
    setRunning(true);
    const results = new Map<number, Outcome>();
    try {
      // Contacts first, each once, however many rows name it.
      const created = new Map<string, string>();
      for (const name of newContactNames) {
        const firstRow = ready.find(
          (row) => row.newContact && foldBankName(row.newContact) === foldBankName(name),
        );
        const contact = await api.createContact({
          type: firstRow?.direction === 'OUTGOING' ? ContactType.SUPPLIER : ContactType.CUSTOMER,
          name,
        } as Parameters<typeof api.createContact>[0]);
        created.set(foldBankName(name), contact.id);
      }

      // The batch endpoint takes rows that share a direction, currency, bank
      // and contact, so the sheet goes in as one batch per such group.
      const groups = new Map<string, ResolvedRow[]>();
      for (const row of ready) {
        const contactId =
          row.contactId ??
          (row.newContact ? (created.get(foldBankName(row.newContact)) ?? null) : null);
        const key = [row.direction, row.currency, row.bankId ?? '', contactId ?? ''].join('|');
        const group = groups.get(key) ?? [];
        group.push({ ...row, contactId });
        groups.set(key, group);
      }

      for (const group of groups.values()) {
        for (let start = 0; start < group.length; start += MAX_SERIAL_CHEQUES) {
          let chunk = group.slice(start, start + MAX_SERIAL_CHEQUES);
          // A duplicate refuses the whole batch and names its rows; those are
          // marked and the rest sent again. An import skips duplicates rather
          // than letting one old cheque block a whole file.
          while (chunk.length > 0) {
            const head = chunk[0]!;
            const input = createChequeBatchSchema.safeParse({
              direction: head.direction,
              currency: head.currency,
              bankId: head.bankId,
              originalSourceId: head.contactId,
              cheques: chunk.map((row) => ({
                chequeNumber: row.chequeNumber,
                amount: row.amount,
                dueDate: row.dueDate,
              })),
            });
            if (!input.success) {
              for (const row of chunk)
                results.set(row.line, { state: 'failed', key: 'errors.VALIDATION_ERROR' });
              break;
            }
            try {
              await api.createChequeBatch(input.data);
              for (const row of chunk) results.set(row.line, { state: 'created' });
              break;
            } catch (caught) {
              if (
                caught instanceof ApiClientError &&
                caught.code === ApiErrorCode.DUPLICATE_CHEQUE &&
                typeof caught.details.duplicateRows === 'string'
              ) {
                const duplicateIndexes = new Set(
                  caught.details.duplicateRows.split(',').map((index) => Number(index)),
                );
                chunk.forEach((row, index) => {
                  if (duplicateIndexes.has(index)) results.set(row.line, { state: 'duplicate' });
                });
                chunk = chunk.filter((_, index) => !duplicateIndexes.has(index));
                continue;
              }
              const key =
                caught instanceof ApiClientError ? caught.messageKey : 'errors.saveFailed';
              for (const row of chunk) results.set(row.line, { state: 'failed', key });
              break;
            }
          }
        }
      }
    } catch (caught) {
      // A contact that could not be created: nothing after it was attempted.
      const key = caught instanceof ApiClientError ? caught.messageKey : 'errors.saveFailed';
      for (const row of ready)
        if (!results.has(row.line)) results.set(row.line, { state: 'failed', key });
    } finally {
      setOutcomes(results);
      setRunning(false);
      void queryClient.invalidateQueries({ queryKey: ['cheques'] });
      void queryClient.invalidateQueries({ queryKey: ['contacts'] });
    }
  }

  const count = (state: Outcome['state']) =>
    outcomes ? [...outcomes.values()].filter((outcome) => outcome.state === state).length : 0;

  return (
    <div className="mx-auto flex max-w-[1360px] flex-col gap-5">
      <PageHeader title={t('import.title')} subtitle={t('import.subtitle')} />

      <Panel title={t('import.step1')}>
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex min-h-11 cursor-pointer items-center rounded-xl bg-primary px-4 text-sm font-semibold text-on-primary hover:opacity-90">
              {t('import.chooseFile')}
              <input
                type="file"
                accept=".xlsx,.csv,.txt"
                className="sr-only"
                onChange={(event) => void onFile(event)}
              />
            </label>
            <a
              href={`data:text/csv;charset=utf-8,${encodeURIComponent(IMPORT_TEMPLATE_CSV)}`}
              download="cheques-template.csv"
              className="text-sm font-semibold text-primary-ink hover:underline"
            >
              {t('import.template')}
            </a>
            {fileName ? <span className="text-sm text-ink-muted">{fileName}</span> : null}
          </div>
          <p className="text-xs text-ink-muted">{t('import.columnsHint')}</p>

          <details>
            <summary className="cursor-pointer text-sm font-semibold text-ink-soft">
              {t('import.pasteInstead')}
            </summary>
            <textarea
              className={`${inputClassName} mt-2 min-h-32 font-mono text-xs`}
              value={pasted}
              onChange={(event) => setPasted(event.target.value)}
              placeholder={t('import.pastePlaceholder')}
              dir="auto"
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="mt-2"
              disabled={pasted.trim() === ''}
              onClick={() => reset(parseDelimited(pasted), t('import.pasted'))}
            >
              {t('import.readPasted')}
            </Button>
          </details>

          {readError ? <p className="text-sm text-danger">{t(readError)}</p> : null}

          <div className="grid gap-3 sm:grid-cols-3">
            <Field
              label={t('import.defaultCurrency')}
              htmlFor="import-currency"
              hint={t('import.defaultHint')}
            >
              <select
                id="import-currency"
                className={inputClassName}
                value={currency}
                onChange={(event) => setCurrency(event.target.value)}
              >
                {COMMON_CURRENCIES.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label={t('import.defaultDirection')}
              htmlFor="import-direction"
              hint={t('import.defaultHint')}
            >
              <select
                id="import-direction"
                className={inputClassName}
                value={direction}
                onChange={(event) => setDirection(event.target.value as 'INCOMING' | 'OUTGOING')}
              >
                <option value="INCOMING">{t('direction.INCOMING')}</option>
                <option value="OUTGOING">{t('direction.OUTGOING')}</option>
              </select>
            </Field>
            <label className="flex items-center gap-2 self-center text-sm text-ink-soft">
              <input
                type="checkbox"
                className="size-5 accent-[var(--app-primary)]"
                checked={createContacts}
                onChange={(event) => setCreateContacts(event.target.checked)}
              />
              {t('import.createContacts')}
            </label>
          </div>
        </div>
      </Panel>

      {parsed && parsed.missing.length > 0 ? (
        <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
          {t('import.missingColumns')}:{' '}
          {parsed.missing.map((field) => t(`import.field.${field}`)).join('، ')}
        </p>
      ) : null}

      {parsed && parsed.missing.length === 0 ? (
        <Panel title={t('import.step2')} bodyClassName="">
          {rows.length === 0 ? (
            <EmptyState title={t('import.noRows')} />
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3 px-5 py-4">
                <p className="me-auto text-sm text-ink-soft">
                  {t('import.summary', {
                    ready: ready.length,
                    errors: rows.length - ready.length,
                  })}
                  {newContactNames.length > 0
                    ? ` · ${t('import.newContacts', { count: newContactNames.length })}`
                    : ''}
                </p>
                {outcomes ? (
                  <Link
                    href="/cheques/review"
                    className="text-sm font-semibold text-primary-ink hover:underline"
                  >
                    {t('import.openReview')}
                  </Link>
                ) : (
                  <Button
                    type="button"
                    loading={running}
                    disabled={ready.length === 0 || contacts.isPending || banks.isPending}
                    onClick={() => void runImport()}
                  >
                    {t('import.run', { count: ready.length })}
                  </Button>
                )}
              </div>

              {outcomes ? (
                <p
                  role="status"
                  className="mx-5 mb-4 rounded-xl bg-subtle px-4 py-3 text-sm text-ink"
                >
                  {t('import.done', {
                    created: count('created'),
                    duplicates: count('duplicate'),
                    failed: count('failed'),
                  })}
                </p>
              ) : null}

              <div className="overflow-x-auto">
                <table className="w-full min-w-[880px] border-collapse text-sm">
                  <thead>
                    <tr className="border-y border-line bg-subtle/60 text-xs text-ink-muted">
                      <th className="px-3 py-2 text-start font-semibold">{t('import.line')}</th>
                      <th className="px-3 py-2 text-start font-semibold">{t('cheque.number')}</th>
                      <th className="px-3 py-2 text-start font-semibold">
                        {t('import.field.direction')}
                      </th>
                      <th className="px-3 py-2 text-start font-semibold">
                        {t('import.field.contact')}
                      </th>
                      <th className="px-3 py-2 text-start font-semibold">
                        {t('import.field.bank')}
                      </th>
                      <th className="px-3 py-2 text-start font-semibold">{t('cheque.dueDate')}</th>
                      <th className="px-3 py-2 text-end font-semibold">{t('common.amount')}</th>
                      <th className="px-3 py-2 text-start font-semibold">{t('import.status')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const outcome = outcomes?.get(row.line);
                      return (
                        <tr
                          key={row.line}
                          className={`border-b border-line/60 ${row.errors.length > 0 ? 'bg-danger-soft/40' : ''}`}
                        >
                          <td className="px-3 py-2 tabular-nums text-ink-muted">{row.line}</td>
                          <td className="px-3 py-2 tabular-nums" dir="ltr">
                            {row.chequeNumber || '—'}
                          </td>
                          <td className="px-3 py-2">
                            {row.direction ? t(`direction.${row.direction}`) : '—'}
                          </td>
                          <td className="px-3 py-2">
                            {row.contactName || '—'}
                            {row.newContact ? (
                              <Badge tone="info" className="ms-2">
                                {t('import.new')}
                              </Badge>
                            ) : null}
                          </td>
                          <td className="px-3 py-2">{row.bankName || '—'}</td>
                          <td className="px-3 py-2 tabular-nums">
                            {row.dueDate ? formatDate(locale, row.dueDate) : '—'}
                          </td>
                          <td className="px-3 py-2 text-end font-semibold tabular-nums">
                            {row.amount && row.currency
                              ? money(locale, row.amount, row.currency)
                              : '—'}
                          </td>
                          <td className="px-3 py-2 text-xs">
                            {outcome ? (
                              outcome.state === 'created' ? (
                                <Badge tone="success">{t('import.created')}</Badge>
                              ) : outcome.state === 'duplicate' ? (
                                <Badge tone="warning">{t('import.duplicate')}</Badge>
                              ) : (
                                <span className="text-danger">{t(outcome.key)}</span>
                              )
                            ) : row.errors.length > 0 ? (
                              <span className="text-danger">
                                {row.errors.map((key) => t(key)).join('، ')}
                              </span>
                            ) : (
                              <span className="text-ink-muted">{t('import.ready')}</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Panel>
      ) : null}
    </div>
  );
}
