import { Pressable, StyleSheet, Text, View } from 'react-native';

import { type BalanceProjection, type ContactRiskView } from '@cheque-flow/shared-types';

import { useApp, useTranslator } from '@/components/providers';
import { Amount } from '@/components/ui';
import { useStyles, useTheme } from '@/theme-context';
import { TAP, elevation, radius, space, type, type Palette } from '@/theme';

/**
 * The top of the home screen, as on the web: what the coming weeks add up to,
 * and the projected balance day by day.
 *
 * The web draws the balance as a curve; the phone draws it as one bar a day,
 * which needs no graphics library and reads at this size: mint above zero,
 * red below it, the lowest day marked. The row runs right to left like the
 * page, so today is at the right edge, as on the web.
 */
export function LiquidityCard({
  projection,
  horizon,
  figures,
}: {
  projection: BalanceProjection;
  horizon: number;
  figures: Array<{ label: string; value: string; note: string; tone?: 'danger' | 'warning' }>;
}) {
  const c = useTheme();
  const styles = useStyles(makeStyles);
  const t = useTranslator();
  const { money, date } = useApp();

  const values = projection.points.map((point) => Number(point.balance));
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const above = (max / span) * BARS_HEIGHT;
  const below = BARS_HEIGHT - above;
  const lowIndex = values.indexOf(Math.min(...values));
  const short = projection.low.balance.startsWith('-');
  const net = projection.net.startsWith('-');

  return (
    <View style={styles.card}>
      <Text style={styles.label}>{t('dashboard.netAhead', { days: String(horizon) })}</Text>
      <Amount style={[styles.net, { color: net ? c.semantic.danger : c.accent.dark }]}>
        {money(projection.net, projection.currency)}
      </Amount>
      <Text style={styles.parts}>
        {t('dashboard.netParts', {
          inflow: money(projection.inflow, projection.currency),
          outflow: money(projection.outflow, projection.currency),
        })}
      </Text>

      <View style={styles.figures}>
        {figures.map((figure) => (
          <View key={figure.label} style={styles.figure}>
            <Text style={styles.figureLabel} numberOfLines={1}>
              {figure.label}
            </Text>
            <Text
              style={[
                styles.figureValue,
                figure.tone === 'danger' && figure.value !== '0'
                  ? { color: c.semantic.danger }
                  : null,
              ]}
            >
              {figure.value}
            </Text>
            <Text
              style={[
                styles.figureNote,
                figure.tone === 'danger'
                  ? { color: c.semantic.danger }
                  : figure.tone === 'warning'
                    ? { color: c.semantic.warning }
                    : null,
              ]}
              numberOfLines={1}
            >
              {figure.note}
            </Text>
          </View>
        ))}
      </View>

      <Text style={styles.chartTitle}>{t('dashboard.projectedTitle')}</Text>
      <View
        style={styles.bars}
        accessible
        accessibilityLabel={`${t('dashboard.projectedTitle')}: ${
          short
            ? `${t('dashboard.lowestPoint', { date: date(projection.low.day) })} ${money(
                projection.low.balance,
                projection.currency,
              )}`
            : t('dashboard.neverShort')
        }`}
      >
        {values.map((value, index) => {
          const isLow = short && index === lowIndex;
          return (
            <View key={projection.points[index]?.day ?? index} style={styles.bar}>
              <View style={[styles.half, { height: above, justifyContent: 'flex-end' }]}>
                {value > 0 ? (
                  <View
                    style={[
                      styles.fill,
                      { height: (value / span) * BARS_HEIGHT, backgroundColor: c.accent.base },
                    ]}
                  />
                ) : null}
              </View>
              <View style={[styles.zero, { backgroundColor: c.surface.lineStrong }]} />
              <View style={[styles.half, { height: below }]}>
                {value < 0 ? (
                  <View
                    style={[
                      styles.fill,
                      {
                        height: (-value / span) * BARS_HEIGHT,
                        backgroundColor: isLow ? c.semantic.danger : c.semantic.dangerBg,
                      },
                    ]}
                  />
                ) : null}
              </View>
            </View>
          );
        })}
      </View>
      <View style={styles.axis}>
        <Text style={styles.axisText}>{date(projection.points[0]?.day ?? projection.low.day)}</Text>
        <Text style={styles.axisText}>
          {date(projection.points[projection.points.length - 1]?.day ?? projection.low.day)}
        </Text>
      </View>
      <View
        style={[
          styles.chip,
          { backgroundColor: short ? c.semantic.dangerBg : c.semantic.successBg },
        ]}
      >
        <Text style={[styles.chipText, { color: short ? c.semantic.danger : c.semantic.success }]}>
          {short
            ? `${t('dashboard.lowestPoint', { date: date(projection.low.day) })} ${money(
                projection.low.balance,
                projection.currency,
              )}`
            : t('dashboard.neverShort')}
        </Text>
      </View>
    </View>
  );
}

/** The contacts most worth watching, riskiest first, as on the web. */
export function RiskList({
  entries,
  onOpen,
}: {
  entries: ContactRiskView[];
  onOpen: (contactId: string) => void;
}) {
  const c = useTheme();
  const styles = useStyles(makeStyles);
  const t = useTranslator();
  const { money } = useApp();
  if (entries.length === 0) return null;

  const tone = (level: ContactRiskView['level']) =>
    level === 'high'
      ? { color: c.semantic.danger, backgroundColor: c.semantic.dangerBg }
      : level === 'medium'
        ? { color: c.semantic.warning, backgroundColor: c.semantic.warningBg }
        : { color: c.semantic.success, backgroundColor: c.semantic.successBg };

  return (
    <View style={styles.riskCard}>
      <View style={styles.riskHead}>
        <Text style={styles.riskTitle}>{t('dashboard.riskTitle')}</Text>
        <Text style={styles.riskOrder}>{t('dashboard.riskOrder')}</Text>
      </View>
      {entries.map((entry, index) => (
        <Pressable
          key={entry.contactId}
          accessibilityRole="button"
          accessibilityLabel={`${entry.name} ${t(`dashboard.risk.${entry.level}`)}`}
          onPress={() => onOpen(entry.contactId)}
          style={({ pressed }) => [
            styles.riskRow,
            index > 0 && styles.riskDivided,
            pressed && { backgroundColor: c.surface.sunken },
          ]}
        >
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{entry.name.trim().charAt(0)}</Text>
          </View>
          <View style={styles.riskBody}>
            <Text style={styles.riskName} numberOfLines={1}>
              {entry.name}
            </Text>
            <Text style={styles.riskLine} numberOfLines={1}>
              {entry.decided > 0
                ? t('dashboard.riskLine', {
                    rate: String(Math.round((entry.bounced / entry.decided) * 100)),
                    open: String(entry.openBounced),
                  })
                : t('dashboard.riskNew')}
            </Text>
            <Text style={[styles.badge, tone(entry.level)]}>
              {t(`dashboard.risk.${entry.level}`)}
            </Text>
          </View>
          <View style={styles.riskAmounts}>
            {entry.outstanding.map((row) => (
              <Amount key={row.currency} style={styles.riskAmount}>
                {money(row.total, row.currency)}
              </Amount>
            ))}
          </View>
        </Pressable>
      ))}
    </View>
  );
}

const BARS_HEIGHT = 96;

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    card: {
      backgroundColor: c.surface.card,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: c.surface.line,
      padding: space['4'],
      gap: space['1'],
      ...elevation[2],
    },
    label: { ...type.caption, color: c.text.secondary },
    net: {
      ...type.display,
      fontSize: 34,
      lineHeight: 44,
      writingDirection: 'ltr',
      textAlign: 'right',
    },
    parts: { ...type.caption, color: c.text.faint },
    figures: { flexDirection: 'row', gap: space['2'], marginTop: space['3'] },
    figure: {
      flex: 1,
      backgroundColor: c.surface.sunken,
      borderRadius: radius.md,
      padding: space['2'],
      gap: 2,
    },
    figureLabel: { ...type.caption, fontSize: 11, color: c.text.faint },
    figureValue: { ...type.heading, color: c.text.primary },
    figureNote: { ...type.caption, fontSize: 11, color: c.text.secondary, writingDirection: 'ltr' },
    chartTitle: { ...type.bodyStrong, color: c.text.primary, marginTop: space['4'] },
    bars: { flexDirection: 'row', gap: 2, marginTop: space['2'], height: BARS_HEIGHT + 1 },
    bar: { flex: 1 },
    half: { width: '100%' },
    fill: { width: '100%', borderRadius: 2 },
    zero: { height: 1, width: '100%' },
    axis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: space['1'] },
    axisText: { ...type.caption, fontSize: 11, color: c.text.faint },
    chip: {
      alignSelf: 'flex-start',
      borderRadius: radius.sm,
      paddingHorizontal: space['2'],
      paddingVertical: space['1'],
      marginTop: space['2'],
    },
    chipText: { ...type.caption, fontSize: 12 },

    riskCard: {
      backgroundColor: c.surface.card,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: c.surface.line,
      padding: space['3'],
      ...elevation[2],
    },
    riskHead: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      marginBottom: space['1'],
    },
    riskTitle: { ...type.heading, color: c.text.primary },
    riskOrder: { ...type.caption, color: c.text.faint },
    riskRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space['3'],
      minHeight: TAP + 16,
      paddingVertical: space['2'],
    },
    riskDivided: { borderTopWidth: 1, borderTopColor: c.surface.line },
    avatar: {
      width: 38,
      height: 38,
      borderRadius: radius.md,
      backgroundColor: c.surface.sunken,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: { ...type.bodyStrong, color: c.text.secondary },
    riskBody: { flex: 1, gap: 2 },
    riskName: { ...type.bodyStrong, color: c.text.primary },
    riskLine: { ...type.caption, fontSize: 11, color: c.text.faint },
    badge: {
      ...type.caption,
      fontSize: 10,
      alignSelf: 'flex-start',
      borderRadius: radius.sm,
      overflow: 'hidden',
      paddingHorizontal: 6,
      paddingVertical: 1,
    },
    riskAmounts: { alignItems: 'flex-end' },
    riskAmount: { ...type.bodyStrong, color: c.text.primary },
  });
