import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { ApiClientError } from '@cheque-flow/api-client';

import { useApi, useApp, useTranslator } from '@/components/providers';
import {
  Banner,
  Body,
  Button,
  Chip,
  ErrorView,
  InfoRow,
  LoadingView,
  Section,
} from '@/components/ui';
import { addDaysIso, todayIso } from '@/lib/dates';
import { shareTextFile } from '@/lib/export-file';
import { space, surface, text } from '@/theme';

const WINDOWS = [7, 30, 90];

export default function ReportsScreen() {
  const api = useApi();
  const t = useTranslator();
  const { money, date, locale } = useApp();

  const [withinDays, setWithinDays] = useState(30);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const today = todayIso();

  const due = useQuery({
    queryKey: ['report-due', withinDays],
    queryFn: () => api.getDueReport({ withinDays }),
  });

  const cashFlow = useQuery({
    queryKey: ['report-cash-flow', withinDays],
    queryFn: () =>
      api.getCashFlowReport({
        from: today,
        to: addDaysIso(today, withinDays),
        granularity: withinDays > 30 ? 'month' : 'week',
      }),
  });

  const custody = useQuery({ queryKey: ['report-custody'], queryFn: () => api.getCustodyReport() });

  const exportCsv = useMutation({
    mutationFn: async () => {
      const csv = await api.exportChequesCsv({ pageSize: 5000 }, locale);
      return shareTextFile(`cheques-${today}.csv`, csv, 'text/csv');
    },
    onSuccess: (result) => {
      setNotice(result.shared ? t('reports.exported') : result.uri);
    },
    onError: (caught: unknown) => {
      setError(caught instanceof ApiClientError ? t(caught.messageKey) : t('errors.saveFailed'));
    },
  });

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {notice ? <Banner tone="info" text={notice} /> : null}
      {error ? <ErrorView label={error} /> : null}

      <Section title={t('reports.range')}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          {WINDOWS.map((days) => (
            <Chip
              key={days}
              label={`${days}`}
              selected={withinDays === days}
              onPress={() => setWithinDays(days)}
            />
          ))}
        </ScrollView>
        <Body muted>
          {date(today)} — {date(addDaysIso(today, withinDays))}
        </Body>
      </Section>

      <Section title={t('reports.due')}>
        {due.isPending ? <LoadingView label={t('common.loading')} /> : null}
        {due.data ? (
          <>
            {/* One line per currency: a single total mixing shekels and
                dollars would be a number that means nothing. */}
            {due.data.byCurrency.map((entry) => (
              <InfoRow
                key={entry.currency}
                label={`${t('reports.due')} (${entry.count})`}
                value={money(entry.total, entry.currency)}
              />
            ))}
            {due.data.overdueByCurrency.map((entry) => (
              <InfoRow
                key={`overdue-${entry.currency}`}
                label={`${t('reports.overdue')} (${entry.count})`}
                value={money(entry.total, entry.currency)}
              />
            ))}
            {due.data.cheques.slice(0, 10).map((cheque) => (
              <InfoRow
                key={cheque.id}
                label={`${cheque.chequeNumber} — ${date(cheque.dueDate)}`}
                value={money(cheque.amount, cheque.currency)}
              />
            ))}
            {due.data.cheques.length === 0 ? <Body muted>{t('reports.empty')}</Body> : null}
          </>
        ) : null}
      </Section>

      <Section title={t('reports.cashFlow')}>
        {cashFlow.isPending ? <LoadingView label={t('common.loading')} /> : null}
        {cashFlow.data ? (
          cashFlow.data.periods.length === 0 ? (
            <Body muted>{t('reports.empty')}</Body>
          ) : (
            /* One labelled row per figure rather than five values strung
               into a single line. A mixed Arabic/Latin line that long gets
               reordered by the bidi algorithm and stops being readable — the
               same defect that made the dashboard's in/out card read
               backwards. */
            cashFlow.data.periods.flatMap((period) =>
              period.byCurrency.map((entry) => (
                <View key={`${period.period}-${entry.currency}`} style={styles.flowBlock}>
                  <Text style={styles.flowTitle}>
                    {period.period} — {entry.currency}
                  </Text>
                  <InfoRow
                    label={t('reports.expectedInflow')}
                    value={money(entry.inflow, entry.currency)}
                  />
                  <InfoRow
                    label={t('reports.expectedOutflow')}
                    value={money(entry.outflow, entry.currency)}
                  />
                  <InfoRow label={t('reports.net')} value={money(entry.net, entry.currency)} />
                </View>
              )),
            )
          )
        ) : null}
      </Section>

      <Section title={t('reports.custody')}>
        {custody.isPending ? <LoadingView label={t('common.loading')} /> : null}
        {custody.data ? (
          custody.data.entries.length === 0 ? (
            <Body muted>{t('reports.empty')}</Body>
          ) : (
            custody.data.entries.map((entry, index) => (
              <InfoRow
                key={`${entry.locationName ?? ''}-${entry.holderName ?? ''}-${index}`}
                label={[entry.holderName, entry.locationName].filter(Boolean).join(' — ') || '—'}
                value={entry.byCurrency
                  .map((bucket) => money(bucket.total, bucket.currency))
                  .join(' · ')}
              />
            ))
          )
        ) : null}
      </Section>

      <Section title={t('common.export')}>
        <Body muted>{t('reports.exportHint')}</Body>
        <Button
          label={t('reports.export')}
          onPress={() => {
            setNotice(null);
            setError(null);
            exportCsv.mutate();
          }}
          loading={exportCsv.isPending}
          large
        />
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: space['4'],
    gap: space['4'],
    backgroundColor: surface.page,
    paddingBottom: space['16'],
  },
  chips: { gap: space['2'] },
  flowBlock: {
    gap: 2,
    paddingVertical: space['2'],
    borderTopWidth: 1,
    borderTopColor: surface.line,
  },
  flowTitle: { fontSize: 14, fontWeight: '700', color: text.primary, textAlign: 'right' },
});
