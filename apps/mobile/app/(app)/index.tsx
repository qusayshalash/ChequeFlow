import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useMemo, type ReactElement } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { utcToday, type DashboardSummary } from '@cheque-flow/shared-types';
import { colors } from '@cheque-flow/ui/tokens';

import { AttentionList, StatCard } from '@/components/dashboard-parts';
import {
  IconAlert,
  IconCalendar,
  IconCamera,
  IconCheque,
  IconChevronEnd,
  IconClock,
  IconEdit,
  IconReturn,
  IconWallet,
  type IconProps,
} from '@/components/icons';
import { BankMark } from '@/components/marks';
import { useApi, useApp, useTranslator } from '@/components/providers';
import { Banner, ErrorView, LoadingView, StatusPill } from '@/components/ui';
import { TAP, accent, elevation, radius, space, surface, text, type } from '@/theme';

/** How far ahead the upcoming list looks. */
const UPCOMING_HORIZON_DAYS = 90;
const UPCOMING_SHOWN = 5;

function addDays(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * The home screen.
 *
 * Rebuilt to the same shape as the web dashboard, so the two halves of the
 * product answer the question in the same order and a person moving between
 * them is not relearning the screen:
 *
 *   1. Four headline figures, largest scope first — everything, then what is
 *      coming, then what is late, then what is not yet confirmed.
 *   2. The worklist: what has to be looked at, with the count that decides
 *      whether it is worth opening.
 *   3. What is coming, as actual cheques rather than a number.
 *
 * The web's chart is deliberately not here. Thirty daily points on a phone is
 * a smudge, and the figures it summarises are already the four cards above it.
 *
 * Every row is a link into the filtered list, so the dashboard is a way in
 * rather than a wall of read-only numbers.
 */
export default function DashboardScreen() {
  const api = useApi();
  const t = useTranslator();
  const { money, date, dueDistance, online, checkConnection } = useApp();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const today = utcToday();

  const query = useQuery<DashboardSummary>({
    queryKey: ['dashboard'],
    queryFn: () => api.getDashboard(),
  });

  // Not tied to any chart window: "what is coming" is its own question, and on
  // a book whose next cheque is three weeks out a short horizon shows nothing.
  const due = useQuery({
    queryKey: ['dashboard-due'],
    queryFn: () =>
      api.getDueReport({
        from: today,
        to: addDays(today, UPCOMING_HORIZON_DAYS),
        includeOverdue: false,
      }),
  });

  const open = (params: string) => router.push(`/(app)/cheques?${params}`);

  /**
   * The figures behind the cards and the worklist.
   *
   * Counts are added across currencies — a cheque is a cheque — while the
   * money is listed per currency rather than summed into a figure that means
   * nothing. Adding shekels to dollars has no honest answer.
   */
  const totals = useMemo(() => {
    const blocks = query.data?.currencies ?? [];

    const bucket = (key: 'draft' | 'dueWithin7Days' | 'overdue' | 'bounced') => ({
      count: blocks.reduce((sum, entry) => sum + entry[key].count, 0),
      money: blocks
        .filter((entry) => entry[key].count > 0)
        .map((entry) => money(entry[key].total, entry.currency))
        .join(' · '),
    });

    return {
      draft: bucket('draft'),
      dueSoon: bucket('dueWithin7Days'),
      overdue: bucket('overdue'),
      bounced: bucket('bounced'),
    };
  }, [query.data, money]);

  const upcomingAll = due.data?.cheques ?? [];
  const upcoming = upcomingAll.slice(0, UPCOMING_SHOWN);

  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={[styles.container, { paddingTop: insets.top + space['4'] }]}
      refreshControl={
        <RefreshControl
          refreshing={query.isRefetching}
          onRefresh={() => {
            void query.refetch();
            void due.refetch();
          }}
        />
      }
    >
      <Text style={styles.pageTitle}>{t('dashboard.title')}</Text>
      <Text style={styles.pageSubtitle}>{t('dashboard.subtitle')}</Text>

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
          <View style={styles.statGrid}>
            <StatCard
              label={t('dashboard.totalCheques')}
              value={String(query.data.baseTotal.count)}
              amountLabel={t('dashboard.totalAmount')}
              amount={money(query.data.baseTotal.total, query.data.baseTotal.currency)}
              tone="teal"
              Icon={IconCheque}
              onPress={() => open('tab=ALL')}
            />
            <StatCard
              label={t('dashboard.dueWithin7Days')}
              value={String(totals.dueSoon.count)}
              amountLabel={t('dashboard.totalAmount')}
              amount={totals.dueSoon.money}
              tone="green"
              Icon={IconCalendar}
              onPress={() => open('tab=DUE')}
            />
            <StatCard
              label={t('dashboard.overdue')}
              value={String(totals.overdue.count)}
              amountLabel={t('dashboard.totalAmount')}
              amount={totals.overdue.money}
              tone="red"
              Icon={IconAlert}
              onPress={() => open('tab=OVERDUE')}
            />
            <StatCard
              label={t('dashboard.pendingConfirm')}
              value={String(totals.draft.count)}
              amountLabel={t('dashboard.totalAmount')}
              amount={totals.draft.money}
              tone="amber"
              Icon={IconClock}
              onPress={() => open('tab=ALL')}
            />
          </View>

          {/* Beside the base figure rather than in a banner of its own: it is a
              caveat on that one number, not on the screen. */}
          {query.data.baseTotal.unconvertedCount > 0 ? (
            <View style={styles.warn}>
              <IconAlert size={14} color={colors.warning} />
              <Text style={styles.warnText}>
                {t('dashboard.unconverted', {
                  count: String(query.data.baseTotal.unconvertedCount),
                })}
              </Text>
            </View>
          ) : null}

          <AttentionList
            title={t('dashboard.needsYourAttention')}
            footerLabel={t('dashboard.viewAllAlerts')}
            onFooterPress={() => router.push('/(app)/more/notifications')}
            items={[
              {
                key: 'overdue',
                label: t('dashboard.overdueCheques'),
                count: totals.overdue.count,
                amount: totals.overdue.money,
                tone: 'red',
                Icon: IconAlert,
                onPress: () => open('tab=OVERDUE'),
              },
              {
                key: 'due-soon',
                label: t('dashboard.chequesWithin7'),
                count: totals.dueSoon.count,
                amount: totals.dueSoon.money,
                tone: 'amber',
                Icon: IconCalendar,
                onPress: () => open('tab=DUE'),
              },
              {
                key: 'bounced',
                label: t('dashboard.bouncedCheques'),
                count: totals.bounced.count,
                amount: totals.bounced.money,
                tone: 'teal',
                Icon: IconReturn,
                onPress: () => open('tab=BOUNCED'),
              },
              {
                key: 'pending',
                label: t('dashboard.pendingConfirm'),
                count: totals.draft.count,
                amount: totals.draft.money,
                tone: 'neutral',
                Icon: IconClock,
                onPress: () => open('tab=ALL'),
              },
            ]}
          />

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

          <View style={styles.panel}>
            <View style={styles.panelHead}>
              <Pressable
                accessibilityRole="button"
                onPress={() => open('tab=DUE')}
                style={({ pressed }) => [styles.viewAll, pressed && styles.pressed]}
              >
                <IconChevronEnd size={15} color={text.secondary} />
                <Text style={styles.viewAllText}>{t('dashboard.viewAllCheques')}</Text>
              </Pressable>
              <Text style={styles.panelTitle}>{t('dashboard.upcomingTitle')}</Text>
            </View>

            {due.isPending ? <LoadingView label={t('common.loading')} /> : null}

            {!due.isPending && upcoming.length === 0 ? (
              <Text style={styles.emptyLine}>{t('cheque.emptyList')}</Text>
            ) : null}

            {upcoming.map((cheque, index) => (
              <Pressable
                key={cheque.id}
                accessibilityRole="button"
                accessibilityLabel={`${cheque.chequeNumber} ${money(cheque.amount, cheque.currency)}`}
                onPress={() => router.push(`/(app)/cheques/${cheque.id}`)}
                style={({ pressed }) => [
                  styles.upcomingRow,
                  index > 0 && styles.divided,
                  pressed && styles.pressed,
                ]}
              >
                <BankMark name={cheque.bankName} size={34} />

                <View style={styles.upcomingBody}>
                  <View style={styles.upcomingTop}>
                    <Text style={styles.upcomingAmount} numberOfLines={1}>
                      {money(cheque.amount, cheque.currency)}
                    </Text>
                    <Text style={styles.upcomingNumber}>{cheque.chequeNumber}</Text>
                  </View>
                  <View style={styles.upcomingBottom}>
                    <StatusPill status={cheque.status} label={t(`status.${cheque.status}`)} />
                    <View style={styles.upcomingDue}>
                      <Text style={styles.upcomingDate}>{date(cheque.dueDate)}</Text>
                      <Text style={styles.upcomingDistance}>
                        {dueDistance(cheque.dueDate, today)}
                      </Text>
                    </View>
                  </View>
                </View>
              </Pressable>
            ))}

            {/* Says what is not shown. Without it a person cannot tell five
                upcoming cheques from fifty. */}
            {upcomingAll.length > 0 ? (
              <Text style={styles.showingLine}>
                {t('dashboard.showingOfUpcoming', {
                  shown: String(upcoming.length),
                  total: String(upcomingAll.length),
                })}
              </Text>
            ) : null}
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

/** One of the three things staff do all day. */
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
      style={({ pressed }) => [styles.quick, pressed && styles.pressed]}
    >
      <Icon size={20} color={accent.base} />
      <Text style={styles.quickLabel} numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: 'transparent' },
  container: { padding: space['4'], paddingBottom: space['10'], gap: space['3'] },
  pressed: { backgroundColor: surface.sunken },

  pageTitle: { ...type.title, color: text.primary, textAlign: 'right' },
  pageSubtitle: {
    ...type.callout,
    color: text.secondary,
    textAlign: 'right',
    marginTop: -space['2'],
    marginBottom: space['1'],
  },

  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space['2'] },

  warn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space['2'],
    backgroundColor: '#FBEEDA',
    borderRadius: radius.md,
    padding: space['3'],
  },
  warnText: { ...type.caption, color: '#7A4A06', flex: 1, textAlign: 'right' },

  quickRow: { flexDirection: 'row', gap: space['2'] },
  quick: {
    flex: 1,
    minHeight: 76,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space['1'],
    backgroundColor: surface.card,
    borderRadius: radius.xl,
    ...elevation[2],
    padding: space['2'],
  },
  quickLabel: { ...type.caption, color: text.primary, textAlign: 'center' },

  panel: {
    backgroundColor: surface.card,
    borderRadius: radius.xl,
    ...elevation[2],
    padding: space['3'],
  },
  panelHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space['2'],
  },
  panelTitle: { ...type.heading, color: text.primary },
  viewAll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space['1'],
    minHeight: 34,
    paddingHorizontal: space['2'],
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: surface.line,
  },
  viewAllText: { ...type.caption, color: text.secondary },

  upcomingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space['3'],
    minHeight: TAP + 16,
    paddingVertical: space['2'],
  },
  divided: { borderTopWidth: 1, borderTopColor: surface.line },
  upcomingBody: { flex: 1, gap: 3 },
  upcomingTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  upcomingAmount: { ...type.bodyStrong, color: text.primary },
  upcomingNumber: { ...type.caption, color: text.faint, writingDirection: 'ltr' },
  upcomingBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  upcomingDue: { alignItems: 'flex-start' },
  upcomingDate: { ...type.caption, color: text.secondary },
  upcomingDistance: { ...type.caption, fontSize: 11, color: text.faint },

  emptyLine: {
    ...type.callout,
    color: text.faint,
    textAlign: 'center',
    paddingVertical: space['4'],
  },
  showingLine: {
    ...type.caption,
    fontSize: 11,
    color: text.faint,
    textAlign: 'center',
    marginTop: space['2'],
  },
});
