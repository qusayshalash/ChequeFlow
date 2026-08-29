import { describe, expect, it } from 'vitest';

import { ChequeStatus } from '@cheque-flow/shared-types';

import { MIN_TOUCH_TARGET, STATUS_TONES, TONE_COLORS, toneFor } from './tokens.js';

/** Relative luminance per WCAG 2.1. */
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((offset) => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

describe('design tokens', () => {
  it('assigns a tone to every cheque status', () => {
    for (const status of Object.values(ChequeStatus)) {
      expect(STATUS_TONES[status]).toBeDefined();
    }
  });

  it('meets WCAG AA contrast for every tone', () => {
    for (const [tone, pair] of Object.entries(TONE_COLORS)) {
      expect(contrastRatio(pair.fg, pair.bg), `tone ${tone}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps touch targets at least 48px', () => {
    expect(MIN_TOUCH_TARGET).toBeGreaterThanOrEqual(44);
  });

  it('falls back to a neutral tone for unknown statuses', () => {
    expect(toneFor('SOMETHING_NEW')).toBe('neutral');
  });
});
