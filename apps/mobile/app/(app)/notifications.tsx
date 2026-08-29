import { useQuery } from '@tanstack/react-query';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing } from '@cheque-flow/ui/tokens';

import { useApi, useTranslator } from '@/components/providers';
import { EmptyView, LoadingView } from '@/components/ui';

interface NotificationRow {
  id: string;
  type: string;
  remindAt: string;
  cheque: { chequeNumber: string; amount: string; currency: string; dueDate: string };
}

/**
 * In-app reminders. Push delivery is prepared on the API side (the reminder
 * rows carry a channel) and is enabled in a later phase.
 */
export default function NotificationsScreen() {
  const api = useApi();
  const t = useTranslator();

  const query = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.listNotifications(50),
  });

  if (query.isPending) return <LoadingView label={t('common.loading')} />;

  const rows = (query.data?.data ?? []) as NotificationRow[];

  return (
    <View style={styles.container}>
      <FlatList<NotificationRow>
        data={rows}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={<EmptyView label={t('reminders.empty')} />}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.title}>{item.cheque.chequeNumber}</Text>
            <Text style={styles.meta}>
              {t('cheque.dueDate')}: {item.cheque.dueDate}
            </Text>
            <Text style={styles.meta}>
              {item.cheque.amount} {item.cheque.currency}
            </Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceMuted, padding: spacing.md },
  list: { gap: spacing.sm },
  row: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 2,
  },
  title: { fontSize: 16, fontWeight: '600', color: colors.text, textAlign: 'right' },
  meta: { fontSize: 13, color: colors.textMuted, textAlign: 'right' },
});
