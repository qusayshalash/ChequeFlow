import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import type { ChequeEventView } from '@cheque-flow/shared-types';
import { colors, radius, spacing } from '@cheque-flow/ui/tokens';

import { useApi, useApp, useTranslator } from '@/components/providers';
import { EmptyView, ErrorView, LoadingView, StatusPill } from '@/components/ui';

/**
 * The cheque's full movement history.
 *
 * This is the append-only ledger: nothing here can be edited or removed, by
 * anyone, which is what makes it usable as evidence of where a cheque went.
 */
export default function ChequeTimelineScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const api = useApi();
  const t = useTranslator();
  const { dateTime } = useApp();

  const query = useQuery({
    queryKey: ['cheque-events', id],
    queryFn: () => api.listChequeEvents(id),
    enabled: Boolean(id),
  });

  if (query.isPending) return <LoadingView label={t('common.loading')} />;
  if (query.isError) {
    return (
      <ErrorView
        label={t('errors.loadFailed')}
        onRetry={() => void query.refetch()}
        retryLabel={t('common.retry')}
      />
    );
  }

  return (
    <FlatList<ChequeEventView>
      style={styles.list}
      contentContainerStyle={styles.content}
      data={query.data?.data ?? []}
      keyExtractor={(item) => item.id}
      ListEmptyComponent={<EmptyView label={t('errors.emptyTitle')} />}
      renderItem={({ item }) => {
        // Whichever party this movement was between; not every event has one.
        const from = item.fromContactName ?? item.fromUserName ?? item.fromLocationName;
        const to = item.toContactName ?? item.toUserName ?? item.toLocationName;

        return (
          <View style={styles.row}>
            <View style={styles.header}>
              <Text style={styles.title}>{t(`event.${item.eventType}`)}</Text>
              {item.toStatus ? (
                <StatusPill status={item.toStatus} label={t(`status.${item.toStatus}`)} />
              ) : null}
            </View>

            <Text style={styles.time}>{dateTime(item.eventDate)}</Text>

            {from || to ? (
              <Text style={styles.meta}>{[from, to].filter(Boolean).join(' ← ')}</Text>
            ) : null}

            {item.performedByName ? (
              <Text style={styles.meta}>
                {t('event.performedBy')}: {item.performedByName}
              </Text>
            ) : null}

            {item.approvedByName ? (
              <Text style={styles.meta}>
                {t('event.approvedBy')}: {item.approvedByName}
              </Text>
            ) : null}

            {item.notes ? <Text style={styles.notes}>{item.notes}</Text> : null}
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: colors.surfaceMuted },
  content: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xxl },
  row: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  title: { fontSize: 16, fontWeight: '700', color: colors.text, textAlign: 'right', flexShrink: 1 },
  time: { fontSize: 13, color: colors.textMuted, textAlign: 'right' },
  meta: { fontSize: 13, color: colors.textMuted, textAlign: 'right' },
  notes: { fontSize: 14, color: colors.text, textAlign: 'right' },
});
