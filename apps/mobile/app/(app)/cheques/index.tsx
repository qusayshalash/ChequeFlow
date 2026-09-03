import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { utcToday, type ChequeSummaryView, type ChequeStatus } from '@cheque-flow/shared-types';
import { colors } from '@cheque-flow/ui/tokens';

import { IconAlert, IconArrowIn, IconArrowOut, IconFilter } from '@/components/icons';
import { useApi, useApp, useTranslator } from '@/components/providers';
import {
  Button,
  Chip,
  DateField,
  EmptyView,
  ErrorView,
  Field,
  LoadingView,
  Picker,
  SegmentedTabs,
  Sheet,
  StatusPill,
} from '@/components/ui';
import { TAP, accent, radius, space, surface, text, type } from '@/theme';

/**
 * The list tabs.
 *
 * Each is a saved filter rather than a separate screen, so a cheque only ever
 * appears through one code path and the tab a user is on is expressible as a
 * link (the dashboard tiles open straight into one).
 */
const TABS = ['ALL', 'INCOMING', 'OUTGOING', 'DUE', 'OVERDUE', 'BOUNCED'] as const;
type Tab = (typeof TABS)[number];

function isTab(value: string | undefined): value is Tab {
  return value !== undefined && (TABS as readonly string[]).includes(value);
}

/** Translates a tab into the query the API understands. */
function tabQuery(tab: Tab, today: string): Record<string, unknown> {
  switch (tab) {
    case 'INCOMING':
      return { direction: 'INCOMING' };
    case 'OUTGOING':
      return { direction: 'OUTGOING' };
    case 'DUE':
      // Everything still outstanding that is due today or already late.
      return { dueTo: today, overdue: undefined };
    case 'OVERDUE':
      return { overdue: 'true' };
    case 'BOUNCED':
      return { status: ['BOUNCED' as ChequeStatus] };
    default:
      return {};
  }
}

const SORTS = ['dueDate', 'amount', 'createdAt', 'chequeNumber'] as const;

export default function ChequeListScreen() {
  const api = useApi();
  const t = useTranslator();
  const { money, date, dueDistance } = useApp();
  const router = useRouter();
  const params = useLocalSearchParams<{
    tab?: string;
    status?: string;
    currency?: string;
  }>();

  const today = utcToday();

  const [tab, setTab] = useState<Tab>(isTab(params.tab) ? params.tab : 'ALL');
  const [search, setSearch] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Draft filter state lives separately so closing the sheet without applying
  // leaves the list exactly as it was.
  const [status, setStatus] = useState<string | null>(params.status ?? null);
  const [currency, setCurrency] = useState<string | null>(params.currency ?? null);
  const [dueFrom, setDueFrom] = useState('');
  const [dueTo, setDueTo] = useState('');
  const [amountMin, setAmountMin] = useState('');
  const [amountMax, setAmountMax] = useState('');
  const [sortBy, setSortBy] = useState<(typeof SORTS)[number]>('dueDate');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const filters = useMemo(
    () => ({
      ...tabQuery(tab, today),
      ...(search ? { search } : {}),
      ...(status ? { status: [status as ChequeStatus] } : {}),
      ...(currency ? { currency } : {}),
      ...(dueFrom ? { dueFrom } : {}),
      ...(dueTo ? { dueTo } : {}),
      ...(amountMin ? { amountMin } : {}),
      ...(amountMax ? { amountMax } : {}),
      sortBy,
      sortOrder,
      pageSize: 50,
    }),
    [tab, today, search, status, currency, dueFrom, dueTo, amountMin, amountMax, sortBy, sortOrder],
  );

  const query = useQuery({
    queryKey: ['cheques', filters],
    queryFn: () => api.listCheques(filters),
  });

  const activeFilterCount = [status, currency, dueFrom, dueTo, amountMin, amountMax].filter(
    Boolean,
  ).length;

  function clearFilters(): void {
    setStatus(null);
    setCurrency(null);
    setDueFrom('');
    setDueTo('');
    setAmountMin('');
    setAmountMax('');
  }

  return (
    <View style={styles.container}>
      <SegmentedTabs
        options={TABS.map((value) => ({
          value,
          label: t(
            value === 'ALL'
              ? 'cheque.tabAll'
              : value === 'INCOMING'
                ? 'cheque.tabIncoming'
                : value === 'OUTGOING'
                  ? 'cheque.tabOutgoing'
                  : value === 'DUE'
                    ? 'dashboard.dueToday'
                    : value === 'OVERDUE'
                      ? 'cheque.tabOverdue'
                      : 'cheque.tabBounced',
          ),
        }))}
        value={tab}
        onChange={(next) => setTab(next as Tab)}
      />

      <View style={styles.searchRow}>
        <TextInput
          style={styles.search}
          placeholder={t('common.search')}
          placeholderTextColor={colors.textMuted}
          value={search}
          onChangeText={setSearch}
          accessibilityLabel={t('common.search')}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('cheque.filterTitle')}
          onPress={() => setFiltersOpen(true)}
          style={styles.filterButton}
        >
          <IconFilter size={20} color={text.primary} />
          {activeFilterCount > 0 ? (
            <View style={styles.filterCount}>
              <Text style={styles.filterCountText}>{activeFilterCount}</Text>
            </View>
          ) : null}
        </Pressable>
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
        <FlatList<ChequeSummaryView>
          data={query.data.data}
          keyExtractor={(item) => item.id}
          refreshing={query.isRefetching}
          onRefresh={() => void query.refetch()}
          ListEmptyComponent={
            <EmptyView
              label={t('cheque.emptyList')}
              hint={activeFilterCount > 0 ? t('common.noResults') : undefined}
              actionLabel={t('cheque.addManually')}
              onAction={() => router.push('/(app)/cheques/new')}
            />
          }
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${item.chequeNumber} ${money(item.amount, item.currency)}`}
              style={({ pressed }) => [styles.row, pressed && styles.rowDown]}
              onPress={() => router.push(`/(app)/cheques/${item.id}`)}
            >
              {/* A late cheque is marked by a bar down its leading edge as well
                  as by the badge below: the row must still read as urgent in a
                  black-and-white printout or to someone who cannot see red. */}
              {item.isOverdue ? <View style={styles.overdueEdge} /> : null}

              <View style={styles.rowBody}>
                <View style={styles.rowTop}>
                  <Text style={styles.amount} numberOfLines={1}>
                    {money(item.amount, item.currency)}
                  </Text>
                  <StatusPill status={item.status} label={t(`status.${item.status}`)} />
                </View>

                <Text style={styles.party} numberOfLines={1}>
                  {item.drawerName ?? item.originalSourceName ?? t('common.unknown')}
                </Text>

                <View style={styles.rowBottom}>
                  <View style={styles.numberGroup}>
                    {item.direction === 'OUTGOING' ? (
                      <IconArrowOut size={14} color={text.faint} />
                    ) : (
                      <IconArrowIn size={14} color={text.faint} />
                    )}
                    <Text style={styles.number}>{item.chequeNumber}</Text>
                  </View>
                  <View style={styles.dueGroup}>
                    {item.isOverdue ? <IconAlert size={14} color={colors.danger} /> : null}
                    <Text style={[styles.due, item.isOverdue && styles.dueLate]}>
                      {date(item.dueDate)} · {dueDistance(item.dueDate, today)}
                    </Text>
                  </View>
                </View>
              </View>
            </Pressable>
          )}
        />
      ) : null}

      <Sheet
        visible={filtersOpen}
        title={t('cheque.filterTitle')}
        onClose={() => setFiltersOpen(false)}
      >
        <Picker
          label={t('cheque.status')}
          options={(
            [
              'DRAFT',
              'PENDING_REVIEW',
              'IN_HAND',
              'DEPOSITED',
              'CLEARED',
              'BOUNCED',
              'RETURNED',
              'POSTPONED',
              'CANCELLED',
            ] satisfies ChequeStatus[]
          ).map((value) => ({ value, label: t(`status.${value}`) }))}
          value={status}
          onChange={(next) => setStatus(next === status ? null : next)}
        />

        <Picker
          label={t('cheque.currency')}
          options={['ILS', 'USD', 'JOD', 'EUR'].map((value) => ({ value, label: value }))}
          value={currency}
          onChange={(next) => setCurrency(next === currency ? null : next)}
        />

        <DateField
          label={`${t('cheque.dueRange')} — ${t('cheque.from')}`}
          value={dueFrom}
          onChange={setDueFrom}
        />
        <DateField
          label={`${t('cheque.dueRange')} — ${t('cheque.to')}`}
          value={dueTo}
          onChange={setDueTo}
        />

        <Field
          label={`${t('cheque.amountRange')} — ${t('cheque.from')}`}
          value={amountMin}
          onChangeText={setAmountMin}
          keyboardType="numeric"
          ltr
        />
        <Field
          label={`${t('cheque.amountRange')} — ${t('cheque.to')}`}
          value={amountMax}
          onChangeText={setAmountMax}
          keyboardType="numeric"
          ltr
        />

        <Picker
          label={t('common.sort')}
          options={SORTS.map((value) => ({
            value,
            label: t(
              value === 'dueDate'
                ? 'cheque.sortDueDate'
                : value === 'amount'
                  ? 'cheque.sortAmount'
                  : value === 'createdAt'
                    ? 'cheque.sortCreatedAt'
                    : 'cheque.sortNumber',
            ),
          }))}
          value={sortBy}
          onChange={(next) => setSortBy(next as (typeof SORTS)[number])}
        />

        <View style={styles.chipRow}>
          <Chip label="↑" selected={sortOrder === 'asc'} onPress={() => setSortOrder('asc')} />
          <Chip label="↓" selected={sortOrder === 'desc'} onPress={() => setSortOrder('desc')} />
        </View>

        <Button label={t('common.apply')} onPress={() => setFiltersOpen(false)} large />
        <Button label={t('common.clear')} variant="secondary" onPress={clearFilters} />
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: surface.page, padding: space['4'], gap: space['3'] },

  searchRow: { flexDirection: 'row', gap: space['2'], alignItems: 'center' },
  search: {
    flex: 1,
    minHeight: TAP,
    borderWidth: 1,
    borderColor: surface.lineStrong,
    borderRadius: radius.md,
    backgroundColor: surface.card,
    paddingHorizontal: space['4'],
    ...type.body,
    color: text.primary,
    textAlign: 'right',
  },
  filterButton: {
    minWidth: TAP,
    minHeight: TAP,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: surface.lineStrong,
    backgroundColor: surface.card,
  },
  filterCount: {
    position: 'absolute',
    top: 2,
    right: 2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: accent.base,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterCountText: { color: text.onBrand, fontSize: 11, fontWeight: '700' },

  list: { gap: space['3'], paddingBottom: space['16'] },

  /**
   * A row, not a card of stacked labels.
   *
   * The amount leads because it is what people scan for, the party names the
   * cheque, and the number and date sit underneath as reference. The old row
   * opened with the cheque number — the one field nobody searches a list by.
   */
  row: {
    flexDirection: 'row',
    backgroundColor: surface.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: surface.line,
    overflow: 'hidden',
    minHeight: 92,
  },
  rowDown: { backgroundColor: surface.sunken },
  overdueEdge: { width: 4, backgroundColor: colors.danger },
  rowBody: { flex: 1, padding: space['4'], gap: space['1'] },

  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space['2'],
  },
  amount: { ...type.title, color: text.primary, flexShrink: 1, fontVariant: ['tabular-nums'] },
  party: { ...type.callout, color: text.secondary, textAlign: 'right' },

  rowBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space['2'],
    marginTop: space['1'],
  },
  numberGroup: { flexDirection: 'row', alignItems: 'center', gap: space['1'] },
  number: {
    ...type.caption,
    color: text.faint,
    writingDirection: 'ltr',
    fontVariant: ['tabular-nums'],
  },
  dueGroup: { flexDirection: 'row', alignItems: 'center', gap: space['1'] },
  due: { ...type.caption, color: text.secondary },
  dueLate: { color: colors.danger, fontWeight: '700' },

  chipRow: { flexDirection: 'row', gap: space['2'] },
});
