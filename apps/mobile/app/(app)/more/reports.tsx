import { useMutation, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { ApiClientError } from '@cheque-flow/api-client';

import { IconAlert, IconCalendar, IconSafe } from '@/components/icons';
import { useApi, useApp, useTranslator } from '@/components/providers';
import { SparkBars, type SparkBar } from '@/components/spark-bars';
import {
  Banner,
  Body,
  Button,
  ErrorView,
  LoadingView,
  SegmentedTabs,
  Section,
} from '@/components/ui';
import { addDaysIso, todayIso } from '@/lib/dates';
import { shareTextFile } from '@/lib/export-file';
import { accent, elevation, radius, space, surface, text, type } from '@/theme';

/** Windows on offer, as days ahead. */
const WINDOWS = [7, 30, 90] as const;

/** The Monday on or before `iso` — how the API buckets weeks. */
function mondayOf(iso: string): string {
  return addDaysIso(iso, -((new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7));
}

/**
 * Reports, on a phone.
 *
 * This was a wall of labelled rows: every period, every currency, three rows
 * each — thirteen weeks of cash flow came to thirty-nine lines of raw numbers
 * with no shape and no total. Nobody reads a table that long on a phone, and
 * the one question it should answer ("is more coming in than going out?") was
 * the one thing it never said.
 *
 * It now answers in the same order the web page does: how much, drawn; then
 * what is due and what is late; then where the cheques physically are.
 */
export default function ReportsScreen() {
  const api = useApi();
  const t = useTranslator();
  const { money, date, locale } = useApp();

  const [withinDays, setWithinDays] = useState<number>(30);
  const [currency, setCurrency] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const today = todayIso();
  const to = addDaysIso(today, withinDays);
  const grain = withinDays > 30 ? 'week' : 'day';

  const due = useQuery({
    queryKey: ['report-due', withinDays],
    queryFn: () => api.getDueReport({ withinDays }),
  });

  const cashFlow = useQuery({
    queryKey: ['report-cash-flow', withinDays],
    queryFn: () => api.getCashFlowReport({ from: today, to, granularity: grain }),
  });

  const custody = useQuery({ queryKey: ['report-custody'], queryFn: () => api.getCustodyReport() });

  const currencies = useMemo(() => {
    const seen = new Set<string>();
    for (const period of cashFlow.data?.periods ?? []) {
      for (const row of period.byCurrency) seen.add(row.currency);
    }
    return [...seen].sort((a, b) => a.localeCompare(b));
  }, [cashFlow.data]);

  const shown = currency ?? currencies[0] ?? null;

  /**
   * The bars and the three figures under them, for one currency.
   *
   * The axis is generated from the calendar, not taken from the response: the
   * report returns only periods that contain cheques, so a quiet fortnight
   * came back as nothing and the chart implied a trend across a gap that was
   * never there.
   *
   * One currency at a time. Adding a dollar to a shekel gives a number that
   * means nothing, so currency is a filter, never a second series.
   */
  const flow = useMemo(() => {
    if (!shown || !cashFlow.data) return null;

    const byPeriod = new Map(
      cashFlow.data.periods.map((period) => [
        period.period,
        period.byCurrency.find((row) => row.currency === shown),
      ]),
    );

    const step = grain === 'week' ? 7 : 1;
    const start = grain === 'week' ? mondayOf(today) : today;

    const bars: SparkBar[] = [];
    let inflow = 0;
    let outflow = 0;

    for (let day = start; day <= to; day = addDaysIso(day, step)) {
      const row = byPeriod.get(day);
      const value = Number(row?.inflow ?? 0);
      inflow += value;
      outflow += Number(row?.outflow ?? 0);
      bars.push({
        label: date(day).split(' ').slice(0, 2).join(' '),
        value,
        // Everything here is dated, not banked — the whole window is ahead of
        // today, so every bar is a forecast and says so.
        forecast: day > today,
      });
    }

    return { bars, inflow, outflow, net: inflow - outflow };
  }, [cashFlow.data, shown, grain, today, to, date]);

  const exportCsv = useMutation({
    mutationFn: async () => {
      const csv = await api.exportChequesCsv({ pageSize: 5000 }, locale);
      return shareTextFile(`cheques-${today}.csv`, csv, 'text/csv');
    },
    onSuccess: (result) => setNotice(result.shared ? t('reports.exported') : result.uri),
    onError: (caught: unknown) =>
      setError(caught instanceof ApiClientError ? t(caught.messageKey) : t('errors.loadFailed')),
  });

  const custodyTotal = custody.data?.count ?? 0;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {notice ? <Banner tone="info" text={notice} /> : null}
      {error ? <ErrorView label={error} /> : null}

      {/* The window, and the currency when there is more than one. Both were
          fixed in the source before. */}
      <SegmentedTabs
        options={WINDOWS.map((days) => ({
          value: String(days),
          label: t('due.inDays', { days }),
        }))}
        value={String(withinDays)}
        onChange={(next) => setWithinDays(Number(next))}
      />

      {currencies.length > 1 ? (
        <SegmentedTabs
          options={currencies.map((code) => ({ value: code, label: code }))}
          value={shown ?? ''}
          onChange={setCurrency}
        />
      ) : null}

      <Text style={styles.window}>
        {date(today)} — {date(to)}
      </Text>

      <Section title={`${t('reports.cashFlow')}${shown ? ` — ${shown}` : ''}`}>
        {cashFlow.isPending ? <LoadingView label={t('common.loading')} /> : null}

        {flow ? (
          <>
            <SparkBars bars={flow.bars} emptyLabel={t('reports.empty')} />

            <View style={styles.figures}>
              <Figure
                label={t('reports.inflow')}
                value={money(flow.inflow.toFixed(2), shown!)}
                tone={accent.dark}
              />
              <View style={styles.figureRule} />
              <Figure
                label={t('reports.outflow')}
                value={money(flow.outflow.toFixed(2), shown!)}
                tone="#C43D42"
              />
              <View style={styles.figureRule} />
              <Figure
                label={t('reports.net')}
                value={money(flow.net.toFixed(2), shown!)}
                tone={flow.net < 0 ? '#C43D42' : accent.dark}
              />
            </View>
          </>
        ) : cashFlow.isPending ? null : (
          <Body muted>{t('reports.empty')}</Body>
        )}
      </Section>

      <Section title={t('reports.dueTitle')}>
        {due.isPending ? <LoadingView label={t('common.loading')} /> : null}
        {due.data ? (
          <View style={styles.callouts}>
            <Callout
              Icon={IconCalendar}
              wash={accent.wash}
              ink={accent.dark}
              count={due.data.count}
              label={t('reports.due')}
              lines={due.data.byCurrency.map((entry) => money(entry.total, entry.currency))}
            />
            <Callout
              Icon={IconAlert}
              wash="#FBE2E6"
              ink="#C43D42"
              count={due.data.overdueCount}
              label={t('reports.overdue')}
              lines={due.data.overdueByCurrency.map((entry) => money(entry.total, entry.currency))}
            />
          </View>
        ) : null}
      </Section>

      <Section title={t('reports.custodyTitle')}>
        {custody.isPending ? <LoadingView label={t('common.loading')} /> : null}
        {custody.data && custody.data.entries.length === 0 ? (
          <Body muted>{t('reports.empty')}</Body>
        ) : null}

        {(custody.data?.entries ?? []).map((entry, index) => {
          const share = custodyTotal > 0 ? entry.count / custodyTotal : 0;
          return (
            <View key={index} style={styles.custodyRow}>
              <View style={styles.custodyHead}>
                <Text style={styles.custodyShare}>
                  {entry.count} · {Math.round(share * 100)}%
                </Text>
                <View style={styles.custodyName}>
                  <Text style={styles.custodyTitle} numberOfLines={1}>
                    {[entry.holderName, entry.locationName].filter(Boolean).join(' — ') || '—'}
                  </Text>
                  <IconSafe size={15} color={text.faint} />
                </View>
              </View>

              {/* A bar, not just a count. "Four in the safe" means little until
                  you can see it is most of them. */}
              <View style={styles.custodyTrack}>
                <View style={[styles.custodyFill, { width: `${Math.max(share * 100, 2)}%` }]} />
              </View>

              <Text style={styles.custodyMoney}>
                {entry.byCurrency.map((row) => money(row.total, row.currency)).join(' · ')}
              </Text>
            </View>
          );
        })}
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

function Figure({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <View style={styles.figure}>
      <Text style={styles.figureLabel}>{label}</Text>
      <Text style={[styles.figureValue, { color: tone }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
  );
}

function Callout({
  Icon,
  wash,
  ink,
  count,
  label,
  lines,
}: {
  Icon: (props: { size?: number; color?: string }) => React.ReactElement;
  wash: string;
  ink: string;
  count: number;
  label: string;
  lines: string[];
}) {
  return (
    <View style={styles.callout}>
      <View style={[styles.calloutIcon, { backgroundColor: wash }]}>
        <Icon size={18} color={ink} />
      </View>
      <View style={styles.calloutBody}>
        <Text style={styles.calloutCount}>{count}</Text>
        <Text style={styles.calloutLabel}>{label}</Text>
        {/* One line per currency, never summed. */}
        {lines.length > 0 ? (
          <Text style={styles.calloutMoney} numberOfLines={2}>
            {lines.join(' · ')}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: space['4'],
    gap: space['4'],
    backgroundColor: 'transparent',
    paddingBottom: space['16'],
  },
  window: { ...type.caption, color: text.faint, textAlign: 'right' },

  figures: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginTop: space['3'],
    paddingTop: space['3'],
    borderTopWidth: 1,
    borderTopColor: surface.line,
  },
  figure: { flex: 1, alignItems: 'center', gap: 2 },
  figureRule: { width: 1, backgroundColor: surface.line },
  figureLabel: { ...type.caption, fontSize: 11, color: text.faint },
  figureValue: { ...type.label, textAlign: 'center' },

  callouts: { gap: space['2'] },
  callout: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space['3'],
    borderRadius: radius.lg,
    backgroundColor: surface.card,
    padding: space['3'],
    ...elevation[1],
  },
  calloutIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calloutBody: { flex: 1, alignItems: 'flex-end' },
  calloutCount: { ...type.title, color: text.primary },
  calloutLabel: { ...type.callout, color: text.secondary },
  calloutMoney: { ...type.caption, color: text.faint, textAlign: 'right' },

  custodyRow: { gap: space['1'], paddingVertical: space['2'] },
  custodyHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  custodyName: { flexDirection: 'row', alignItems: 'center', gap: space['2'], flex: 1 },
  custodyTitle: { ...type.bodyStrong, color: text.primary, textAlign: 'right', flexShrink: 1 },
  custodyShare: { ...type.caption, color: text.secondary },
  custodyTrack: {
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: surface.sunken,
    overflow: 'hidden',
  },
  custodyFill: { height: '100%', borderRadius: radius.pill, backgroundColor: accent.base },
  custodyMoney: { ...type.caption, color: text.secondary, textAlign: 'right' },
});
