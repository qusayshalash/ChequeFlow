import { useQueries, useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import {
  utcToday,
  type ChequeStatus,
  type ChequeSummaryView,
  type Paginated,
} from '@cheque-flow/shared-types';
import { colors } from '@cheque-flow/ui/tokens';

import { IconAlert, IconArrowIn, IconArrowOut, IconFilter } from '@/components/icons';
import { BankMark } from '@/components/marks';
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
import { TAP, accent, elevation, radius, space, surface, text, type } from '@/theme';

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
  const [bankId, setBankId] = useState<string | null>(null);
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
      ...(bankId ? { bankId } : {}),
      ...(dueFrom ? { dueFrom } : {}),
      ...(dueTo ? { dueTo } : {}),
      ...(amountMin ? { amountMin } : {}),
      ...(amountMax ? { amountMax } : {}),
      sortBy,
      sortOrder,
      pageSize: 50,
    }),
    [
      tab,
      today,
      search,
      status,
      currency,
      bankId,
      dueFrom,
      dueTo,
      amountMin,
      amountMax,
      sortBy,
      sortOrder,
    ],
  );

  const query = useQuery({
    queryKey: ['cheques', filters],
    queryFn: () => api.listCheques(filters),
  });

  const banks = useQuery({ queryKey: ['banks'], queryFn: () => api.listBanks() });

  /**
   * How many cheques each tab holds.
   *
   * Every count runs that tab's *own* filter through `tabQuery`, rather than
   * being read off the dashboard summary the way the web list does it. The
   * dashboard's buckets do not line up with these tabs — its incoming and
   * outgoing figures count only what is still outstanding, while the tabs show
   * every cheque in that direction — and a badge that disagrees with the list
   * it opens is worse than no badge at all.
   *
   * `pageSize: 1` because only `meta.total` is wanted; the row that comes back
   * is thrown away. The search box is deliberately not in the key: these say
   * how much is in each tab, not how much of it matches what you are typing,
   * and re-counting six tabs on every keystroke would be a request storm.
   */
  const tabCounts = useQueries({
    queries: TABS.map((entry) => {
      const filters = { ...tabQuery(entry, today), pageSize: 1 };
      return {
        queryKey: ['cheques', 'tab-count', entry, today],
        queryFn: () => api.listCheques(filters),
        select: (page: Paginated<ChequeSummaryView>) => page.meta.total,
      };
    }),
  });

  const activeFilterCount = [status, currency, bankId, dueFrom, dueTo, amountMin, amountMax].filter(
    Boolean,
  ).length;

  function clearFilters(): void {
    setStatus(null);
    setCurrency(null);
    setBankId(null);
    setDueFrom('');
    setDueTo('');
    setAmountMin('');
    setAmountMax('');
  }

  return (
    <View style={styles.container}>
      <SegmentedTabs
        options={TABS.map((value, index) => ({
          value,
          // Omitted until it is known: a tab reading 0 while the request is
          // still out is a wrong answer, not a pending one.
          ...(tabCounts[index]?.data === undefined ? {} : { count: tabCounts[index].data }),
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

      {/* Only once something is actually filtered, and it says how many — a
          permanently visible "clear" is a control that does nothing most of
          the time, and a count tells you there is something to clear without
          opening the sheet to look. */}
      {activeFilterCount > 0 ? (
        <Pressable
          accessibilityRole="button"
          onPress={clearFilters}
          style={({ pressed }) => [styles.clearRow, pressed && styles.rowDown]}
        >
          <Text style={styles.clearText}>
            {t('common.clearFilters')} ({activeFilterCount})
          </Text>
        </Pressable>
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

              {/* The bank's mark, as on the web list: a letter on a colour
                  hashed from the name is what the eye locks onto while
                  scrolling, where a bank name has to be read. */}
              <View style={styles.rowMark}>
                <BankMark name={item.bankName} size={38} />
              </View>

              <View style={styles.rowBody}>
                <View style={styles.rowTop}>
                  <Text style={styles.amount} numberOfLines={1}>
                    {money(item.amount, item.currency)}
                  </Text>
                  <StatusPill status={item.status} label={t(`status.${item.status}`)} />
                </View>

                {/* Direction-aware, as on the web: on an outgoing cheque the
                    party who matters is who it went to, not who wrote it. */}
                <Text style={styles.party} numberOfLines={1}>
                  {(item.direction === 'OUTGOING'
                    ? item.currentRecipientName
                    : item.originalSourceName) ??
                    item.drawerName ??
                    t('common.unknown')}
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
                  {/* Two lines, as on the web: the date is the fact, the
                      distance is what decides whether to act this morning. */}
                  <View style={styles.dueGroup}>
                    {item.isOverdue ? <IconAlert size={14} color={colors.danger} /> : null}
                    <View style={styles.dueText}>
                      <Text style={[styles.due, item.isOverdue && styles.dueLate]}>
                        {date(item.dueDate)}
                      </Text>
                      <Text style={[styles.dueDistance, item.isOverdue && styles.dueLate]}>
                        {dueDistance(item.dueDate, today)}
                      </Text>
                    </View>
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

        {/* Which bank the cheque is drawn on — the filter people reach for
            after status, because a deposit run is organised one bank at a
            time. The web list was missing it too until this pass. */}
        <Picker
          label={t('cheque.bank')}
          options={(banks.data ?? []).map((bank) => ({ value: bank.id, label: bank.name }))}
          value={bankId}
          onChange={(next) => setBankId(next === bankId ? null : next)}
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
  container: { flex: 1, backgroundColor: 'transparent', padding: space['4'], gap: space['3'] },

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
    alignItems: 'center',
    backgroundColor: surface.card,
    borderRadius: radius.xl,
    ...elevation[2],
    overflow: 'hidden',
    minHeight: 92,
  },
  rowDown: { backgroundColor: surface.sunken },
  overdueEdge: { width: 4, backgroundColor: colors.danger },
  rowBody: { flex: 1, paddingVertical: space['3'], paddingEnd: space['4'], gap: space['1'] },
  rowMark: { marginStart: space['4'], marginEnd: space['3'] },

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
  dueText: { alignItems: 'flex-start' },
  dueDistance: { ...type.caption, fontSize: 11, color: text.faint },
  due: { ...type.caption, color: text.secondary },
  dueLate: { color: colors.danger, fontWeight: '700' },

  clearRow: {
    minHeight: TAP,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: surface.line,
    backgroundColor: surface.card,
  },
  clearText: { ...type.label, color: text.secondary },

  chipRow: { flexDirection: 'row', gap: space['2'] },
});
