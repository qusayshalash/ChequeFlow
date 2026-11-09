import { Pressable, StyleSheet, Text, View } from 'react-native';

import { IconBell, IconChevronEnd, type IconProps } from '@/components/icons';
import { Amount } from '@/components/ui';
import { useStyles, useTheme } from '@/theme-context';
import { TAP, elevation, radius, space, type, type Palette } from '@/theme';

/**
 * The dashboard's headline figures and its worklist.
 *
 * The same two pieces the web dashboard was rebuilt around, reasoned the same
 * way, drawn for a phone. Both are links: a number nobody can act on is a
 * number nobody comes back for.
 */

export type StatTone = 'teal' | 'green' | 'amber' | 'red' | 'neutral';

interface Tone {
  wash: string;
  icon: string;
  amount: string;
}

/**
 * The five tones a headline figure can carry, in each theme.
 *
 * A pale wash is a patch of light. On a dark card it stops being a tint and
 * becomes a lamp — five of them in a grid is a screen nobody can look at in
 * bed. The dark washes are deep versions of the same hue and the figures on
 * them are lifted, so the meaning survives and the brightness does not.
 */
const TONES: Record<StatTone, Tone> = {
  teal: { wash: '#DFF1ED', icon: '#0B7C6B', amount: '#0B7C6B' },
  green: { wash: '#DEF3E4', icon: '#12805C', amount: '#12805C' },
  amber: { wash: '#FBEEDA', icon: '#B56A0B', amount: '#A55F07' },
  red: { wash: '#FBE2E6', icon: '#C43D42', amount: '#C43D42' },
  neutral: { wash: '#EFF2F1', icon: '#5B6B68', amount: '#5B6B68' },
};

const DARK_TONES: Record<StatTone, Tone> = {
  teal: { wash: '#123029', icon: '#54C3AA', amount: '#54C3AA' },
  green: { wash: '#0F2A22', icon: '#68C79D', amount: '#68C79D' },
  amber: { wash: '#2E2513', icon: '#DDB160', amount: '#DDB160' },
  red: { wash: '#33191C', icon: '#EE9098', amount: '#EE9098' },
  neutral: { wash: '#1B2724', icon: '#A9BAB4', amount: '#A9BAB4' },
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
  const c = useTheme();
  const styles = useStyles(makeStyles);
  const palette = (c.dark ? DARK_TONES : TONES)[tone];

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
        <Amount style={[styles.statAmount, { color: amount ? palette.amount : c.text.faint }]}>
          {amount || '—'}
        </Amount>
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
  const c = useTheme();
  const styles = useStyles(makeStyles);
  return (
    <View style={styles.panel}>
      <View style={styles.panelHead}>
        <Text style={styles.panelTitle}>{title}</Text>
        <IconBell size={17} color={c.text.faint} />
      </View>

      {items.map((item, index) => {
        const palette = (c.dark ? DARK_TONES : TONES)[item.tone];
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
        <IconChevronEnd size={15} color={c.text.secondary} />
        <Text style={styles.panelFooterText}>{footerLabel}</Text>
      </Pressable>
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    pressed: { backgroundColor: c.surface.sunken },

    stat: {
      flex: 1,
      minWidth: 150,
      backgroundColor: c.surface.card,
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
    statLabel: { ...type.caption, color: c.text.secondary, textAlign: 'right' },
    statValue: { ...type.title, color: c.text.primary, textAlign: 'right' },
    statFoot: { alignItems: 'flex-end' },
    statAmountLabel: { ...type.caption, fontSize: 11, color: c.text.faint },
    statAmount: { ...type.label, textAlign: 'right' },

    panel: {
      backgroundColor: c.surface.card,
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
    panelTitle: { ...type.heading, color: c.text.primary },

    attentionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space['3'],
      minHeight: TAP + 8,
      paddingVertical: space['2'],
    },
    divided: { borderTopWidth: 1, borderTopColor: c.surface.line },
    attentionIcon: {
      width: 34,
      height: 34,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    attentionBody: { flex: 1, alignItems: 'flex-end' },
    attentionLabel: {
      ...type.callout,
      fontWeight: '600',
      color: c.text.primary,
      textAlign: 'right',
    },
    attentionAmount: { ...type.caption, fontSize: 11, color: c.text.faint, textAlign: 'right' },
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
      borderColor: c.surface.line,
    },
    panelFooterText: { ...type.label, color: c.text.secondary },
  });
