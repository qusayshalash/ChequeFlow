import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';

import { ApiClientError } from '@cheque-flow/api-client';
import { colors, spacing } from '@cheque-flow/ui/tokens';

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
            <InfoRow label={`${t('reports.due')} (${due.data.count})`} value={due.data.total} />
            <InfoRow
              label={`${t('reports.overdue')} (${due.data.overdueCount})`}
              value={due.data.overdueTotal}
            />
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
            cashFlow.data.periods.map((period) => (
              <Text key={period.period} style={styles.flowRow}>
                {period.period} — {t('reports.expectedInflow')}: {period.inflow} · {'  '}
                {t('reports.expectedOutflow')}: {period.outflow} · {t('reports.net')}: {period.net}
              </Text>
            ))
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
                value={`${entry.count} — ${entry.total}`}
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
    padding: spacing.md,
    gap: spacing.md,
    backgroundColor: colors.surfaceMuted,
    paddingBottom: spacing.xxl,
  },
  chips: { gap: spacing.sm },
  flowRow: { fontSize: 13, color: colors.text, textAlign: 'right' },
});
