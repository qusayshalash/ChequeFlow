import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { utcToday, type ChequeSummaryView, type ChequeStatus } from '@cheque-flow/shared-types';
import { colors, radius, spacing } from '@cheque-flow/ui/tokens';

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
          <Text style={styles.filterGlyph}>⚙︎</Text>
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
              style={[styles.row, item.isOverdue && styles.rowOverdue]}
              onPress={() => router.push(`/(app)/cheques/${item.id}`)}
            >
              <View style={styles.rowHeader}>
                <View style={styles.rowHeaderStart}>
                  <Text style={styles.directionGlyph}>
                    {item.direction === 'OUTGOING' ? '↑' : '↓'}
                  </Text>
                  <Text style={styles.number}>{item.chequeNumber}</Text>
                </View>
                <StatusPill status={item.status} label={t(`status.${item.status}`)} />
              </View>

              <Text style={styles.amount}>{money(item.amount, item.currency)}</Text>

              <View style={styles.rowMetaLine}>
                <Text style={styles.meta}>{date(item.dueDate)}</Text>
                <Text style={[styles.meta, item.isOverdue && styles.metaOverdue]}>
                  {dueDistance(item.dueDate, today)}
                </Text>
              </View>

              <Text style={styles.meta} numberOfLines={1}>
                {[item.bankName, item.drawerName ?? item.originalSourceName]
                  .filter(Boolean)
                  .join(' — ') || t('common.unknown')}
              </Text>
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
  container: {
    flex: 1,
    backgroundColor: colors.surfaceMuted,
    padding: spacing.md,
    gap: spacing.sm,
  },
  searchRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  search: {
    flex: 1,
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    fontSize: 16,
    color: colors.text,
    textAlign: 'right',
  },
  filterButton: {
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  filterGlyph: { fontSize: 20, color: colors.text },
  filterCount: {
    position: 'absolute',
    top: 2,
    right: 2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterCountText: { color: colors.surface, fontSize: 11, fontWeight: '700' },

  list: { gap: spacing.sm, paddingBottom: spacing.xxl },
  row: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 4,
    minHeight: 88,
  },
  // A late cheque is the thing the user is looking for; it gets a coloured
  // edge as well as a badge so it is findable while scrolling fast.
  rowOverdue: { borderColor: colors.danger, borderStartWidth: 4 },
  rowHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowHeaderStart: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  directionGlyph: { fontSize: 16, color: colors.textMuted },
  number: { fontSize: 16, fontWeight: '700', color: colors.text, writingDirection: 'ltr' },
  amount: { fontSize: 18, color: colors.text, textAlign: 'right' },
  rowMetaLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  meta: { fontSize: 13, color: colors.textMuted, textAlign: 'right' },
  metaOverdue: { color: colors.danger, fontWeight: '700' },
  chipRow: { flexDirection: 'row', gap: spacing.sm },
});
