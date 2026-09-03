/**
 * Design tokens shared by the web dashboard and the mobile app.
 *
 * Colours are chosen for contrast: every `fg` value below reaches at least
 * 4.5:1 against its paired `bg` (WCAG AA for body text), because the people
 * using this system read numbers off a screen all day.
 */

export const colors = {
  brand: '#087F6D',
  brandDark: '#075F54',
  brandLight: '#E8F7F3',
  surface: '#FFFFFF',
  surfaceMuted: '#F4F6F8',
  border: '#E2E7EB',
  text: '#15211F',
  textMuted: '#53625F',
  danger: '#C43D42',
  dangerBg: '#FCEDEE',
  warning: '#9A5908',
  warningBg: '#FFF5E7',
  // One shade darker, for the same reason as `info` below: 4.46:1 on its own
  // background is under the 4.5:1 this package's test enforces.
  success: '#127F5B',
  successBg: '#E9F7F1',
  // Two shades darker than the palette's own blue: at #2773BD the info badge
  // sat at 4.42:1 against its background, under the 4.5:1 this package's own
  // test enforces. The difference is invisible; failing the guard is not.
  info: '#2671BA',
  infoBg: '#EBF4FC',
} as const;

/** Minimum touch target, in points/px — comfortable for non-technical staff. */
export const MIN_TOUCH_TARGET = 48;

export const spacing = {
  xs: 4,
  sm: 8,
  base: 12,
  md: 16,
  ml: 20,
  lg: 24,
  xl: 32,
  xxl2: 40,
  xxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
} as const;

export const fontSize = {
  xs: 12,
  sm: 14,
  base: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
} as const;

export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

/** Maps a cheque status to a visual tone. Used by both apps. */
export const STATUS_TONES: Readonly<Record<string, StatusTone>> = {
  DRAFT: 'neutral',
  PENDING_REVIEW: 'warning',
  IN_HAND: 'info',
  RESERVED: 'info',
  DEPOSITED: 'info',
  TRANSFERRED: 'info',
  CLEARED: 'success',
  BOUNCED: 'danger',
  RETURNED: 'warning',
  POSTPONED: 'warning',
  CANCELLED: 'neutral',
  LOST: 'danger',
};

export function toneFor(status: string): StatusTone {
  return STATUS_TONES[status] ?? 'neutral';
}

export const TONE_COLORS: Readonly<Record<StatusTone, { bg: string; fg: string }>> = {
  neutral: { bg: colors.surfaceMuted, fg: colors.textMuted },
  info: { bg: colors.infoBg, fg: colors.info },
  success: { bg: colors.successBg, fg: colors.success },
  warning: { bg: colors.warningBg, fg: colors.warning },
  danger: { bg: colors.dangerBg, fg: colors.danger },
};
