import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { ApiClientError } from '@cheque-flow/api-client';
import { ChequeDirection, type DuplicateChequeMatch } from '@cheque-flow/shared-types';
import { createChequeSchema } from '@cheque-flow/validation';
import { colors, spacing } from '@cheque-flow/ui/tokens';

import { useApi, useApp, useTranslator } from '@/components/providers';
import { Banner, Button, DateField, ErrorView, Field, Picker, Section } from '@/components/ui';
import { addDaysIso, todayIso } from '@/lib/dates';
import { fieldErrorsFrom, validateForm, type FieldErrors } from '@/lib/form';

const CURRENCIES = ['ILS', 'USD', 'JOD', 'EUR'];

/**
 * Records a cheque by hand.
 *
 * Not every cheque arrives through the camera: staff enter cheques from a
 * statement, over the phone, or when the photo is unusable. The form is
 * validated with the API's own schema, so the phone and the server agree on
 * what a valid cheque is.
 */
export default function NewChequeScreen() {
  const api = useApi();
  const t = useTranslator();
  const { money, online } = useApp();
  const router = useRouter();
  const queryClient = useQueryClient();

  const today = todayIso();

  const [direction, setDirection] = useState<string>(ChequeDirection.INCOMING);
  const [chequeNumber, setChequeNumber] = useState('');
  const [amount, setAmount] = useState('');
  const [amountInWords, setAmountInWords] = useState('');
  const [currency, setCurrency] = useState('ILS');
  const [issueDate, setIssueDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [drawerName, setDrawerName] = useState('');
  const [payeeName, setPayeeName] = useState('');
  const [bankId, setBankId] = useState<string | null>(null);
  const [bankNameRaw, setBankNameRaw] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [locationId, setLocationId] = useState<string | null>(null);
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');

  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [duplicates, setDuplicates] = useState<DuplicateChequeMatch[] | null>(null);

  const banks = useQuery({ queryKey: ['banks'], queryFn: () => api.listBanks() });
  const contacts = useQuery({
    queryKey: ['contacts', 'picker'],
    queryFn: () => api.listContacts({ pageSize: 100, isActive: true }),
  });
  const locations = useQuery({ queryKey: ['locations'], queryFn: () => api.listLocations() });

  function buildInput(): unknown {
    return {
      direction,
      chequeNumber: chequeNumber.trim(),
      amount: amount.trim(),
      amountInWords: amountInWords.trim() || null,
      currency,
      issueDate: issueDate || null,
      dueDate,
      bankId,
      bankNameRaw: bankNameRaw.trim() || null,
      accountNumber: accountNumber.trim() || null,
      drawerName: drawerName.trim() || null,
      originalSourceId: sourceId,
      originalPayeeName: payeeName.trim() || null,
      currentLocationId: locationId,
      referenceNumber: reference.trim() || null,
      notes: notes.trim() || null,
    };
  }

  const mutation = useMutation({
    mutationFn: async (allowDuplicate: boolean) => {
      const validated = validateForm(createChequeSchema, buildInput());
      if (!validated.ok) {
        setErrors(validated.errors);
        throw new Error('validation');
      }
      setErrors({});
      return api.createCheque(validated.data, allowDuplicate);
    },
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['cheques'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      router.replace(`/(app)/cheques/${result.cheque.id}`);
    },
    onError: (error: unknown) => {
      if (error instanceof Error && error.message === 'validation') return;

      if (error instanceof ApiClientError) {
        // A duplicate is not a failure: the API found a matching cheque and is
        // asking whether this really is a second one.
        if (error.code === 'DUPLICATE_CHEQUE') {
          const details = error.details as { duplicates?: DuplicateChequeMatch[] } | undefined;
          setDuplicates(details?.duplicates ?? []);
          return;
        }
        const serverErrors = fieldErrorsFrom(error.details);
        if (Object.keys(serverErrors).length > 0) {
          setErrors(serverErrors);
          return;
        }
        setFormError(t(error.messageKey));
        return;
      }
      setFormError(t('errors.saveFailed'));
    },
  });

  const error = (field: string): string | undefined =>
    errors[field] ? t(errors[field]) : undefined;

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      {!online ? <Banner text={t('common.offline')} /> : null}

      <Section title={t('cheque.identity')}>
        <Picker
          label={t('cheque.direction')}
          required
          options={[
            { value: ChequeDirection.INCOMING, label: t('direction.INCOMING') },
            { value: ChequeDirection.OUTGOING, label: t('direction.OUTGOING') },
          ]}
          value={direction}
          onChange={setDirection}
          error={error('direction')}
        />
        <Field
          label={t('cheque.number')}
          required
          value={chequeNumber}
          onChangeText={setChequeNumber}
          error={error('chequeNumber')}
          keyboardType="numeric"
          ltr
        />
        <Field
          label={t('common.amount')}
          required
          value={amount}
          onChangeText={setAmount}
          error={error('amount')}
          keyboardType="numeric"
          ltr
          hint={amount && currency ? money(amount, currency) : undefined}
        />
        <Field
          label={t('cheque.amountInWords')}
          value={amountInWords}
          onChangeText={setAmountInWords}
          error={error('amountInWords')}
        />
        <Picker
          label={t('cheque.currency')}
          required
          options={CURRENCIES.map((value) => ({ value, label: value }))}
          value={currency}
          onChange={setCurrency}
          error={error('currency')}
        />
      </Section>

      <Section title={t('cheque.dates')}>
        <DateField
          label={t('cheque.issueDate')}
          value={issueDate}
          onChange={setIssueDate}
          error={error('issueDate')}
          shortcuts={[{ label: t('common.today'), value: today }]}
        />
        <DateField
          label={t('cheque.dueDate')}
          required
          value={dueDate}
          onChange={setDueDate}
          error={error('dueDate')}
          shortcuts={[
            { label: t('common.today'), value: today },
            { label: '+30', value: addDaysIso(today, 30) },
            { label: '+60', value: addDaysIso(today, 60) },
            { label: '+90', value: addDaysIso(today, 90) },
          ]}
        />
      </Section>

      <Section title={t('cheque.parties')}>
        <Field
          label={t('cheque.drawerName')}
          value={drawerName}
          onChangeText={setDrawerName}
          error={error('drawerName')}
        />
        <Field
          label={t('cheque.originalPayee')}
          value={payeeName}
          onChangeText={setPayeeName}
          error={error('originalPayeeName')}
        />
        <Picker
          label={t('cheque.originalSource')}
          options={(contacts.data?.data ?? []).map((contact) => ({
            value: contact.id,
            label: contact.name,
          }))}
          value={sourceId}
          onChange={(next) => setSourceId(next === sourceId ? null : next)}
          emptyLabel={t('contact.empty')}
          error={error('originalSourceId')}
        />
      </Section>

      <Section title={t('cheque.bank')}>
        <Picker
          label={t('cheque.bank')}
          options={(banks.data ?? []).map((bank) => ({ value: bank.id, label: bank.name }))}
          value={bankId}
          onChange={(next) => setBankId(next === bankId ? null : next)}
          error={error('bankId')}
        />
        <Field
          label={`${t('cheque.bank')} (${t('common.optionalField')})`}
          value={bankNameRaw}
          onChangeText={setBankNameRaw}
          error={error('bankNameRaw')}
        />
        <Field
          label={t('cheque.accountNumber')}
          value={accountNumber}
          onChangeText={setAccountNumber}
          error={error('accountNumber')}
          keyboardType="numeric"
          ltr
        />
      </Section>

      <Section title={t('cheque.custody')}>
        <Picker
          label={t('cheque.currentLocation')}
          options={(locations.data ?? []).map((location) => ({
            value: location.id,
            label: location.name,
          }))}
          value={locationId}
          onChange={(next) => setLocationId(next === locationId ? null : next)}
          error={error('currentLocationId')}
        />
        <Field
          label={t('cheque.referenceNumber')}
          value={reference}
          onChangeText={setReference}
          error={error('referenceNumber')}
        />
        <Field
          label={t('common.notes')}
          value={notes}
          onChangeText={setNotes}
          multiline
          error={error('notes')}
        />
      </Section>

      {duplicates ? (
        <View style={styles.duplicateBox}>
          <Text style={styles.duplicateTitle}>{t('cheque.duplicateWarning')}</Text>
          {duplicates.map((match) => (
            <Text key={match.chequeId} style={styles.duplicateRow}>
              {match.chequeNumber} — {money(match.amount, currency)} — {t(`status.${match.status}`)}
            </Text>
          ))}
          <Button
            label={t('common.confirm')}
            variant="danger"
            onPress={() => {
              setDuplicates(null);
              mutation.mutate(true);
            }}
          />
          <Button
            label={t('common.cancel')}
            variant="secondary"
            onPress={() => setDuplicates(null)}
          />
        </View>
      ) : null}

      {formError ? <ErrorView label={formError} /> : null}

      <Button
        label={t('common.save')}
        onPress={() => {
          setFormError(null);
          mutation.mutate(false);
        }}
        loading={mutation.isPending}
        large
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.md,
    gap: spacing.md,
    backgroundColor: colors.surfaceMuted,
    paddingBottom: spacing.xxl,
  },
  duplicateBox: {
    backgroundColor: colors.warningBg,
    borderRadius: 10,
    padding: spacing.md,
    gap: spacing.sm,
  },
  duplicateTitle: { fontSize: 15, fontWeight: '700', color: colors.warning, textAlign: 'right' },
  duplicateRow: { fontSize: 14, color: colors.warning, textAlign: 'right' },
});
