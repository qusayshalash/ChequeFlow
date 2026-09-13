import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The sign-in screen asks two questions and gets out of the way.
 *
 * It used to carry a tagline, a welcome line with a second line explaining the
 * welcome, a placeholder in each field repeating that field's label, three
 * reassurance pillars with a title and a hint each, and a copyright notice —
 * a dozen strings between opening the app and typing a user name. The claims
 * in the pillars ("secure and trusted", "fast experience") are the copy that
 * makes a product look less sure of itself, not more.
 *
 * These tests hold the screen at what signing in needs, and hold the identity
 * to the app's real icon rather than a glyph drawn to stand in for it.
 */

const SCREEN = readFileSync(join(process.cwd(), 'app', 'login.tsx'), 'utf8');

/** Every `t('…')` the screen renders, in source order. */
function strings(): string[] {
  return [...SCREEN.matchAll(/\bt\('([^']+)'\)/g)].map((match) => match[1]!);
}

describe('the sign-in screen', () => {
  it('shows the app icon itself', () => {
    // A teal square with a cheque glyph in it made this the one screen where
    // the product did not look like itself.
    expect(SCREEN).toContain("from '../assets/icon.png'");
    expect(SCREEN).toContain('source={appIcon}');
  });

  it('carries none of the copy that was only there to fill the screen', () => {
    for (const gone of [
      'auth.tagline',
      'auth.welcomeHint',
      'auth.rights',
      'auth.pillarSecureTitle',
      'auth.pillarEasyTitle',
      'auth.pillarFastTitle',
    ]) {
      expect(SCREEN, `${gone} is back on the sign-in screen`).not.toContain(gone);
    }
  });

  it('labels both fields, and does not repeat the label in a placeholder', () => {
    // The label stays: a field whose only name is a placeholder loses it the
    // moment someone types.
    expect(SCREEN).toContain("t('auth.username')");
    expect(SCREEN).toContain("t('auth.password')");
    expect(SCREEN).not.toContain('usernamePlaceholder');
    expect(SCREEN).not.toContain('passwordPlaceholder');
  });

  it('stays short enough to take in at a glance', () => {
    // Not a style rule: every line here is read by someone who wants to be
    // somewhere else. Counted as distinct strings, so the language menu's
    // repeated labels do not inflate it.
    const visible = new Set(strings().filter((key) => !key.startsWith('errors.')));
    expect(visible.size).toBeLessThanOrEqual(10);
  });

  it('keeps what a person needs to get in', () => {
    // Trimming must not take the controls with the copy: the password reveal,
    // the error, and the language switch all earn their place.
    expect(SCREEN).toContain("t('auth.submit')");
    expect(SCREEN).toContain('showPassword');
    expect(SCREEN).toContain("t('common.language')");
    expect(SCREEN).toContain('accessibilityRole="alert"');
  });
});
