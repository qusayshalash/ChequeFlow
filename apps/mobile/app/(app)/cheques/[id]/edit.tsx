import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { ApiClientError } from '@cheque-flow/api-client';
import type { ChequeDetailView } from '@cheque-flow/shared-types';
import { updateChequeSchema } from '@cheque-flow/validation';
import { colors, spacing } from '@cheque-flow/ui/tokens';

import { useApi, useApp, useTranslator } from '@/components/providers';
import { Banner, Button, DateField, ErrorView, Field, LoadingView, Section } from '@/components/ui';
import { fieldErrorsFrom, validateForm, type FieldErrors } from '@/lib/form';

/**
 * Corrects cheque data.
 *
 * Status is deliberately absent: it only ever changes through the state
 * machine actions, which record who moved the cheque and when. Editing the
 * amount of an already reviewed cheque needs a reason, which the server
 * enforces and this form collects.
 */
export default function EditChequeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const api = useApi();
  const t = useTranslator();
  const { money, online } = useApp();
  const router = useRouter();
  const queryClient = useQueryClient();

  const query = useQuery<ChequeDetailView>({
    queryKey: ['cheque', id],
    queryFn: () => api.getCheque(id),
    enabled: Boolean(id),
  });

  const [chequeNumber, setChequeNumber] = useState('');
  const [amount, setAmount] = useState('');
  const [amountInWords, setAmountInWords] = useState('');
  const [issueDate, setIssueDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [drawerName, setDrawerName] = useState('');
  const [payeeName, setPayeeName] = useState('');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  // Seed the form once the cheque arrives, then leave the user's edits alone.
  const cheque = query.data;
  useEffect(() => {
    if (!cheque) return;
    setChequeNumber(cheque.chequeNumber);
    setAmount(cheque.amount);
    setAmountInWords(cheque.amountInWords ?? '');
    setIssueDate(cheque.issueDate ?? '');
    setDueDate(cheque.dueDate);
    setDrawerName(cheque.drawerName ?? '');
    setPayeeName(cheque.originalPayeeName ?? '');
    setReference(cheque.referenceNumber ?? '');
    setNotes(cheque.notes ?? '');
  }, [cheque]);

  const amountChanged = Boolean(cheque) && amount !== cheque?.amount;
  const reasonRequired = amountChanged && cheque?.reviewedAt !== null;

  const mutation = useMutation({
    mutationFn: async () => {
      if (!cheque) throw new Error('validation');

      const validated = validateForm(updateChequeSchema, {
        chequeNumber: chequeNumber.trim(),
        amount: amount.trim(),
        amountInWords: amountInWords.trim() || null,
        issueDate: issueDate || null,
        dueDate,
        drawerName: drawerName.trim() || null,
        originalPayeeName: payeeName.trim() || null,
        referenceNumber: reference.trim() || null,
        notes: notes.trim() || null,
        // Optimistic locking: the server rejects the write if anyone else
        // changed this cheque since it was read.
        version: cheque.version,
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      });

      if (!validated.ok) {
        setErrors(validated.errors);
        throw new Error('validation');
      }
      setErrors({});
      return api.updateCheque(id, validated.data);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['cheque', id] });
      void queryClient.invalidateQueries({ queryKey: ['cheques'] });
      router.back();
    },
    onError: (error: unknown) => {
      if (error instanceof Error && error.message === 'validation') return;
      if (error instanceof ApiClientError) {
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

  if (query.isPending) return <LoadingView label={t('common.loading')} />;
  if (!cheque) {
    return (
      <ErrorView
        label={t('errors.loadFailed')}
        onRetry={() => void query.refetch()}
        retryLabel={t('common.retry')}
      />
    );
  }

  const error = (field: string): string | undefined =>
    errors[field] ? t(errors[field]) : undefined;

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      {!online ? <Banner text={t('common.offline')} /> : null}

      <Section title={t('cheque.identity')}>
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
          hint={amount ? money(amount, cheque.currency) : undefined}
        />
        <Field
          label={t('cheque.amountInWords')}
          value={amountInWords}
          onChangeText={setAmountInWords}
          error={error('amountInWords')}
        />
      </Section>

      <Section title={t('cheque.dates')}>
        <DateField
          label={t('cheque.issueDate')}
          value={issueDate}
          onChange={setIssueDate}
          error={error('issueDate')}
        />
        <DateField
          label={t('cheque.dueDate')}
          required
          value={dueDate}
          onChange={setDueDate}
          error={error('dueDate')}
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
      </Section>

      <Section title={t('cheque.extra')}>
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

      {reasonRequired ? (
        <Section title={t('common.reason')}>
          <Banner tone="warning" text={t('cheque.duplicateWarning')} />
          <Field
            label={t('common.reason')}
            required
            value={reason}
            onChangeText={setReason}
            multiline
            error={error('reason')}
          />
        </Section>
      ) : null}

      {formError ? <ErrorView label={formError} /> : null}

      <Button
        label={t('common.save')}
        onPress={() => {
          setFormError(null);
          mutation.mutate();
        }}
        loading={mutation.isPending}
        disabled={reasonRequired && reason.trim().length === 0}
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
});
