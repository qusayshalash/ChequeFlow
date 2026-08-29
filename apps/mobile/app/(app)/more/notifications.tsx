import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import type { ReminderRow } from '@cheque-flow/api-client';
import { colors, radius, spacing } from '@cheque-flow/ui/tokens';

import { useApi, useApp, useTranslator } from '@/components/providers';
import { Badge, Button, EmptyView, ErrorView, LoadingView } from '@/components/ui';

/** Snooze options, in minutes. */
const SNOOZE = [
  { labelKey: 'reminders.snoozeHour', minutes: 60 },
  { labelKey: 'reminders.snoozeDay', minutes: 60 * 24 },
  { labelKey: 'reminders.snoozeWeek', minutes: 60 * 24 * 7 },
];

/**
 * The in-app reminder feed.
 *
 * Reminders whose time has come sort to the top; acknowledging one removes it
 * from the feed, and snoozing pushes it forward without losing it.
 */
export default function NotificationsScreen() {
  const api = useApi();
  const t = useTranslator();
  const { money, date, dateTime } = useApp();
  const router = useRouter();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.listNotifications(50),
  });

  function invalidate(): void {
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
  }

  const snooze = useMutation({
    mutationFn: ({ id, minutes }: { id: string; minutes: number }) =>
      api.snoozeReminder(id, minutes),
    onSuccess: invalidate,
  });

  const acknowledge = useMutation({
    mutationFn: (id: string) => api.acknowledgeReminder(id),
    onSuccess: invalidate,
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
    <FlatList<ReminderRow>
      style={styles.list}
      contentContainerStyle={styles.content}
      data={query.data?.data ?? []}
      keyExtractor={(item) => item.id}
      refreshing={query.isRefetching}
      onRefresh={() => void query.refetch()}
      ListEmptyComponent={<EmptyView label={t('reminders.empty')} />}
      renderItem={({ item }) => (
        <View style={[styles.row, item.isDue && styles.rowDue]}>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push(`/(app)/cheques/${item.cheque.id}`)}
          >
            <View style={styles.header}>
              <Text style={styles.number}>{item.cheque.chequeNumber}</Text>
              {item.isDue ? (
                <Badge label={t('reminders.due')} />
              ) : (
                <Text style={styles.meta}>{t('reminders.upcoming')}</Text>
              )}
            </View>

            <Text style={styles.amount}>{money(item.cheque.amount, item.cheque.currency)}</Text>
            <Text style={styles.meta}>
              {t('cheque.dueDate')}: {date(item.cheque.dueDate)}
            </Text>
            <Text style={styles.meta}>{dateTime(item.remindAt)}</Text>
            {item.custom ? <Text style={styles.meta}>{t('reminders.custom')}</Text> : null}
            {item.note ? <Text style={styles.note}>{item.note}</Text> : null}
          </Pressable>

          <View style={styles.actions}>
            {SNOOZE.map((option) => (
              <Pressable
                key={option.minutes}
                accessibilityRole="button"
                accessibilityLabel={`${t('reminders.snooze')} ${t(option.labelKey)}`}
                style={styles.snoozeChip}
                onPress={() => snooze.mutate({ id: item.id, minutes: option.minutes })}
              >
                <Text style={styles.snoozeText}>{t(option.labelKey)}</Text>
              </Pressable>
            ))}
          </View>

          <Button
            label={t('reminders.acknowledge')}
            variant="secondary"
            onPress={() => acknowledge.mutate(item.id)}
          />
        </View>
      )}
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
    gap: spacing.sm,
  },
  rowDue: { borderColor: colors.warning, borderStartWidth: 4 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  number: { fontSize: 16, fontWeight: '700', color: colors.text, writingDirection: 'ltr' },
  amount: { fontSize: 16, color: colors.text, textAlign: 'right' },
  meta: { fontSize: 13, color: colors.textMuted, textAlign: 'right' },
  note: { fontSize: 14, color: colors.text, textAlign: 'right' },
  actions: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  snoozeChip: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  snoozeText: { fontSize: 14, color: colors.text },
});
