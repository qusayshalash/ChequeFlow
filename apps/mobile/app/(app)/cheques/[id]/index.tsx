import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { formatDate, formatMoney } from '@cheque-flow/localization';
import type { ChequeDetailView } from '@cheque-flow/shared-types';
import { colors, spacing } from '@cheque-flow/ui/tokens';

import { useApi, useApp, useTranslator } from '@/components/providers';
import { Body, Button, Card, ErrorView, Heading, LoadingView, StatusPill } from '@/components/ui';

export default function ChequeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const api = useApi();
  const t = useTranslator();
  const { locale } = useApp();
  const router = useRouter();

  const query = useQuery<ChequeDetailView>({
    queryKey: ['cheque', id],
    queryFn: () => api.getCheque(id),
    enabled: Boolean(id),
  });

  if (query.isPending) return <LoadingView label={t('common.loading')} />;
  if (!query.data) {
    return (
      <ErrorView
        label={t('errors.NOT_FOUND')}
        onRetry={() => void query.refetch()}
        retryLabel={t('common.retry')}
      />
    );
  }

  const cheque = query.data;
  const rows: Array<[string, string]> = [
    [t('common.amount'), formatMoney(locale, cheque.amount, cheque.currency)],
    [t('cheque.dueDate'), formatDate(locale, cheque.dueDate)],
    [t('cheque.direction'), t(`direction.${cheque.direction}`)],
    [t('cheque.bank'), cheque.bankName ?? t('common.unknown')],
    [t('cheque.accountNumber'), cheque.accountNumberMasked ?? t('common.unknown')],
    [t('cheque.originalSource'), cheque.originalSourceName ?? t('common.unknown')],
    [t('cheque.currentRecipient'), cheque.currentRecipientName ?? t('common.unknown')],
    [t('cheque.currentLocation'), cheque.currentLocationName ?? t('common.unknown')],
  ];

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Heading>{cheque.chequeNumber}</Heading>
        <StatusPill status={cheque.status} label={t(`status.${cheque.status}`)} />
      </View>

      <Card>
        {rows.map(([label, value]) => (
          <View key={label} style={styles.row}>
            <Text style={styles.label}>{label}</Text>
            <Text style={styles.value}>{value}</Text>
          </View>
        ))}
        {cheque.notes ? <Body muted>{cheque.notes}</Body> : null}
      </Card>

      {cheque.ocrStatus === 'COMPLETED' ? (
        <Button
          label={t('ocr.reviewTitle')}
          onPress={() => router.push(`/(app)/cheques/${cheque.id}/review`)}
        />
      ) : null}

      <Button
        label={t('common.actions')}
        onPress={() => router.push(`/(app)/cheques/${cheque.id}/action`)}
        disabled={cheque.allowedActions.length === 0}
        large
      />

      <Button
        label={t('cheque.timeline')}
        variant="secondary"
        onPress={() => router.push(`/(app)/cheques/${cheque.id}/timeline`)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.md, gap: spacing.md, backgroundColor: colors.surfaceMuted },
  header: { gap: spacing.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  label: { fontSize: 14, color: colors.textMuted },
  value: { fontSize: 15, color: colors.text, flexShrink: 1, textAlign: 'left' },
});
