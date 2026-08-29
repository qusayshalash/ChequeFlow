import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { formatMoney } from '@cheque-flow/localization';
import type { DashboardSummary } from '@cheque-flow/shared-types';
import { colors, spacing } from '@cheque-flow/ui/tokens';

import { useApi, useApp, useTranslator } from '@/components/providers';
import { Body, Button, Card, ErrorView, Heading, LoadingView } from '@/components/ui';

export default function DashboardScreen() {
  const api = useApi();
  const t = useTranslator();
  const { locale } = useApp();
  const router = useRouter();

  const query = useQuery<DashboardSummary>({
    queryKey: ['dashboard'],
    queryFn: () => api.getDashboard(),
  });

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* The primary action of the whole app: capture a cheque. */}
      <Button label={t('capture.button')} onPress={() => router.push('/(app)/capture')} large />

      {query.isPending ? <LoadingView label={t('common.loading')} /> : null}

      {query.isError ? (
        <ErrorView
          label={t('errors.network')}
          onRetry={() => void query.refetch()}
          retryLabel={t('common.retry')}
        />
      ) : null}

      {query.data ? (
        <>
          <View style={styles.grid}>
            <Stat
              label={t('dashboard.inHandCount')}
              value={String(query.data.inHandCount)}
              hint={formatMoney(locale, query.data.inHandTotal, query.data.currency)}
            />
            <Stat
              label={t('dashboard.dueToday')}
              value={String(query.data.dueTodayCount)}
              hint={formatMoney(locale, query.data.dueTodayTotal, query.data.currency)}
            />
            <Stat
              label={t('dashboard.dueWithin7Days')}
              value={String(query.data.dueWithin7DaysCount)}
              hint={formatMoney(locale, query.data.dueWithin7DaysTotal, query.data.currency)}
            />
            <Stat
              label={t('dashboard.bounced')}
              value={String(query.data.bouncedCount)}
              hint={formatMoney(locale, query.data.bouncedTotal, query.data.currency)}
            />
          </View>

          <Card>
            <Heading>{t('dashboard.recentActivity')}</Heading>
            {query.data.recentEvents.length === 0 ? (
              <Body muted>{t('dashboard.emptyActivity')}</Body>
            ) : (
              query.data.recentEvents.slice(0, 5).map((event) => (
                <Body key={event.id}>
                  {t(`event.${event.eventType}`)}
                  {event.performedByName ? ` — ${event.performedByName}` : ''}
                </Body>
              ))
            )}
          </Card>
        </>
      ) : null}

      <View style={styles.links}>
        <Button
          label={t('cheque.listTitle')}
          variant="secondary"
          onPress={() => router.push('/(app)/cheques')}
        />
        <Button
          label={t('nav.notifications')}
          variant="secondary"
          onPress={() => router.push('/(app)/notifications')}
        />
        <Button
          label={t('contact.title')}
          variant="secondary"
          onPress={() => router.push('/(app)/contacts')}
        />
        <Button
          label={t('nav.settings')}
          variant="secondary"
          onPress={() => router.push('/(app)/settings')}
        />
      </View>
    </ScrollView>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statHint}>{hint}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.md, gap: spacing.md, backgroundColor: colors.surfaceMuted },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  stat: {
    flexGrow: 1,
    flexBasis: '45%',
    backgroundColor: colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 2,
  },
  statLabel: { fontSize: 13, color: colors.textMuted, textAlign: 'right' },
  statValue: { fontSize: 24, fontWeight: '700', color: colors.text, textAlign: 'right' },
  statHint: { fontSize: 13, color: colors.textMuted, textAlign: 'right' },
  links: { gap: spacing.sm, paddingBottom: spacing.xl },
});
