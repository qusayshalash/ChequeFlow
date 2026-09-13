import { Platform, type TextStyle } from 'react-native';

import { DARK_COLORS, colors as brand } from '@cheque-flow/ui/tokens';

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
 * The app's typeface: IBM Plex Sans Arabic.
 *
 * Everything was set in the platform default before — SF Arabic on iOS, and on
 * Android whatever Noto fallback that phone happens to ship. A ledger that
 * renders in a different face on every device does not look like a product,
 * and the system face is the one thing no design decision can distinguish.
 *
 * Plex Arabic is drawn for interfaces rather than for documents: open counters
 * that survive at 12pt, and Latin figures in the same family as the Arabic, so
 * `9,000.00` beside «تسعة آلاف» is one typeface rather than two.
 *
 * React Native does not synthesise weights reliably on Android — asking for
 * `fontWeight: '600'` on a family that has no semibold file gives you regular,
 * silently. So each weight names its own file, and `fontWeight` is dropped
 * from the scale entirely: the family carries it.
 */
export const fontFamily = {
  regular: 'IBMPlexSansArabic_400Regular',
  medium: 'IBMPlexSansArabic_500Medium',
  semibold: 'IBMPlexSansArabic_600SemiBold',
  bold: 'IBMPlexSansArabic_700Bold',
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
  display: { fontSize: 30, lineHeight: 42, fontFamily: fontFamily.bold },
  title: { fontSize: 21, lineHeight: 32, fontFamily: fontFamily.bold },
  heading: { fontSize: 17, lineHeight: 26, fontFamily: fontFamily.semibold },
  body: { fontSize: 16, lineHeight: 26, fontFamily: fontFamily.regular },
  bodyStrong: { fontSize: 16, lineHeight: 26, fontFamily: fontFamily.semibold },
  callout: { fontSize: 14, lineHeight: 22, fontFamily: fontFamily.regular },
  label: { fontSize: 13, lineHeight: 20, fontFamily: fontFamily.medium },
  caption: { fontSize: 12, lineHeight: 18, fontFamily: fontFamily.medium },
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

/**
 * The app in the dark.
 *
 * Not an inversion. Inverting a light palette gives pure black under white
 * text, which on an OLED phone smears on every scroll, and a brand colour that
 * was chosen against white turns muddy against black. So the dark set is
 * chosen on its own terms and measured on its own grounds:
 *
 *  - The ground is a very dark green-grey rather than black, and each surface
 *    above it is *lighter* than the one below. Depth reads by lightness in the
 *    dark, where a shadow is invisible — which is why the elevation scale is
 *    almost inert here and the surfaces do that work instead.
 *  - The brand teal is lifted well above its light-mode value. `#087F6D` on a
 *    dark ground is a smudge; the lifted tone carries the same hue at a
 *    contrast a reader can use.
 *  - Every foreground is checked against the surface it actually lands on, not
 *    against the page. `theme.contrast.test.ts` holds both sets to the same
 *    4.5:1 floor, so dark mode cannot be the one that quietly fails.
 *
 * Status colours come from the shared tokens, which the web also uses; the
 * dark set lives beside them there rather than here, so a status keeps its
 * meaning across both halves of the product.
 */
export interface Palette {
  surface: { page: string; card: string; sunken: string; line: string; lineStrong: string };
  text: { primary: string; secondary: string; faint: string; onBrand: string };
  accent: { base: string; dark: string; wash: string };
  /** The three stops behind every screen. */
  pageGradient: readonly [string, string, string];
  /** What a colour means: danger, warning, success, information. */
  semantic: {
    danger: string;
    dangerBg: string;
    warning: string;
    warningBg: string;
    success: string;
    successBg: string;
    info: string;
    infoBg: string;
  };
  /** True when this is the dark set — for a status bar, a keyboard, an image. */
  dark: boolean;
}

export const lightPalette: Palette = {
  surface: {
    page: '#F2F6F5',
    card: brand.surface,
    sunken: '#EFF2F1',
    line: '#E4E8E7',
    lineStrong: '#CFD6D4',
  },
  text: {
    primary: brand.text,
    secondary: brand.textMuted,
    faint: '#5F6C68',
    onBrand: '#FFFFFF',
  },
  accent: { base: brand.brand, dark: brand.brandDark, wash: brand.brandLight },
  pageGradient: ['#EAF3F0', '#F4F8F7', '#E6F0EC'],
  semantic: {
    danger: brand.danger,
    dangerBg: brand.dangerBg,
    warning: brand.warning,
    warningBg: brand.warningBg,
    success: brand.success,
    successBg: brand.successBg,
    info: brand.info,
    infoBg: brand.infoBg,
  },
  dark: false,
};

export const darkPalette: Palette = {
  surface: {
    // Lighter as it comes forward: a card is not a shadow away from the page
    // in the dark, it is a shade nearer.
    page: '#0C1513',
    card: '#16211E',
    sunken: '#111B19',
    line: '#243430',
    lineStrong: '#33453F',
  },
  text: {
    primary: '#E8EFEC',
    secondary: '#A7B8B2',
    faint: '#849690',
    onBrand: '#04211C',
  },
  accent: { base: '#4FBFA5', dark: '#6FD3B9', wash: '#14322B' },
  pageGradient: ['#0E1A17', '#0C1513', '#0A1211'],
  // Shared with the web's own dark set, so a bounced cheque is one red across
  // both halves of the product.
  semantic: DARK_COLORS,
  dark: true,
};

/**
 * The light palette, still exported under its old names.
 *
 * Every screen reads these at module load, inside `StyleSheet.create`, which
 * runs once. They are the light set and stay it; a screen that has been moved
 * to `useStyles` takes its colours from the palette in context instead.
 */
export const surface = lightPalette.surface;

/**
 * The soft mint field the sign-in screen introduced, now the app's ground.
 *
 * Three stops rather than two: a flat two-stop ramp bands visibly on an OLED
 * phone at this low contrast.
 */
export const pageGradient = lightPalette.pageGradient;

export const text = lightPalette.text;

export const accent = lightPalette.accent;

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
