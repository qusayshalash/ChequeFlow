import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, Text } from 'react-native';

import { formatDateTime } from '@cheque-flow/localization';
import type { ChequeEventView } from '@cheque-flow/shared-types';
import { colors, spacing } from '@cheque-flow/ui/tokens';

import { useApi, useApp, useTranslator } from '@/components/providers';
import { Card, EmptyView, LoadingView } from '@/components/ui';

/** Read-only ledger: events can never be edited or deleted. */
export default function ChequeTimelineScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const api = useApi();
  const t = useTranslator();
  const { locale } = useApp();

  const query = useQuery<{ data: ChequeEventView[] }>({
    queryKey: ['cheque-events', id],
    queryFn: () => api.listChequeEvents(id),
    enabled: Boolean(id),
  });

  if (query.isPending) return <LoadingView label={t('common.loading')} />;
  if (!query.data || query.data.data.length === 0) {
    return <EmptyView label={t('dashboard.emptyActivity')} />;
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {query.data.data.map((event) => (
        <Card key={event.id}>
          <Text style={styles.title}>{t(`event.${event.eventType}`)}</Text>
          {event.toStatus ? (
            <Text style={styles.meta}>
              {event.fromStatus ? `${t(`status.${event.fromStatus}`)} ← ` : ''}
              {t(`status.${event.toStatus}`)}
            </Text>
          ) : null}
          {event.toContactName ? (
            <Text style={styles.meta}>
              {t('cheque.currentRecipient')}: {event.toContactName}
            </Text>
          ) : null}
          {event.toLocationName ? (
            <Text style={styles.meta}>
              {t('cheque.currentLocation')}: {event.toLocationName}
            </Text>
          ) : null}
          {event.notes ? <Text style={styles.meta}>{event.notes}</Text> : null}
          <Text style={styles.stamp}>
            {formatDateTime(locale, event.createdAt)}
            {event.performedByName ? ` · ${event.performedByName}` : ''}
          </Text>
        </Card>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.md, gap: spacing.sm, backgroundColor: colors.surfaceMuted },
  title: { fontSize: 16, fontWeight: '700', color: colors.text, textAlign: 'right' },
  meta: { fontSize: 14, color: colors.textMuted, textAlign: 'right' },
  stamp: { fontSize: 12, color: colors.textMuted, textAlign: 'right' },
});
