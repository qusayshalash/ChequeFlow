import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import type { ReactElement } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Bucket, DashboardCurrencyTotals, DashboardSummary } from '@cheque-flow/shared-types';
import { colors } from '@cheque-flow/ui/tokens';

import {
  IconAlert,
  IconCamera,
  IconCheck,
  IconChevronEnd,
  IconClock,
  IconEdit,
  IconWallet,
  type IconProps,
} from '@/components/icons';
import { useApi, useApp, useTranslator } from '@/components/providers';
import { Banner, ErrorView, LoadingView } from '@/components/ui';
import { TAP, accent, radius, space, surface, text, type } from '@/theme';

/**
 * The home screen.
 *
 * It used to be a grid of twelve identical tiles — one per bucket, per
 * currency. Nine of them normally read zero, the two figures that matter had no
 * more weight than the nine that did not, and the whole thing needed two
 * scrolls before a single decision could be made.
 *
 * This is built the other way round, from the question the person opening it
 * actually has: *is there anything I have to do today?*
 *
 *   1. One number — what is owed and still uncollected.
 *   2. What needs action, and only when it does. A bucket at zero is not a
 *      status worth a card; it is the absence of work, and it is left out.
 *   3. The three things staff do all day.
 *   4. What just happened.
 *
 * Every row is a link into the filtered list, so the dashboard is a way in
 * rather than a wall of read-only numbers.
 */
export default function DashboardScreen() {
  const api = useApi();
  const t = useTranslator();
  const { money, dateTime, online, checkConnection } = useApp();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const query = useQuery<DashboardSummary>({
    queryKey: ['dashboard'],
    queryFn: () => api.getDashboard(),
  });

  const open = (params: string) => router.push(`/(app)/cheques?${params}`);

  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={[styles.container, { paddingTop: insets.top + space['4'] }]}
      refreshControl={
        <RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />
      }
    >
      <Text style={styles.pageTitle}>{t('dashboard.title')}</Text>

      {!online ? (
        <Banner
          text={t('common.offline')}
          actionLabel={t('common.syncNow')}
          onAction={() => {
            void checkConnection();
            void query.refetch();
          }}
        />
      ) : null}

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
          {/* One figure, given the room a headline deserves. Everything else on
              the screen is a route to acting on it. */}
          <Pressable
            accessibilityRole="button"
            onPress={() => open('tab=ALL')}
            style={({ pressed }) => [styles.hero, pressed && styles.heroDown]}
          >
            <Text style={styles.heroLabel}>{t('dashboard.baseTotal')}</Text>
            <Text style={styles.heroValue} numberOfLines={1} adjustsFontSizeToFit>
              {money(query.data.baseTotal.total, query.data.baseTotal.currency)}
            </Text>
            <Text style={styles.heroHint}>
              {query.data.baseTotal.count} · {t('dashboard.baseTotalHint')}
            </Text>
            {query.data.baseTotal.unconvertedCount > 0 ? (
              <View style={styles.heroWarn}>
                <IconAlert size={14} color={colors.warning} />
                <Text style={styles.heroWarnText}>
                  {t('dashboard.unconverted', {
                    count: String(query.data.baseTotal.unconvertedCount),
                  })}
                </Text>
              </View>
            ) : null}
          </Pressable>

          <NeedsAction data={query.data} t={t} money={money} onOpen={open} />

          <View style={styles.quickRow}>
            <QuickAction
              label={t('cheque.captureNew')}
              Icon={IconCamera}
              onPress={() => router.push('/(app)/capture')}
            />
            <QuickAction
              label={t('cheque.addManually')}
              Icon={IconEdit}
              onPress={() => router.push('/(app)/cheques/new')}
            />
            <QuickAction
              label={t('cheque.batchMode')}
              Icon={IconWallet}
              onPress={() => router.push('/(app)/cheques/batch')}
            />
          </View>

          <Text style={styles.sectionTitle}>{t('dashboard.recentActivity')}</Text>
          <View style={styles.card}>
            {query.data.recentEvents.length === 0 ? (
              <Text style={styles.emptyLine}>{t('dashboard.emptyActivity')}</Text>
            ) : (
              query.data.recentEvents.slice(0, 6).map((event, index) => (
                <Pressable
                  key={event.id}
                  accessibilityRole="button"
                  onPress={() => router.push(`/(app)/cheques/${event.chequeId}/timeline`)}
                  style={({ pressed }) => [
                    styles.activityRow,
                    index > 0 && styles.divided,
                    pressed && styles.rowDown,
                  ]}
                >
                  <View style={styles.activityMain}>
                    <Text style={styles.activityBody} numberOfLines={1}>
                      {t(`event.${event.eventType}`)}
                      {event.toStatus ? ` — ${t(`status.${event.toStatus}`)}` : ''}
                    </Text>
                    <Text style={styles.activityMeta}>{dateTime(event.eventDate)}</Text>
                  </View>
                  <Text style={styles.activityNumber}>{event.chequeNumber}</Text>
                </Pressable>
              ))
            )}
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

/** One thing that needs doing, as a row rather than a tile. */
interface ActionItem {
  key: string;
  label: string;
  bucket: Bucket;
  currency: string;
  filter: string;
  tone: 'danger' | 'warning' | 'neutral';
}

/**
 * The work waiting, and nothing else.
 *
 * Buckets at zero are dropped before rendering: a card reading "0 مرتجعة" is
 * not reassurance, it is a line to read past on the way to the one that is not
 * zero. When every bucket is empty the screen says so in one sentence.
 */
function NeedsAction({
  data,
  t,
  money,
  onOpen,
}: {
  data: DashboardSummary;
  t: (key: string, vars?: Record<string, string>) => string;
  money: (amount: string, currency: string) => string;
  onOpen: (params: string) => void;
}) {
  const items: ActionItem[] = [];

  const add = (
    currency: DashboardCurrencyTotals,
    key: string,
    label: string,
    bucket: Bucket,
    filter: string,
    tone: ActionItem['tone'],
  ) => {
    if (bucket.count > 0) {
      items.push({
        key: `${currency.currency}-${key}`,
        label,
        bucket,
        currency: currency.currency,
        filter,
        tone,
      });
    }
  };

  for (const currency of data.currencies) {
    add(currency, 'overdue', t('dashboard.overdue'), currency.overdue, 'tab=OVERDUE', 'danger');
    add(currency, 'bounced', t('cheque.tabBounced'), currency.bounced, 'tab=BOUNCED', 'danger');
    add(currency, 'today', t('dashboard.dueToday'), currency.dueToday, 'tab=DUE', 'warning');
    add(
      currency,
      'week',
      t('dashboard.dueWithin7Days'),
      currency.dueWithin7Days,
      'tab=DUE',
      'warning',
    );
    add(currency, 'draft', t('dashboard.draft'), currency.draft, 'tab=ALL', 'neutral');
  }

  if (items.length === 0) {
    return (
      <View style={styles.allClear}>
        <IconCheck size={20} color={accent.base} />
        <Text style={styles.allClearText}>{t('dashboard.allClear')}</Text>
      </View>
    );
  }

  return (
    <>
      <Text style={styles.sectionTitle}>{t('dashboard.needsAction')}</Text>
      <View style={styles.card}>
        {items.map((item, index) => (
          <Pressable
            key={item.key}
            accessibilityRole="button"
            accessibilityLabel={`${item.label}: ${String(item.bucket.count)}`}
            onPress={() => onOpen(item.filter)}
            style={({ pressed }) => [
              styles.actionRow,
              index > 0 && styles.divided,
              pressed && styles.rowDown,
            ]}
          >
            {/* A count is not a status. The icon and the word carry the meaning
                so the colour is never doing it alone. */}
            {item.tone === 'danger' ? (
              <IconAlert size={18} color={colors.danger} />
            ) : item.tone === 'warning' ? (
              <IconClock size={18} color={colors.warning} />
            ) : (
              <IconEdit size={18} color={text.secondary} />
            )}

            <View style={styles.actionMain}>
              <Text style={styles.actionLabel}>{item.label}</Text>
              <Text style={styles.actionMoney}>{money(item.bucket.total, item.currency)}</Text>
            </View>

            <Text
              style={[
                styles.actionCount,
                item.tone === 'danger' && styles.countDanger,
                item.tone === 'warning' && styles.countWarning,
              ]}
            >
              {item.bucket.count}
            </Text>
            <IconChevronEnd size={18} color={text.faint} />
          </Pressable>
        ))}
      </View>
    </>
  );
}

function QuickAction({
  label,
  Icon,
  onPress,
}: {
  label: string;
  Icon: (props: IconProps) => ReactElement;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.quick, pressed && styles.quickDown]}
    >
      <Icon size={20} color={accent.base} />
      <Text style={styles.quickLabel} numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: surface.page },
  container: { padding: space['4'], paddingBottom: space['12'], gap: space['4'] },
  pageTitle: { ...type.display, color: text.primary, textAlign: 'right' },

  hero: {
    backgroundColor: accent.dark,
    borderRadius: radius.lg,
    padding: space['5'],
    gap: space['1'],
  },
  heroDown: { backgroundColor: accent.base },
  heroLabel: { ...type.label, color: 'rgba(255,255,255,0.75)', textAlign: 'right' },
  heroValue: { ...type.display, fontSize: 34, color: text.onBrand, textAlign: 'right' },
  heroHint: { ...type.caption, color: 'rgba(255,255,255,0.65)', textAlign: 'right' },
  heroWarn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space['2'],
    marginTop: space['2'],
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: radius.sm,
    paddingHorizontal: space['3'],
    paddingVertical: space['2'],
  },
  heroWarnText: { ...type.caption, color: '#FFE7C2', flex: 1, textAlign: 'right' },

  sectionTitle: { ...type.label, color: text.secondary, textAlign: 'right' },
  card: {
    backgroundColor: surface.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: surface.line,
    overflow: 'hidden',
  },
  divided: { borderTopWidth: 1, borderTopColor: surface.line },
  rowDown: { backgroundColor: surface.sunken },

  actionRow: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space['3'],
    paddingHorizontal: space['4'],
    paddingVertical: space['3'],
  },
  actionMain: { flex: 1, gap: 1 },
  actionLabel: { ...type.bodyStrong, color: text.primary, textAlign: 'right' },
  actionMoney: { ...type.caption, color: text.secondary, textAlign: 'right' },
  actionCount: { ...type.title, color: text.primary, minWidth: 28, textAlign: 'center' },
  countDanger: { color: colors.danger },
  countWarning: { color: colors.warning },

  allClear: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space['3'],
    backgroundColor: accent.wash,
    borderRadius: radius.lg,
    padding: space['4'],
  },
  allClearText: { ...type.bodyStrong, color: accent.dark, flex: 1, textAlign: 'right' },

  quickRow: { flexDirection: 'row', gap: space['3'] },
  quick: {
    flex: 1,
    minHeight: TAP + 28,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space['2'],
    backgroundColor: surface.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: surface.line,
    paddingVertical: space['3'],
    paddingHorizontal: space['2'],
  },
  quickDown: { backgroundColor: accent.wash, borderColor: accent.base },
  quickLabel: { ...type.caption, color: text.primary, textAlign: 'center' },

  activityRow: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space['3'],
    paddingHorizontal: space['4'],
    paddingVertical: space['3'],
  },
  activityMain: { flex: 1, gap: 1 },
  activityBody: { ...type.callout, color: text.primary, textAlign: 'right' },
  activityMeta: { ...type.caption, color: text.faint, textAlign: 'right' },
  activityNumber: {
    ...type.label,
    color: accent.base,
    writingDirection: 'ltr',
    fontVariant: ['tabular-nums'],
  },
  emptyLine: { ...type.callout, color: text.secondary, padding: space['4'], textAlign: 'center' },
});
