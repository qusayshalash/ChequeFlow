/**
 * Design tokens shared by the web dashboard and the mobile app.
 *
 * Colours are chosen for contrast: every `fg` value below reaches at least
 * 4.5:1 against its paired `bg` (WCAG AA for body text), because the people
 * using this system read numbers off a screen all day.
 */

export const colors = {
  brand: '#0F5C4E',
  brandDark: '#0A4238',
  brandLight: '#E6F2EF',
  surface: '#FFFFFF',
  surfaceMuted: '#F6F7F9',
  border: '#D9DEE3',
  text: '#14181D',
  textMuted: '#57606A',
  danger: '#B3261E',
  dangerBg: '#FDECEA',
  warning: '#8A5A00',
  warningBg: '#FFF4E0',
  success: '#12633F',
  successBg: '#E7F4EC',
  info: '#0B4FA3',
  infoBg: '#E8F0FB',
} as const;

/** Minimum touch target, in points/px — comfortable for non-technical staff. */
export const MIN_TOUCH_TARGET = 48;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
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
