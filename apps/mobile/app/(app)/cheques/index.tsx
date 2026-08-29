import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { formatDate, formatMoney } from '@cheque-flow/localization';
import type { ChequeSummaryView } from '@cheque-flow/shared-types';
import { colors, radius, spacing } from '@cheque-flow/ui/tokens';

import { useApi, useApp, useTranslator } from '@/components/providers';
import { EmptyView, ErrorView, LoadingView, StatusPill } from '@/components/ui';

export default function ChequeListScreen() {
  const api = useApi();
  const t = useTranslator();
  const { locale } = useApp();
  const router = useRouter();
  const [search, setSearch] = useState('');

  const query = useQuery({
    queryKey: ['cheques', { search }],
    queryFn: () => api.listCheques({ pageSize: 50, ...(search ? { search } : {}) }),
  });

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.search}
        placeholder={t('common.search')}
        value={search}
        onChangeText={setSearch}
        accessibilityLabel={t('common.search')}
      />

      {query.isPending ? <LoadingView label={t('common.loading')} /> : null}
      {query.isError ? (
        <ErrorView
          label={t('errors.network')}
          onRetry={() => void query.refetch()}
          retryLabel={t('common.retry')}
        />
      ) : null}

      {query.data ? (
        <FlatList<ChequeSummaryView>
          data={query.data.data}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={<EmptyView label={t('cheque.emptyList')} />}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              style={styles.row}
              onPress={() => router.push(`/(app)/cheques/${item.id}`)}
            >
              <View style={styles.rowHeader}>
                <Text style={styles.number}>{item.chequeNumber}</Text>
                <StatusPill status={item.status} label={t(`status.${item.status}`)} />
              </View>
              <Text style={styles.amount}>{formatMoney(locale, item.amount, item.currency)}</Text>
              <Text style={styles.meta}>
                {t('cheque.dueDate')}: {formatDate(locale, item.dueDate)}
              </Text>
              <Text style={styles.meta}>
                {t('cheque.originalSource')}: {item.originalSourceName ?? t('common.unknown')}
              </Text>
            </Pressable>
          )}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surfaceMuted,
    padding: spacing.md,
    gap: spacing.sm,
  },
  search: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    fontSize: 16,
    textAlign: 'right',
  },
  list: { gap: spacing.sm, paddingBottom: spacing.xl },
  row: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 4,
    minHeight: 88,
  },
  rowHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  number: { fontSize: 16, fontWeight: '700', color: colors.text, writingDirection: 'ltr' },
  amount: { fontSize: 18, color: colors.text, textAlign: 'right' },
  meta: { fontSize: 13, color: colors.textMuted, textAlign: 'right' },
});
