import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { Bucket, DashboardCurrencyTotals, DashboardSummary } from '@cheque-flow/shared-types';
import { colors, radius, spacing } from '@cheque-flow/ui/tokens';

import { useApi, useApp, useTranslator } from '@/components/providers';
import { Banner, Body, Card, EmptyView, ErrorView, Heading, LoadingView } from '@/components/ui';

export default function DashboardScreen() {
  const api = useApi();
  const t = useTranslator();
  const { money, dateTime, online, checkConnection } = useApp();
  const router = useRouter();

  const query = useQuery<DashboardSummary>({
    queryKey: ['dashboard'],
    queryFn: () => api.getDashboard(),
  });

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />
      }
    >
      {!online ? (
        <Banner
          text={t('common.offline')}
          actionLabel={t('common.syncNow')}
          onAction={() => {
            void checkConnection().then(() => query.refetch());
          }}
        />
      ) : null}

      <Heading>{t('dashboard.title')}</Heading>

      {/* The three things staff do all day, one tap from the home screen. */}
      <View style={styles.quickActions}>
        <QuickAction
          label={t('cheque.captureNew')}
          glyph="📷"
          onPress={() => router.push('/(app)/capture')}
        />
        <QuickAction
          label={t('cheque.addManually')}
          glyph="✏️"
          onPress={() => router.push('/(app)/cheques/new')}
        />
        <QuickAction
          label={t('dashboard.recordCollection')}
          glyph="✅"
          onPress={() => router.push('/(app)/cheques?tab=DUE')}
        />
      </View>

      {query.isPending ? <LoadingView label={t('common.loading')} /> : null}

      {query.isError ? (
        <ErrorView
          label={t('errors.loadFailed')}
          onRetry={() => void query.refetch()}
          retryLabel={t('common.retry')}
        />
      ) : null}

      {query.data ? (
        <>
          {query.data.currencies.length > 1 ? (
            <Body muted>{t('dashboard.currencyNote')}</Body>
          ) : null}

          {query.data.currencies.map((totals) => (
            <CurrencyBlock
              key={totals.currency}
              totals={totals}
              t={t}
              money={money}
              onOpen={(params) => router.push(`/(app)/cheques?${params}`)}
            />
          ))}

          <Card>
            <Text style={styles.sectionTitle}>{t('dashboard.recentActivity')}</Text>
            {query.data.recentEvents.length === 0 ? (
              <EmptyView label={t('dashboard.emptyActivity')} />
            ) : (
              query.data.recentEvents.map((event) => (
                <Pressable
                  key={event.id}
                  accessibilityRole="button"
                  style={styles.activityRow}
                  onPress={() => router.push(`/(app)/cheques/${event.chequeId}/timeline`)}
                >
                  <View style={styles.activityHeader}>
                    <Text style={styles.activityNumber}>{event.chequeNumber}</Text>
                    <Text style={styles.activityTime}>{dateTime(event.eventDate)}</Text>
                  </View>
                  <Text style={styles.activityBody}>
                    {t(`event.${event.eventType}`)}
                    {event.toStatus ? ` — ${t(`status.${event.toStatus}`)}` : ''}
                  </Text>
                  {event.performedByName ? (
                    <Text style={styles.activityMeta}>
                      {t('event.performedBy')}: {event.performedByName}
                    </Text>
                  ) : null}
                </Pressable>
              ))
            )}
          </Card>
        </>
      ) : null}
    </ScrollView>
  );
}

/** All the figures for one currency. Never combined with another currency. */
function CurrencyBlock({
  totals,
  t,
  money,
  onOpen,
}: {
  totals: DashboardCurrencyTotals;
  t: (key: string) => string;
  money: (amount: string, currency: string) => string;
  onOpen: (queryString: string) => void;
}) {
  const stat = (label: string, bucket: Bucket, filter: string, tone?: 'danger' | 'warning') => (
    <Stat
      label={label}
      bucket={bucket}
      currency={totals.currency}
      money={money}
      tone={tone}
      onPress={() => onOpen(`${filter}&currency=${totals.currency}`)}
    />
  );

  return (
    <View style={styles.currencyBlock}>
      <Text style={styles.currencyTitle}>{totals.currency}</Text>
      <View style={styles.grid}>
        {stat(t('dashboard.draft'), totals.draft, 'tab=ALL&status=DRAFT')}
        {stat(t('dashboard.inHandCount'), totals.inHand, 'tab=ALL&status=IN_HAND')}
        {stat(t('dashboard.dueToday'), totals.dueToday, 'tab=DUE', 'warning')}
        {stat(t('dashboard.dueWithin7Days'), totals.dueWithin7Days, 'tab=DUE')}
        {stat(t('dashboard.dueWithin30Days'), totals.dueWithin30Days, 'tab=DUE')}
        {stat(t('dashboard.overdue'), totals.overdue, 'tab=OVERDUE', 'danger')}
        {stat(t('dashboard.deposited'), totals.deposited, 'tab=ALL&status=DEPOSITED')}
        {stat(t('dashboard.cleared'), totals.cleared, 'tab=ALL&status=CLEARED')}
        {stat(t('dashboard.bounced'), totals.bounced, 'tab=BOUNCED', 'danger')}
        {stat(t('dashboard.returned'), totals.returned, 'tab=ALL&status=RETURNED', 'warning')}
        {stat(t('dashboard.incoming'), totals.incoming, 'tab=INCOMING')}
        {stat(t('dashboard.outgoing'), totals.outgoing, 'tab=OUTGOING')}
      </View>
    </View>
  );
}

function Stat({
  label,
  bucket,
  currency,
  money,
  tone,
  onPress,
}: {
  label: string;
  bucket: Bucket;
  currency: string;
  money: (amount: string, currency: string) => string;
  tone?: 'danger' | 'warning';
  onPress: () => void;
}) {
  const accent =
    tone === 'danger' ? colors.danger : tone === 'warning' ? colors.warning : colors.text;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${bucket.count}`}
      onPress={onPress}
      style={({ pressed }) => [styles.stat, pressed && styles.statPressed]}
    >
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, { color: accent }]}>{bucket.count}</Text>
      <Text style={styles.statHint}>{money(bucket.total, currency)}</Text>
    </Pressable>
  );
}

function QuickAction({
  label,
  glyph,
  onPress,
}: {
  label: string;
  glyph: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.quickAction, pressed && styles.statPressed]}
    >
      <Text style={styles.quickGlyph}>{glyph}</Text>
      <Text style={styles.quickLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.md,
    gap: spacing.md,
    backgroundColor: colors.surfaceMuted,
    paddingBottom: spacing.xxl,
  },
  quickActions: { flexDirection: 'row', gap: spacing.sm },
  quickAction: {
    flex: 1,
    minHeight: 92,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
  },
  quickGlyph: { fontSize: 26 },
  quickLabel: { fontSize: 13, color: colors.text, textAlign: 'center' },

  currencyBlock: { gap: spacing.sm },
  currencyTitle: { fontSize: 18, fontWeight: '700', color: colors.text, textAlign: 'right' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  stat: {
    flexGrow: 1,
    flexBasis: '30%',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 2,
    minHeight: 92,
  },
  statPressed: { opacity: 0.75 },
  statLabel: { fontSize: 13, color: colors.textMuted, textAlign: 'right' },
  statValue: { fontSize: 24, fontWeight: '700', textAlign: 'right' },
  statHint: { fontSize: 12, color: colors.textMuted, textAlign: 'right' },

  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.text, textAlign: 'right' },
  activityRow: {
    gap: 2,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  activityHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  activityNumber: { fontSize: 14, fontWeight: '700', color: colors.brand, writingDirection: 'ltr' },
  activityTime: { fontSize: 12, color: colors.textMuted },
  activityBody: { fontSize: 15, color: colors.text, textAlign: 'right' },
  activityMeta: { fontSize: 13, color: colors.textMuted, textAlign: 'right' },
});
