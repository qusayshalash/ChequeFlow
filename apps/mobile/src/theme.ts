import { Platform, type TextStyle } from 'react-native';

import { colors as brand } from '@cheque-flow/ui/tokens';

/**
 * The phone app's design system.
 *
 * Direction comes from `ui-ux-pro-max`, which recommended **Minimalism & Swiss
 * Style** for this product ("enterprise apps, dashboards, professional tools")
 * with subtle motion and a strict type hierarchy. That is the right read: this
 * is a ledger somebody opens forty times a day, not something to be admired.
 *
 * Two of the skill's recommendations were deliberately not taken:
 *
 *  - **Its palette** — gold `#F59E0B` with a purple accent on navy. That is a
 *    crypto-trading look, and this app has a brand already: the same teal the
 *    web app uses. The skill's own `consistency` rule outranks a generic
 *    fintech swatch, and two halves of one product must not look like two
 *    products.
 *  - **Its page pattern** — "Hero / Proof / Contact Sales". That is a
 *    marketing landing page. The dataset had no pattern for an internal
 *    operations tool (the search returned nothing), so the layout below is
 *    reasoned from the Quick Reference rules instead, and labelled as such.
 *
 * What Swiss style means in practice here: one accent colour and nothing else
 * decorative, hairline separators instead of shadows, whitespace doing the
 * grouping, and a type scale strict enough that weight alone tells you what
 * matters.
 */

/** 4pt grid. Every margin, gap and padding in the app is one of these. */
export const space = {
  '0': 0,
  '1': 4,
  '2': 8,
  '3': 12,
  '4': 16,
  '5': 20,
  '6': 24,
  '8': 32,
  '10': 40,
  '12': 48,
  '16': 64,
} as const;

/**
 * Type scale.
 *
 * `lineHeight` is generous because Arabic ascenders and descenders are taller
 * than Latin ones; the platform default clips them, which is what made the old
 * screens look cramped.
 */
export const type: Record<
  'display' | 'title' | 'heading' | 'body' | 'bodyStrong' | 'callout' | 'label' | 'caption',
  TextStyle
> = {
  display: { fontSize: 30, lineHeight: 42, fontWeight: '700' },
  title: { fontSize: 21, lineHeight: 32, fontWeight: '700' },
  heading: { fontSize: 17, lineHeight: 26, fontWeight: '700' },
  body: { fontSize: 16, lineHeight: 26, fontWeight: '400' },
  bodyStrong: { fontSize: 16, lineHeight: 26, fontWeight: '600' },
  callout: { fontSize: 14, lineHeight: 22, fontWeight: '400' },
  label: { fontSize: 13, lineHeight: 20, fontWeight: '600' },
  caption: { fontSize: 12, lineHeight: 18, fontWeight: '500' },
};

/**
 * Money and cheque numbers.
 *
 * Tabular figures so a column of amounts lines up and does not jitter as the
 * digits change — the skill's `number-tabular` rule. The system faces carry
 * them; a downloaded webfont is not worth a dependency for this.
 */
export const numeric: TextStyle = {
  fontVariant: ['tabular-nums'],
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  /** The sign-in card's corner, for anything that floats. */
  xl: 24,
  pill: 999,
} as const;

/**
 * Surfaces.
 *
 * **This replaces the earlier "a line, not a shadow" rule.** That was the
 * Swiss reading, and it held until the sign-in screen was rebuilt to the
 * reference design: a mint field with the card floating on it. One screen lit
 * differently from every other screen is worse than either choice made
 * consistently, so the rest of the app follows it.
 *
 * The direction is `ui-ux-pro-max`'s **Dimensional Layering**, which the skill
 * returns for "elevation, floating, cards, spatial hierarchy" and lists as
 * best for dashboards and card layouts — what this app is. Its own note marks
 * the style `accessibility risk:high`, requiring 4.5:1 text, so depth never
 * carries meaning here: every status still says its name and keeps its colour.
 *
 * Lines have not gone. A hairline still separates rows inside a card; the
 * shadow separates the card from the page. Two jobs, two tools.
 */
export const surface = {
  page: '#F2F6F5',
  card: brand.surface,
  sunken: '#EFF2F1',
  line: '#E4E8E7',
  lineStrong: '#CFD6D4',
} as const;

/**
 * The soft mint field the sign-in screen introduced, now the app's ground.
 *
 * Three stops rather than two: a flat two-stop ramp bands visibly on an OLED
 * phone at this low contrast.
 */
export const pageGradient = ['#EAF3F0', '#F4F8F7', '#E6F0EC'] as const;

export const text = {
  primary: brand.text,
  secondary: brand.textMuted,
  /**
   * For a value that is absent rather than zero, and for captions.
   *
   * `#8B9995` looked right and measured 2.96:1 on white — under the 4.5 floor
   * for text, and it carries real sentences here ("not yet", a due distance,
   * an amount's caption). Darkened until it passes on *both* grounds it lands
   * on: 5.48:1 on a card, 4.71:1 on the darkest stop of the page gradient.
   * One value for both, because a caption does not know which it is on.
   */
  faint: '#5F6C68',
  onBrand: '#FFFFFF',
} as const;

export const accent = {
  base: brand.brand,
  dark: brand.brandDark,
  wash: brand.brandLight,
} as const;

/**
 * Four levels, from the skill's Dimensional Layering scale.
 *
 * A scale, not one-off values: the anti-pattern the skill names is "random
 * shadow values", and a card that is 12px on one screen and 28px on the next
 * reads as a rendering fault rather than a hierarchy.
 *
 * `shadowColor` is the brand's near-black, not pure black — grey shadow under
 * a mint page looks like dirt. Android reads only `elevation` and ignores the
 * rest, which is why both are always given together.
 */
export const elevation = {
  /** A card resting on the page. */
  1: {
    shadowColor: '#0B1F1A',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  /** The standard card. */
  2: {
    shadowColor: '#0B1F1A',
    shadowOpacity: 0.07,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  /** Something that should read as lifted — the sign-in card, a primary action. */
  3: {
    shadowColor: '#0B1F1A',
    shadowOpacity: 0.1,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  /** Only for content genuinely above the page: a sheet. */
  4: {
    shadowColor: '#0B1F1A',
    shadowOpacity: 0.16,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: -6 },
    elevation: 16,
  },
} as const;

/** Kept as the name the sheet already uses. */
export const sheetElevation = elevation[4];

/** Minimum tap target: 44pt on iOS, 48dp on Android (Apple HIG, Material). */
export const TAP = Platform.OS === 'ios' ? 44 : 48;

/**
 * Motion, at the skill's "subtle" tier.
 *
 * One duration for arriving, a shorter one for leaving — exits read as more
 * responsive when they are about two thirds of the entrance.
 */
export const motion = {
  enter: 240,
  exit: 160,
} as const;
