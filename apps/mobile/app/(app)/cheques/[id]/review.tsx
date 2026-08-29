import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { ApiClientError, type OcrSuggestionResponse } from '@cheque-flow/api-client';
import type { ChequeDetailView } from '@cheque-flow/shared-types';
import { colors, radius, spacing } from '@cheque-flow/ui/tokens';

import { useApi, useTranslator } from '@/components/providers';
import { Body, Button, Card, Heading, LoadingView } from '@/components/ui';

const FIELDS = [
  { field: 'chequeNumber', target: 'chequeNumber', labelKey: 'cheque.number' },
  { field: 'numericAmount', target: 'amount', labelKey: 'common.amount' },
  // The written amount is what prevails in a dispute, so the reviewer confirms
  // it alongside the digits rather than only correcting the digits.
  { field: 'writtenAmount', target: 'amountInWords', labelKey: 'cheque.amountInWords' },
  { field: 'currency', target: 'currency', labelKey: 'common.currency' },
  { field: 'dueDate', target: 'dueDate', labelKey: 'cheque.dueDate' },
  { field: 'issueDate', target: 'issueDate', labelKey: 'cheque.issueDate' },
  { field: 'drawerName', target: 'drawerName', labelKey: 'cheque.drawerName' },
  { field: 'payeeName', target: 'originalPayeeName', labelKey: 'cheque.originalPayee' },
] as const;

/**
 * OCR review.
 *
 * The extracted values are suggestions until the user confirms them here;
 * low-confidence fields are marked so they get a second look.
 */
export default function ReviewExtractedDataScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const api = useApi();
  const t = useTranslator();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const cheque = useQuery<ChequeDetailView>({
    queryKey: ['cheque', id],
    queryFn: () => api.getCheque(id),
    enabled: Boolean(id),
  });

  const suggestion = useQuery<OcrSuggestionResponse | null>({
    queryKey: ['ocr-suggestion', id],
    queryFn: () => api.getOcrSuggestion(id),
    enabled: Boolean(id),
  });

  useEffect(() => {
    if (!suggestion.data) return;
    const next: Record<string, string> = {};
    for (const { field } of FIELDS) {
      const value = suggestion.data.fields[field]?.value;
      next[field] = typeof value === 'string' ? value : '';
    }
    setValues(next);
  }, [suggestion.data]);

  const confirm = useMutation({
    mutationFn: () => {
      const confirmed: Record<string, string> = {};
      for (const { field, target } of FIELDS) {
        const value = values[field]?.trim();
        if (value) confirmed[target] = value;
      }
      return api.reviewCheque(id, {
        ...(suggestion.data ? { extractionId: suggestion.data.extractionId } : {}),
        confirmed,
        rejectedFields: [],
        version: cheque.data?.version ?? 1,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['cheque', id] });
      router.replace(`/(app)/cheques/${id}`);
    },
    onError: (caught: unknown) => {
      setError(caught instanceof ApiClientError ? t(caught.messageKey) : t('errors.network'));
    },
  });

  if (suggestion.isPending || cheque.isPending) {
    return <LoadingView label={t('ocr.processing')} />;
  }

  const lowConfidence = new Set(suggestion.data?.lowConfidenceFields ?? []);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Heading>{t('ocr.reviewTitle')}</Heading>
      <Body muted>{t('ocr.reviewSubtitle')}</Body>

      <View style={styles.notice}>
        <Text style={styles.noticeText}>{t('ocr.suggestionNotice')}</Text>
      </View>

      <Card>
        {FIELDS.map(({ field, labelKey }) => {
          const extracted = suggestion.data?.fields[field];
          return (
            <View key={field} style={styles.fieldBox}>
              <View style={styles.fieldHeader}>
                <Text style={styles.label}>{t(labelKey)}</Text>
                {lowConfidence.has(field) ? (
                  <Text style={styles.warn}>{t('ocr.lowConfidence')}</Text>
                ) : null}
              </View>
              <TextInput
                style={styles.input}
                value={values[field] ?? ''}
                onChangeText={(text) => setValues((current) => ({ ...current, [field]: text }))}
                accessibilityLabel={t(labelKey)}
              />
              <Text style={styles.hint}>
                {extracted
                  ? `${t('ocr.confidence')}: ${Math.round(extracted.confidence * 100)}%`
                  : t('ocr.notExtracted')}
              </Text>
            </View>
          );
        })}
      </Card>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Button
        label={t('ocr.confirm')}
        onPress={() => confirm.mutate()}
        loading={confirm.isPending}
        large
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.md, gap: spacing.md, backgroundColor: colors.surfaceMuted },
  notice: { backgroundColor: colors.warningBg, borderRadius: radius.sm, padding: spacing.sm },
  noticeText: { color: colors.warning, fontSize: 14, textAlign: 'right' },
  fieldBox: { gap: 4, marginBottom: spacing.sm },
  fieldHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  label: { fontSize: 14, color: colors.textMuted },
  warn: { fontSize: 12, color: colors.warning },
  hint: { fontSize: 12, color: colors.textMuted, textAlign: 'right' },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    fontSize: 16,
    backgroundColor: colors.surface,
    textAlign: 'right',
  },
  error: { color: colors.danger, fontSize: 14, textAlign: 'right' },
});
