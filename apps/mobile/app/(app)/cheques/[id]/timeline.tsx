import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import type { ChequeEventView } from '@cheque-flow/shared-types';

import { IconChevronEnd } from '@/components/icons';
import { useApi, useApp, useTranslator } from '@/components/providers';
import { EmptyView, ErrorView, LoadingView, StatusPill } from '@/components/ui';
import { accent, radius, space, surface, text, type } from '@/theme';

/**
 * The cheque's full movement history.
 *
 * This is the append-only ledger: nothing here can be edited or removed, by
 * anyone, which is what makes it usable as evidence of where a cheque went.
 */
export default function ChequeTimelineScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const api = useApi();
  const t = useTranslator();
  const { dateTime } = useApp();

  const query = useQuery({
    queryKey: ['cheque-events', id],
    queryFn: () => api.listChequeEvents(id),
    enabled: Boolean(id),
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
    <FlatList<ChequeEventView>
      style={styles.list}
      contentContainerStyle={styles.content}
      data={query.data?.data ?? []}
      keyExtractor={(item) => item.id}
      ListEmptyComponent={<EmptyView label={t('errors.emptyTitle')} />}
      renderItem={({ item, index }) => {
        // Whichever party this movement was between; not every event has one.
        const from = item.fromContactName ?? item.fromUserName ?? item.fromLocationName;
        const to = item.toContactName ?? item.toUserName ?? item.toLocationName;

        const last = index === (query.data?.data.length ?? 0) - 1;

        return (
          // An actual timeline: a rail with a node per movement, so the ledger
          // reads as one continuous history. Stacked cards said nothing about
          // order, and a cheque's history is entirely about order.
          <View style={styles.entry}>
            <View style={styles.rail}>
              <View style={[styles.node, index === 0 && styles.nodeLatest]} />
              {last ? null : <View style={styles.line} />}
            </View>

            <View style={styles.body}>
              <View style={styles.header}>
                <Text style={styles.title}>{t(`event.${item.eventType}`)}</Text>
                {item.toStatus ? (
                  <StatusPill status={item.toStatus} label={t(`status.${item.toStatus}`)} />
                ) : null}
              </View>

              <Text style={styles.time}>{dateTime(item.eventDate)}</Text>

              {from || to ? (
                <View style={styles.move}>
                  <Text style={styles.moveText} numberOfLines={1}>
                    {from ?? '—'}
                  </Text>
                  <IconChevronEnd size={14} color={text.faint} />
                  <Text style={styles.moveText} numberOfLines={1}>
                    {to ?? '—'}
                  </Text>
                </View>
              ) : null}

              {item.performedByName ? (
                <Text style={styles.meta}>
                  {t('event.performedBy')}: {item.performedByName}
                </Text>
              ) : null}

              {item.approvedByName ? (
                <Text style={styles.meta}>
                  {t('event.approvedBy')}: {item.approvedByName}
                </Text>
              ) : null}

              {item.notes ? <Text style={styles.notes}>{item.notes}</Text> : null}
            </View>
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: surface.page },
  content: { padding: space['4'], paddingBottom: space['16'] },

  entry: { flexDirection: 'row', gap: space['3'] },
  /** The rail runs down the leading edge, so the eye follows one line. */
  rail: { alignItems: 'center', width: 14, paddingTop: space['5'] },
  node: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: surface.lineStrong,
  },
  /** The newest movement is the one people came to read. */
  nodeLatest: { backgroundColor: accent.base, width: 14, height: 14, borderRadius: 7 },
  line: { flex: 1, width: 2, backgroundColor: surface.line, marginTop: 2 },

  body: {
    flex: 1,
    gap: space['1'],
    backgroundColor: surface.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: surface.line,
    padding: space['4'],
    marginBottom: space['3'],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space['2'],
  },
  title: { ...type.bodyStrong, color: text.primary, textAlign: 'right', flexShrink: 1 },
  time: { ...type.caption, color: text.faint, textAlign: 'right' },
  move: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space['2'],
    backgroundColor: surface.sunken,
    borderRadius: radius.sm,
    paddingHorizontal: space['3'],
    paddingVertical: space['2'],
    marginTop: space['1'],
  },
  moveText: { ...type.caption, color: text.primary, flexShrink: 1 },
  meta: { ...type.caption, color: text.secondary, textAlign: 'right' },
  notes: { ...type.callout, color: text.primary, textAlign: 'right', marginTop: space['1'] },
});
