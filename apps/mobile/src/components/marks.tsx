import { StyleSheet, Text, View } from 'react-native';

import { useStyles, useTheme } from '@/theme-context';
import { radius, type, type Palette } from '@/theme';

/**
 * The coloured initial that stands in for a logo or a photograph.
 *
 * The web app grew these first and the reasoning carries over unchanged: the
 * `banks` table has a `logo_url` that nothing fills, there are no licensed
 * logo files in this repository, and inventing one would put a wrong bank's
 * brand on a real cheque. Contacts have no photographs either, and never will
 * for a party typed off a cheque face.
 *
 * So the mark is derived from the name — its first letter on a colour picked
 * by hashing the name. That does the job a logo does while scrolling, which is
 * telling one row from another at a glance, without claiming to be a logo.
 *
 * Square for a bank, round for a person: it is the one cue that keeps an
 * institution apart from an individual when both are just a letter.
 */

/** A letter and the circle it sits in. */
interface Mark {
  bg: string;
  fg: string;
}

/** Pairs that each clear 4.5:1 between the letter and its own background. */
const BANK_MARKS: readonly Mark[] = [
  { bg: '#DCEEFB', fg: '#0B4E7D' },
  { bg: '#E9E3FB', fg: '#4B3392' },
  { bg: '#DDF3E6', fg: '#12603F' },
  { bg: '#FBEEDA', fg: '#7A4A06' },
  { bg: '#FBE2E6', fg: '#8C2733' },
  { bg: '#E2E7E9', fg: '#33434A' },
] as const;

/**
 * The same six, for a dark ground.
 *
 * A monogram is a filled circle, so in the dark the light set turns into six
 * bright dots down the side of a list. Deep grounds with lifted letters keep
 * the pair distinguishable — the mark's whole job — without the glare.
 */
const DARK_BANK_MARKS: readonly Mark[] = [
  { bg: '#10293C', fg: '#7FBDEC' },
  { bg: '#231B3D', fg: '#B3A4F0' },
  { bg: '#0F2A22', fg: '#68C79D' },
  { bg: '#2E2513', fg: '#DDB160' },
  { bg: '#33191C', fg: '#EE9098' },
  { bg: '#1B2429', fg: '#A8BAC4' },
] as const;

const CONTACT_MARKS: readonly Mark[] = [
  { bg: '#D8F0EA', fg: '#0B5346' },
  { bg: '#E1E4FA', fg: '#2C3A8C' },
  { bg: '#FBE8D8', fg: '#7C3D07' },
  { bg: '#F8E0F2', fg: '#7A2465' },
  { bg: '#D9EEF3', fg: '#0D5061' },
  { bg: '#E2E7E9', fg: '#33434A' },
] as const;

const DARK_CONTACT_MARKS: readonly Mark[] = [
  { bg: '#0F2B26', fg: '#63C9B4' },
  { bg: '#1C2142', fg: '#9FACF2' },
  { bg: '#2C1D10', fg: '#E0A874' },
  { bg: '#2C1528', fg: '#E29AD0' },
  { bg: '#102A31', fg: '#79C4D6' },
  { bg: '#1B2429', fg: '#A8BAC4' },
] as const;

/**
 * Picks the same colour for the same name every time.
 *
 * Hashed rather than assigned by position: a mark that changed between renders
 * — or between the list and the detail screen — would be worse than no mark,
 * because the whole value is that the eye learns "the blue one is Bank of
 * Palestine".
 */
function markFor<T>(name: string, palette: readonly T[]): T {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) % 100_000;
  }
  return palette[hash % palette.length]!;
}

export function BankMark({ name, size = 32 }: { name: string | null; size?: number }) {
  const c = useTheme();
  const styles = useStyles(makeStyles);
  const box = { width: size, height: size, borderRadius: radius.sm };

  if (!name?.trim()) {
    return (
      <View style={[styles.mark, box, styles.empty]}>
        <Text
          allowFontScaling={false}
          style={[styles.letter, styles.emptyLetter, { fontSize: size * 0.42 }]}
        >
          —
        </Text>
      </View>
    );
  }

  const palette = markFor(name, c.dark ? DARK_BANK_MARKS : BANK_MARKS);
  return (
    <View style={[styles.mark, box, { backgroundColor: palette.bg }]}>
      <Text
        allowFontScaling={false}
        style={[styles.letter, { color: palette.fg, fontSize: size * 0.45 }]}
      >
        {name.trim().charAt(0)}
      </Text>
    </View>
  );
}

export function ContactAvatar({
  name,
  size = 44,
  muted = false,
}: {
  name: string;
  size?: number;
  /** An inactive contact, drawn without its colour. */
  muted?: boolean;
}) {
  const c = useTheme();
  const styles = useStyles(makeStyles);
  const box = { width: size, height: size, borderRadius: radius.pill };
  const trimmed = name.trim();
  const palette = markFor(trimmed, c.dark ? DARK_CONTACT_MARKS : CONTACT_MARKS);

  return (
    <View
      style={[styles.mark, box, muted ? styles.empty : { backgroundColor: palette.bg }]}
      accessible={false}
    >
      <Text
        allowFontScaling={false}
        style={[
          styles.letter,
          { fontSize: size * 0.4 },
          muted ? styles.emptyLetter : { color: palette.fg },
        ]}
      >
        {trimmed.charAt(0) || '؟'}
      </Text>
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    mark: { alignItems: 'center', justifyContent: 'center' },
    letter: { ...type.heading, lineHeight: undefined },
    empty: { backgroundColor: c.surface.sunken },
    emptyLetter: { color: c.text.faint },
  });
