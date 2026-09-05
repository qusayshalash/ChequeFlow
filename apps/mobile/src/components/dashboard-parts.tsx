import { Pressable, StyleSheet, Text, View } from 'react-native';

import { IconBell, IconChevronEnd, type IconProps } from '@/components/icons';
import { TAP, elevation, radius, space, surface, text, type } from '@/theme';

/**
 * The dashboard's headline figures and its worklist.
 *
 * The same two pieces the web dashboard was rebuilt around, reasoned the same
 * way, drawn for a phone. Both are links: a number nobody can act on is a
 * number nobody comes back for.
 */

export type StatTone = 'teal' | 'green' | 'amber' | 'red' | 'neutral';

const TONES: Record<StatTone, { wash: string; icon: string; amount: string }> = {
  teal: { wash: '#DFF1ED', icon: '#0B7C6B', amount: '#0B7C6B' },
  green: { wash: '#DEF3E4', icon: '#12805C', amount: '#12805C' },
  amber: { wash: '#FBEEDA', icon: '#B56A0B', amount: '#A55F07' },
  red: { wash: '#FBE2E6', icon: '#C43D42', amount: '#C43D42' },
  neutral: { wash: '#EFF2F1', icon: '#5B6B68', amount: '#5B6B68' },
};

/**
 * One headline figure.
 *
 * Three tiers in the order the eye needs them: what this counts, how many, and
 * what that is worth. The amount is the only coloured text on the card,
 * because it is the part that says whether the count is good news.
 *
 * Two per row on a phone rather than the web's four, which is the most that
 * leaves a five-figure sum room to print without shrinking.
 */
export function StatCard({
  label,
  value,
  amountLabel,
  amount,
  tone = 'neutral',
  Icon,
  onPress,
}: {
  label: string;
  value: string;
  amountLabel: string;
  /** Already formatted, and per currency where there is more than one. */
  amount?: string;
  tone?: StatTone;
  Icon: (props: IconProps) => React.ReactElement;
  onPress: () => void;
}) {
  const palette = TONES[tone];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}${amount ? ` — ${amount}` : ''}`}
      onPress={onPress}
      style={({ pressed }) => [styles.stat, pressed && styles.pressed]}
    >
      <View style={styles.statTop}>
        <View style={[styles.statIcon, { backgroundColor: palette.wash }]}>
          <Icon size={19} color={palette.icon} />
        </View>
        <View style={styles.statHead}>
          <Text style={styles.statLabel} numberOfLines={1}>
            {label}
          </Text>
          <Text style={styles.statValue} numberOfLines={1}>
            {value}
          </Text>
        </View>
      </View>

      {/* An absent amount prints its caption and a dash rather than collapsing:
          cards of two different heights in one row read as a layout fault. */}
      <View style={styles.statFoot}>
        <Text style={styles.statAmountLabel}>{amountLabel}</Text>
        <Text
          style={[styles.statAmount, { color: amount ? palette.amount : text.faint }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.75}
        >
          {amount || '—'}
        </Text>
      </View>
    </Pressable>
  );
}

export interface AttentionItem {
  key: string;
  label: string;
  count: number;
  amount?: string;
  tone: StatTone;
  Icon: (props: IconProps) => React.ReactElement;
  onPress: () => void;
}

/**
 * The worklist: what has to be looked at before anything else.
 *
 * Rows with nothing in them still print. "Bounced: 0" is a useful sentence,
 * and a panel whose rows come and go is one people stop trusting to be
 * complete — the old screen dropped empty buckets and left you unable to tell
 * "none" from "not counted".
 */
export function AttentionList({
  title,
  items,
  footerLabel,
  onFooterPress,
}: {
  title: string;
  items: readonly AttentionItem[];
  footerLabel: string;
  onFooterPress: () => void;
}) {
  return (
    <View style={styles.panel}>
      <View style={styles.panelHead}>
        <Text style={styles.panelTitle}>{title}</Text>
        <IconBell size={17} color={text.faint} />
      </View>

      {items.map((item, index) => {
        const palette = TONES[item.tone];
        return (
          <Pressable
            key={item.key}
            accessibilityRole="button"
            accessibilityLabel={`${item.label}: ${String(item.count)}`}
            onPress={item.onPress}
            style={({ pressed }) => [
              styles.attentionRow,
              index > 0 && styles.divided,
              pressed && styles.pressed,
            ]}
          >
            <View style={[styles.attentionIcon, { backgroundColor: palette.wash }]}>
              <item.Icon size={17} color={palette.icon} />
            </View>

            <View style={styles.attentionBody}>
              <Text style={styles.attentionLabel} numberOfLines={1}>
                {item.label}
              </Text>
              {item.amount ? (
                <Text style={styles.attentionAmount} numberOfLines={1}>
                  {item.amount}
                </Text>
              ) : null}
            </View>

            <Text style={[styles.attentionCount, { color: palette.amount }]}>{item.count}</Text>
          </Pressable>
        );
      })}

      <Pressable
        accessibilityRole="button"
        onPress={onFooterPress}
        style={({ pressed }) => [styles.panelFooter, pressed && styles.pressed]}
      >
        <IconChevronEnd size={15} color={text.secondary} />
        <Text style={styles.panelFooterText}>{footerLabel}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  pressed: { backgroundColor: surface.sunken },

  stat: {
    flex: 1,
    minWidth: 150,
    backgroundColor: surface.card,
    borderRadius: radius.xl,
    ...elevation[2],
    padding: space['3'],
    gap: space['3'],
  },
  statTop: { flexDirection: 'row', alignItems: 'flex-start', gap: space['2'] },
  statIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statHead: { flex: 1, alignItems: 'flex-end' },
  statLabel: { ...type.caption, color: text.secondary, textAlign: 'right' },
  statValue: { ...type.title, color: text.primary, textAlign: 'right' },
  statFoot: { alignItems: 'flex-end' },
  statAmountLabel: { ...type.caption, fontSize: 11, color: text.faint },
  statAmount: { ...type.label, textAlign: 'right' },

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

  attentionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space['3'],
    minHeight: TAP + 8,
    paddingVertical: space['2'],
  },
  divided: { borderTopWidth: 1, borderTopColor: surface.line },
  attentionIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attentionBody: { flex: 1, alignItems: 'flex-end' },
  attentionLabel: { ...type.callout, fontWeight: '600', color: text.primary, textAlign: 'right' },
  attentionAmount: { ...type.caption, fontSize: 11, color: text.faint, textAlign: 'right' },
  attentionCount: { ...type.title, minWidth: 28, textAlign: 'left' },

  panelFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space['1'],
    minHeight: TAP,
    marginTop: space['2'],
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: surface.line,
  },
  panelFooterText: { ...type.label, color: text.secondary },
});
