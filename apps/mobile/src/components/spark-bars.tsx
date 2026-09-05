import { StyleSheet, Text, View } from 'react-native';

import { accent, radius, space, surface, text, type } from '@/theme';

export interface SparkBar {
  /** Axis label. Only some are printed, so the axis does not smudge. */
  label: string;
  value: number;
  /** Dated but not yet banked — drawn hollow. */
  forecast?: boolean;
}

/**
 * A small bar chart, drawn from plain views.
 *
 * Bars rather than a line, and no SVG library. React Native has no `<svg>`,
 * so a line would mean adding `react-native-svg` — a native dependency for
 * one screen. Bars need only a height and a colour, and for "how much fell
 * due in each week" they are the better read anyway: the quantity is the
 * length, and an empty week is visibly empty rather than a point the eye
 * joins to its neighbour.
 *
 * Forecast bars are outlined instead of filled. A cheque dated next month is
 * not money in the account, and drawing it identically to money already
 * collected would say it is.
 */
export function SparkBars({
  bars,
  height = 120,
  emptyLabel,
}: {
  bars: readonly SparkBar[];
  height?: number;
  emptyLabel: string;
}) {
  const peak = Math.max(...bars.map((bar) => bar.value), 0);

  if (bars.length === 0 || peak === 0) {
    return (
      <View style={[styles.empty, { height }]}>
        <Text style={styles.emptyText}>{emptyLabel}</Text>
      </View>
    );
  }

  // At most six labels, whatever the bar count, so ninety days of weeks does
  // not become an unreadable smear along the bottom.
  const labelEvery = Math.max(1, Math.round(bars.length / 6));

  return (
    <View>
      <View style={[styles.plot, { height }]}>
        {bars.map((bar, index) => (
          <View key={index} style={styles.column}>
            <View
              style={[
                styles.bar,
                // A bar with a real value never disappears: 2px is the floor,
                // so "a little" is still visibly different from "nothing".
                { height: bar.value === 0 ? 0 : Math.max((bar.value / peak) * height, 2) },
                bar.forecast ? styles.barForecast : styles.barSolid,
              ]}
            />
          </View>
        ))}
      </View>

      <View style={styles.axis}>
        {bars.map((bar, index) => (
          <View key={index} style={styles.column}>
            {index % labelEvery === 0 ? (
              <Text style={styles.axisLabel} numberOfLines={1}>
                {bar.label}
              </Text>
            ) : null}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  plot: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
    borderBottomWidth: 1,
    borderBottomColor: surface.line,
    paddingBottom: 2,
  },
  column: { flex: 1, alignItems: 'center' },
  bar: { width: '100%', borderRadius: 3, minWidth: 3 },
  barSolid: { backgroundColor: accent.base },
  barForecast: {
    borderWidth: 1.5,
    borderColor: accent.base,
    backgroundColor: accent.wash,
  },

  axis: { flexDirection: 'row', gap: 3, marginTop: space['1'] },
  axisLabel: { ...type.caption, fontSize: 10, color: text.faint },

  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: surface.sunken,
  },
  emptyText: { ...type.callout, color: text.faint },
});
