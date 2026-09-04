import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type TextInput } from 'react-native';

import { ApiClientError } from '@cheque-flow/api-client';
import {
  ChequeDirection,
  MAX_SERIAL_CHEQUES,
  suggestNextRow,
  type SerialChequeRow,
} from '@cheque-flow/shared-types';
import { createChequeBatchSchema } from '@cheque-flow/validation';
import { colors } from '@cheque-flow/ui/tokens';

import { FormScreen } from '@/components/form-screen';
import { useApi, useApp, useTranslator } from '@/components/providers';
import {
  Banner,
  Body,
  Button,
  DateField,
  ErrorView,
  Field,
  Picker,
  Section,
} from '@/components/ui';
import { todayIso } from '@/lib/dates';
import { radius, space, surface, text } from '@/theme';

const CURRENCIES = ['ILS', 'USD', 'JOD', 'EUR'];

interface Row extends SerialChequeRow {
  id: string;
}

let rowCounter = 0;
function makeRow(row: SerialChequeRow): Row {
  rowCounter += 1;
  return { ...row, id: `row-${rowCounter}` };
}

/** Sums the rows in whole cents, so the total never drifts through a float. */
function sumAmounts(rows: readonly Row[]): string {
  const cents = rows.reduce((total, row) => {
    const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(row.amount.trim());
    if (!match) return total;
    return total + Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  }, 0);
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
}

/**
 * Records a whole cheque book in one go.
 *
 * A customer paying on credit hands over a strip of cheques at once:
 * consecutive numbers, one due date a month apart, the same bank and drawer
 * throughout. The shared details are entered once; each cheque after the first
 * arrives with its number and due date already filled in, so the only thing
 * left to type is the amount.
 */
export default function ChequeBatchScreen() {
  const api = useApi();
  const t = useTranslator();
  const { money, online } = useApp();
  const router = useRouter();
  const queryClient = useQueryClient();

  const today = todayIso();

  const [direction, setDirection] = useState<string>(ChequeDirection.INCOMING);
  const [currency, setCurrency] = useState('ILS');
  const [exchangeRate, setExchangeRate] = useState('');
  const [issueDate, setIssueDate] = useState('');
  const [bankId, setBankId] = useState<string | null>(null);
  const [drawerName, setDrawerName] = useState('');
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [locationId, setLocationId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');

  const [monthStep, setMonthStep] = useState('1');
  const [rows, setRows] = useState<Row[]>([makeRow({ chequeNumber: '', amount: '', dueDate: '' })]);

  const [rowErrors, setRowErrors] = useState<Record<number, Record<string, string>>>({});
  const [duplicateRows, setDuplicateRows] = useState<number[]>([]);
  const [formError, setFormError] = useState<string | null>(null);

  const banks = useQuery({ queryKey: ['banks'], queryFn: () => api.listBanks() });
  const contacts = useQuery({
    queryKey: ['contacts', 'picker'],
    queryFn: () => api.listContacts({ pageSize: 100, isActive: true }),
  });
  const locations = useQuery({ queryKey: ['locations'], queryFn: () => api.listLocations() });

  const step = Math.max(1, Number(monthStep) || 1);
  const total = useMemo(() => sumAmounts(rows), [rows]);
  const atLimit = rows.length >= MAX_SERIAL_CHEQUES;

  function updateRow(index: number, key: keyof SerialChequeRow, value: string): void {
    setRows((current) =>
      current.map((row, position) => (position === index ? { ...row, [key]: value } : row)),
    );
  }

  /**
   * Every text input in the grid, so one can hand focus to the next.
   *
   * The web app got Enter-to-next-field for the same reason: recording a
   * cheque book meant reaching for the mouse — here, the keyboard — between
   * every box. On a phone the equivalent is the keyboard's own "next" key,
   * which is what `returnKeyType` and `onSubmitEditing` below turn on.
   *
   * Keyed by row and column rather than held in an array of arrays: rows are
   * added and removed while the form is open, and a positional array would
   * point at the wrong box the moment somebody deletes row three.
   */
  const cellRefs = useRef(new Map<string, TextInput | null>());
  const cellKey = (index: number, field: 'chequeNumber' | 'amount') => `${index}:${field}`;

  /**
   * Hands focus to a box, if it is there.
   *
   * The date column is deliberately not in the chain. It is a masked text
   * field with its own shortcut buttons, and jumping into it would bury those
   * under the keyboard the moment the amount is entered.
   */
  function focusCell(index: number, field: 'chequeNumber' | 'amount'): void {
    cellRefs.current.get(cellKey(index, field))?.focus();
  }

  /** Adds one cheque, continuing the run. `carryAmount` repeats the last amount. */
  function addRow(carryAmount: boolean): void {
    setRows((current) => {
      if (current.length >= MAX_SERIAL_CHEQUES) return current;
      const previous = current[current.length - 1];
      return [
        ...current,
        makeRow({
          ...suggestNextRow(current, step),
          amount: carryAmount ? (previous?.amount ?? '') : '',
        }),
      ];
    });
  }

  function removeRow(index: number): void {
    // One row always stays: an empty batch has nothing to save and nowhere to
    // type.
    setRows((current) =>
      current.length === 1 ? current : current.filter((_, position) => position !== index),
    );
  }

  const mutation = useMutation({
    mutationFn: (allowDuplicate: boolean) => {
      const parsed = createChequeBatchSchema.safeParse({
        direction,
        currency,
        exchangeRate: exchangeRate.trim() || null,
        issueDate: issueDate || null,
        bankId,
        drawerName: drawerName.trim() || null,
        originalSourceId: sourceId,
        currentLocationId: locationId,
        notes: notes.trim() || null,
        cheques: rows.map((row) => ({
          chequeNumber: row.chequeNumber.trim(),
          amount: row.amount.trim(),
          dueDate: row.dueDate,
        })),
      });

      if (!parsed.success) {
        // Issues arrive as `cheques.3.amount`; map them back to a row so the
        // message lands on the cheque that caused it.
        const collected: Record<number, Record<string, string>> = {};
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
      // The list, not the last cheque: after a whole book the useful view is
      // all of them together.
      router.replace('/(app)/cheques');
    },
    onError: (error: unknown) => {
      if (error instanceof Error && error.message === 'validation') return;

      if (error instanceof ApiClientError) {
        if (error.code === 'DUPLICATE_CHEQUE') {
          const details = error.details as { duplicateRows?: string } | undefined;
          setDuplicateRows(
            (details?.duplicateRows ?? '')
              .split(',')
              .map(Number)
              .filter((value) => Number.isInteger(value)),
          );
          setFormError(t('cheque.batchNothingSaved'));
          return;
        }
        setFormError(t(error.messageKey));
        return;
      }
      setFormError(t('errors.saveFailed'));
    },
  });

  return (
    <FormScreen
      submitLabel={t('common.save')}
      onSubmit={() => {
        setFormError(null);
        setDuplicateRows([]);
        mutation.mutate(false);
      }}
      submitting={mutation.isPending}
    >
      {!online ? <Banner text={t('common.offline')} /> : null}

      <Section title={t('cheque.batchShared')}>
        <Picker
          label={t('cheque.direction')}
          required
          options={[
            { value: ChequeDirection.INCOMING, label: t('direction.INCOMING') },
            { value: ChequeDirection.OUTGOING, label: t('direction.OUTGOING') },
          ]}
          value={direction}
          onChange={setDirection}
        />
        <Picker
          label={t('cheque.currency')}
          required
          options={CURRENCIES.map((value) => ({ value, label: value }))}
          value={currency}
          onChange={setCurrency}
        />
        <Field
          label={t('cheque.exchangeRate')}
          hint={t('cheque.exchangeRateHint')}
          value={exchangeRate}
          onChangeText={setExchangeRate}
          keyboardType="numeric"
          ltr
        />
        <DateField
          label={t('cheque.issueDate')}
          value={issueDate}
          onChange={setIssueDate}
          shortcuts={[{ label: t('common.today'), value: today }]}
        />
        <Picker
          label={t('cheque.bank')}
          options={(banks.data ?? []).map((bank) => ({ value: bank.id, label: bank.name }))}
          value={bankId}
          onChange={(next) => setBankId(next === bankId ? null : next)}
        />
        <Field label={t('cheque.drawerName')} value={drawerName} onChangeText={setDrawerName} />
        <Picker
          label={t('cheque.originalSource')}
          options={(contacts.data?.data ?? []).map((contact) => ({
            value: contact.id,
            label: contact.name,
          }))}
          value={sourceId}
          onChange={(next) => setSourceId(next === sourceId ? null : next)}
          emptyLabel={t('contact.empty')}
        />
        <Picker
          label={t('cheque.currentLocation')}
          options={(locations.data ?? []).map((location) => ({
            value: location.id,
            label: location.name,
          }))}
          value={locationId}
          onChange={(next) => setLocationId(next === locationId ? null : next)}
        />
        <Field
          label={t('cheque.batchMonthStep')}
          hint={t('cheque.batchMonthStepHint')}
          value={monthStep}
          onChangeText={setMonthStep}
          keyboardType="numeric"
          ltr
        />
        <Field label={t('common.notes')} value={notes} onChangeText={setNotes} multiline />
      </Section>

      <Section title={`${t('cheque.batchRows')} — ${rows.length}`}>
        <Body muted>{t('cheque.batchAutoHint')}</Body>

        {rows.map((row, index) => (
          <View
            key={row.id}
            style={[styles.row, duplicateRows.includes(index) ? styles.rowDuplicate : null]}
          >
            <View style={styles.rowHeader}>
              <Text style={styles.rowIndex}>{index + 1}</Text>
              {rows.length > 1 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${t('cheque.batchRemoveRow')} ${index + 1}`}
                  onPress={() => removeRow(index)}
                  hitSlop={8}
                >
                  <Text style={styles.removeGlyph}>✕</Text>
                </Pressable>
              ) : null}
            </View>

            <Field
              label={t('cheque.number')}
              required
              value={row.chequeNumber}
              onChangeText={(value) => updateRow(index, 'chequeNumber', value)}
              error={rowErrors[index]?.chequeNumber}
              keyboardType="numeric"
              ltr
              inputRef={{
                get current() {
                  return cellRefs.current.get(cellKey(index, 'chequeNumber')) ?? null;
                },
                set current(node: TextInput | null) {
                  cellRefs.current.set(cellKey(index, 'chequeNumber'), node);
                },
              }}
              returnKeyType="next"
              onSubmitEditing={() => focusCell(index, 'amount')}
            />
            <Field
              label={t('common.amount')}
              required
              value={row.amount}
              onChangeText={(value) => updateRow(index, 'amount', value)}
              error={rowErrors[index]?.amount}
              keyboardType="numeric"
              ltr
              hint={row.amount ? money(row.amount, currency) : undefined}
              inputRef={{
                get current() {
                  return cellRefs.current.get(cellKey(index, 'amount')) ?? null;
                },
                set current(node: TextInput | null) {
                  cellRefs.current.set(cellKey(index, 'amount'), node);
                },
              }}
              // The last amount ends the chain rather than pretending there is
              // another row; "+ add cheque" is the honest next step there.
              returnKeyType={index + 1 < rows.length ? 'next' : 'done'}
              onSubmitEditing={() => {
                if (index + 1 < rows.length) focusCell(index + 1, 'chequeNumber');
              }}
            />
            <DateField
              label={t('cheque.dueDate')}
              required
              value={row.dueDate}
              onChange={(value) => updateRow(index, 'dueDate', value)}
              error={rowErrors[index]?.dueDate}
            />
          </View>
        ))}

        <Button
          label={`+  ${t('cheque.batchAddRow')}`}
          variant="secondary"
          onPress={() => addRow(false)}
          disabled={atLimit}
        />
        <Button
          label={`⧉  ${t('cheque.batchCopyRow')}`}
          variant="secondary"
          onPress={() => addRow(true)}
          disabled={atLimit}
        />
        {atLimit ? <Body muted>{t('cheque.batchLimit')}</Body> : null}

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>{t('cheque.batchTotal')}</Text>
          <Text style={styles.totalValue}>{money(total, currency)}</Text>
        </View>
      </Section>

      {duplicateRows.length > 0 ? (
        <View style={styles.duplicateBox}>
          <Text style={styles.duplicateTitle}>
            {t('cheque.batchDuplicateRows')} — {duplicateRows.length}
          </Text>
          <Text style={styles.duplicateRow}>
            {duplicateRows.map((index) => index + 1).join('، ')}
          </Text>
          <Button
            label={t('common.confirm')}
            variant="danger"
            onPress={() => {
              setDuplicateRows([]);
              setFormError(null);
              mutation.mutate(true);
            }}
          />
        </View>
      ) : null}

      {formError ? <ErrorView label={formError} /> : null}
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  row: {
    borderWidth: 1,
    borderColor: surface.line,
    borderRadius: radius.md,
    padding: space['2'],
    gap: 4,
    backgroundColor: surface.card,
  },
  rowDuplicate: { borderColor: colors.warning, backgroundColor: colors.warningBg },
  rowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowIndex: { fontSize: 13, fontWeight: '700', color: text.secondary },
  removeGlyph: { fontSize: 16, color: colors.danger },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: space['2'],
    borderTopWidth: 1,
    borderTopColor: surface.line,
  },
  totalLabel: { fontSize: 14, color: text.secondary },
  totalValue: { fontSize: 17, fontWeight: '700', color: text.primary },
  duplicateBox: {
    backgroundColor: colors.warningBg,
    borderRadius: radius.md,
    padding: space['4'],
    gap: space['2'],
  },
  duplicateTitle: { fontSize: 15, fontWeight: '700', color: colors.warning, textAlign: 'right' },
  duplicateRow: { fontSize: 14, color: colors.warning, textAlign: 'right' },
});
