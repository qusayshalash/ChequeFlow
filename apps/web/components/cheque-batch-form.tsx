'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useMemo, useState, type FormEvent } from 'react';

import { ApiClientError } from '@cheque-flow/api-client';
import {
  ChequeDirection,
  MAX_SERIAL_CHEQUES,
  suggestNextRow,
  type SerialChequeRow,
} from '@cheque-flow/shared-types';
import { createChequeBatchSchema } from '@cheque-flow/validation';
import { Button, ErrorState, Field, inputClassName } from '@cheque-flow/ui';

import { Panel } from '@/components/panel';
import { useApi, useApp, useTranslator } from '@/components/providers';
import { formatMoney } from '@/lib/format';

const CURRENCIES = ['USD', 'ILS', 'JOD', 'EUR'];

/** A grid row plus the local id React needs to keep inputs stable while rows move. */
interface Row extends SerialChequeRow {
  id: string;
}

let rowCounter = 0;
function makeRow(row: SerialChequeRow): Row {
  rowCounter += 1;
  return { ...row, id: `row-${rowCounter}` };
}

/** Sums the rows without going through a float, so 0.1 + 0.2 stays 0.30. */
function sumAmounts(rows: readonly Row[]): string {
  const cents = rows.reduce((total, row) => {
    const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(row.amount.trim());
    if (!match) return total;
    const fraction = (match[2] ?? '').padEnd(2, '0');
    return total + Number(match[1]) * 100 + Number(fraction);
  }, 0);

  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
}

/**
 * Records a whole cheque book at once.
 *
 * A customer settling on credit hands over a strip of cheques: consecutive
 * numbers, one due date a month apart, the same bank and drawer throughout.
 * The shared details are written once at the top; each row then needs only the
 * amount, because the number and the due date are proposed from the row above.
 */
export function ChequeBatchForm() {
  const api = useApi();
  const t = useTranslator();
  const { locale } = useApp();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [direction, setDirection] = useState<string>(ChequeDirection.INCOMING);
  const [currency, setCurrency] = useState('USD');
  const [issueDate, setIssueDate] = useState('');
  const [bankId, setBankId] = useState('');
  const [drawerName, setDrawerName] = useState('');
  const [originalSourceId, setOriginalSourceId] = useState('');
  const [currentLocationId, setCurrentLocationId] = useState('');
  const [notes, setNotes] = useState('');

  const [monthStep, setMonthStep] = useState(1);
  const [fillCount, setFillCount] = useState(12);
  const [rows, setRows] = useState<Row[]>([makeRow({ chequeNumber: '', amount: '', dueDate: '' })]);

  const [rowErrors, setRowErrors] = useState<Record<number, Partial<Record<string, string>>>>({});
  const [duplicateRows, setDuplicateRows] = useState<number[]>([]);
  const [formError, setFormError] = useState<string | null>(null);

  const banks = useQuery({ queryKey: ['banks'], queryFn: () => api.listBanks() });
  const locations = useQuery({ queryKey: ['locations'], queryFn: () => api.listLocations() });
  const contacts = useQuery({
    queryKey: ['contacts', 'all'],
    queryFn: () => api.listContacts({ pageSize: 100 }),
  });

  const total = useMemo(() => sumAmounts(rows), [rows]);

  function updateRow(index: number, key: keyof SerialChequeRow, value: string): void {
    setRows((current) =>
      current.map((row, position) => (position === index ? { ...row, [key]: value } : row)),
    );
  }

  /** Appends `count` rows, each continuing the run from the ones before it. */
  function appendRows(count: number): void {
    setRows((current) => {
      const next = [...current];
      for (let index = 0; index < count; index += 1) {
        if (next.length >= MAX_SERIAL_CHEQUES) break;
        next.push(makeRow({ ...suggestNextRow(next, monthStep), amount: '' }));
      }
      return next;
    });
  }

  /**
   * Copies a row, amount included, and continues the run from it.
   *
   * The plain "+" leaves the amount blank on purpose; this is the shortcut for
   * the common case where every cheque in the book is for the same amount.
   */
  function duplicateRow(index: number): void {
    setRows((current) => {
      if (current.length >= MAX_SERIAL_CHEQUES) return current;
      const source = current[index];
      if (!source) return current;
      const suggestion = suggestNextRow(current, monthStep);
      return [...current, makeRow({ ...suggestion, amount: source.amount })];
    });
  }

  function removeRow(index: number): void {
    // The grid always keeps one row: an empty batch has nothing to save and no
    // row to type into.
    setRows((current) =>
      current.length === 1 ? current : current.filter((_, position) => position !== index),
    );
  }

  const mutation = useMutation({
    mutationFn: (allowDuplicate: boolean) => {
      const parsed = createChequeBatchSchema.safeParse({
        direction,
        currency,
        issueDate: issueDate || null,
        bankId: bankId || null,
        drawerName: drawerName || null,
        originalSourceId: originalSourceId || null,
        currentLocationId: currentLocationId || null,
        notes: notes || null,
        cheques: rows.map((row) => ({
          chequeNumber: row.chequeNumber.trim(),
          amount: row.amount.trim(),
          dueDate: row.dueDate,
        })),
      });

      if (!parsed.success) {
        // Issues arrive as `cheques.3.amount`; turn them back into a row index
        // so the error lands in the cell that caused it.
        const collected: Record<number, Partial<Record<string, string>>> = {};
        let shared: string | null = null;

        for (const issue of parsed.error.issues) {
          const [head, index, field] = issue.path;
          if (head === 'cheques' && typeof index === 'number' && typeof field === 'string') {
            collected[index] = { ...collected[index], [field]: t(issue.message) };
          } else {
            shared = t(issue.message);
          }
        }

        setRowErrors(collected);
        setFormError(shared ?? t('errors.VALIDATION_ERROR'));
        throw new Error('validation');
      }

      setRowErrors({});
      return api.createChequeBatch(parsed.data, allowDuplicate);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['cheques'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      // Straight to the list: after twenty cheques the useful next view is all
      // of them together, not the last one on its own.
      router.push('/cheques');
    },
    onError: (error: unknown) => {
      if (error instanceof Error && error.message === 'validation') return;

      if (error instanceof ApiClientError) {
        if (error.isDuplicate) {
          const details = error.details as { duplicateRows?: string } | undefined;
          setDuplicateRows(
            (details?.duplicateRows ?? '')
              .split(',')
              .map((value) => Number(value))
              .filter((value) => Number.isInteger(value)),
          );
          setFormError(t('cheque.batchNothingSaved'));
          return;
        }
        setFormError(t(error.messageKey));
        return;
      }
      setFormError(t('errors.INTERNAL_ERROR'));
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setFormError(null);
    setDuplicateRows([]);
    mutation.mutate(false);
  }

  const atLimit = rows.length >= MAX_SERIAL_CHEQUES;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <Panel title={t('cheque.batchShared')}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label={t('cheque.direction')} htmlFor="batch-direction" required>
            <select
              id="batch-direction"
              className={inputClassName}
              value={direction}
              onChange={(event) => setDirection(event.target.value)}
            >
              {[ChequeDirection.INCOMING, ChequeDirection.OUTGOING].map((value) => (
                <option key={value} value={value}>
                  {t(`direction.${value}`)}
                </option>
              ))}
            </select>
          </Field>

          <Field label={t('common.currency')} htmlFor="batch-currency" required>
            <select
              id="batch-currency"
              className={inputClassName}
              value={currency}
              onChange={(event) => setCurrency(event.target.value)}
            >
              {CURRENCIES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </Field>

          <Field label={t('cheque.issueDate')} htmlFor="batch-issueDate">
            <input
              id="batch-issueDate"
              type="date"
              className={inputClassName}
              value={issueDate}
              onChange={(event) => setIssueDate(event.target.value)}
            />
          </Field>

          <Field label={t('cheque.bank')} htmlFor="batch-bank">
            <select
              id="batch-bank"
              className={inputClassName}
              value={bankId}
              onChange={(event) => setBankId(event.target.value)}
            >
              <option value="">{t('common.unknown')}</option>
              {(banks.data ?? []).map((bank) => (
                <option key={bank.id} value={bank.id}>
                  {bank.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label={t('cheque.drawerName')} htmlFor="batch-drawer">
            <input
              id="batch-drawer"
              className={inputClassName}
              value={drawerName}
              onChange={(event) => setDrawerName(event.target.value)}
            />
          </Field>

          <Field label={t('cheque.originalSource')} htmlFor="batch-source">
            <select
              id="batch-source"
              className={inputClassName}
              value={originalSourceId}
              onChange={(event) => setOriginalSourceId(event.target.value)}
            >
              <option value="">{t('common.unknown')}</option>
              {(contacts.data?.data ?? []).map((contact) => (
                <option key={contact.id} value={contact.id}>
                  {contact.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label={t('cheque.currentLocation')} htmlFor="batch-location">
            <select
              id="batch-location"
              className={inputClassName}
              value={currentLocationId}
              onChange={(event) => setCurrentLocationId(event.target.value)}
            >
              <option value="">{t('common.unknown')}</option>
              {(locations.data ?? []).map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label={t('cheque.batchMonthStep')}
            htmlFor="batch-step"
            hint={t('cheque.batchMonthStepHint')}
          >
            <input
              id="batch-step"
              type="number"
              min={1}
              max={12}
              dir="ltr"
              className={inputClassName}
              value={monthStep}
              onChange={(event) => setMonthStep(Math.max(1, Number(event.target.value) || 1))}
            />
          </Field>

          <Field label={t('common.notes')} htmlFor="batch-notes">
            <input
              id="batch-notes"
              className={inputClassName}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </Field>
        </div>
      </Panel>

      <Panel title={`${t('cheque.batchRows')} — ${rows.length}`}>
        <p className="mb-3 text-sm text-slate-500">{t('cheque.batchAutoHint')}</p>

        {/* The grid scrolls inside its own box so the page never moves sideways. */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-separate border-spacing-0 text-sm">
            <thead>
              <tr className="text-slate-500">
                <th className="w-10 border-b border-slate-200 px-2 py-2 text-start font-medium">
                  #
                </th>
                <th className="border-b border-slate-200 px-2 py-2 text-start font-medium">
                  {t('cheque.number')}
                </th>
                <th className="border-b border-slate-200 px-2 py-2 text-start font-medium">
                  {t('common.amount')}
                </th>
                <th className="border-b border-slate-200 px-2 py-2 text-start font-medium">
                  {t('cheque.dueDate')}
                </th>
                <th className="w-24 border-b border-slate-200 px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const isDuplicate = duplicateRows.includes(index);
                const errors = rowErrors[index] ?? {};
                return (
                  <tr key={row.id} className={isDuplicate ? 'bg-amber-50' : undefined}>
                    <td className="px-2 py-1.5 text-slate-400 tabular-nums">{index + 1}</td>
                    <td className="px-2 py-1.5">
                      <input
                        dir="ltr"
                        aria-label={`${t('cheque.number')} ${index + 1}`}
                        className={inputClassName}
                        value={row.chequeNumber}
                        onChange={(event) => updateRow(index, 'chequeNumber', event.target.value)}
                        aria-invalid={Boolean(errors.chequeNumber)}
                      />
                      {errors.chequeNumber ? (
                        <span className="text-xs text-red-600">{errors.chequeNumber}</span>
                      ) : null}
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        dir="ltr"
                        inputMode="decimal"
                        placeholder="0.00"
                        aria-label={`${t('common.amount')} ${index + 1}`}
                        className={inputClassName}
                        value={row.amount}
                        onChange={(event) => updateRow(index, 'amount', event.target.value)}
                        aria-invalid={Boolean(errors.amount)}
                      />
                      {errors.amount ? (
                        <span className="text-xs text-red-600">{errors.amount}</span>
                      ) : null}
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        type="date"
                        aria-label={`${t('cheque.dueDate')} ${index + 1}`}
                        className={inputClassName}
                        value={row.dueDate}
                        onChange={(event) => updateRow(index, 'dueDate', event.target.value)}
                        aria-invalid={Boolean(errors.dueDate)}
                      />
                      {errors.dueDate ? (
                        <span className="text-xs text-red-600">{errors.dueDate}</span>
                      ) : null}
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="flex gap-1">
                        <button
                          type="button"
                          title={t('cheque.batchCopyRow')}
                          aria-label={`${t('cheque.batchCopyRow')} ${index + 1}`}
                          onClick={() => duplicateRow(index)}
                          disabled={atLimit}
                          className="rounded-lg border border-slate-200 px-2 py-1 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                        >
                          ⧉
                        </button>
                        <button
                          type="button"
                          title={t('cheque.batchRemoveRow')}
                          aria-label={`${t('cheque.batchRemoveRow')} ${index + 1}`}
                          onClick={() => removeRow(index)}
                          disabled={rows.length === 1}
                          className="rounded-lg border border-slate-200 px-2 py-1 text-slate-600 hover:bg-red-50 hover:text-red-700 disabled:opacity-40"
                        >
                          ✕
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={() => appendRows(1)}
            disabled={atLimit}
          >
            + {t('cheque.batchAddRow')}
          </Button>

          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={MAX_SERIAL_CHEQUES}
              dir="ltr"
              aria-label={t('cheque.batchFillCount')}
              className={`${inputClassName} w-20`}
              value={fillCount}
              onChange={(event) => setFillCount(Math.max(1, Number(event.target.value) || 1))}
            />
            <Button
              type="button"
              variant="secondary"
              onClick={() => appendRows(fillCount)}
              disabled={atLimit}
            >
              {t('cheque.batchFillAction')}
            </Button>
          </div>

          {atLimit ? (
            <span className="text-sm text-amber-700">{t('cheque.batchLimit')}</span>
          ) : null}

          <span className="ms-auto text-sm text-slate-600">
            {t('cheque.batchTotal')}:{' '}
            <b className="tabular-nums">{formatMoney(locale, total, currency)}</b>
          </span>
        </div>
      </Panel>

      {duplicateRows.length > 0 ? (
        <ErrorState title={`${t('cheque.batchDuplicateRows')} — ${duplicateRows.length}`} />
      ) : null}

      {formError ? (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
          {formError}
        </p>
      ) : null}

      <div className="sticky bottom-0 -mx-1 flex flex-wrap gap-3 rounded-2xl border border-slate-200 bg-white/95 p-4 backdrop-blur">
        <Button type="submit" size="lg" loading={mutation.isPending}>
          {t('common.save')}
        </Button>
        {duplicateRows.length > 0 ? (
          <Button
            type="button"
            variant="danger"
            loading={mutation.isPending}
            onClick={() => {
              setFormError(null);
              mutation.mutate(true);
            }}
          >
            {t('common.confirm')}
          </Button>
        ) : null}
      </div>
    </form>
  );
}
