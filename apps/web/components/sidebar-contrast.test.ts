import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The sidebar's text must stay readable, in both themes.
 *
 * Its colours live in `globals.css` as a set of tokens defined twice — once
 * for the light rail and once for the dark one — and they are easy to nudge
 * while chasing a look. The section headings have already been below the line
 * twice: at 35% white on the old dark panel (3.2:1) and again at `#8b9895` on
 * the light one (3.0:1).
 *
 * This reads the real values out of the stylesheet rather than restating them,
 * so changing a token in the wrong direction fails here instead of shipping.
 */

const CSS = join(__dirname, '../app/globals.css');

/** Foreground tokens that must clear AA against the panel they sit on. */
const ON_PANEL = ['--app-sidebar-text', '--app-sidebar-muted', '--app-sidebar-section'] as const;

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

/**
 * Every definition of `name`, in source order.
 *
 * There are two of each — the light theme's and the dark theme's — and both
 * have to hold, so this returns all of them rather than the first.
 */
function values(name: string): string[] {
  const css = readFileSync(CSS, 'utf8');
  const found = [...css.matchAll(new RegExp(`${name}:\\s*(#[0-9a-f]{6})`, 'gi'))].map(
    (match) => match[1]!,
  );
  expect(found.length, `${name} is not defined in globals.css`).toBeGreaterThan(0);
  return found;
}

describe('sidebar contrast', () => {
  it('keeps every text token at AA against its own panel', () => {
    const panels = values('--app-sidebar');

    // Theme by theme: the light foreground belongs on the light panel, and
    // pairing it with the dark one would test a combination nobody sees.
    panels.forEach((panel, theme) => {
      for (const token of ON_PANEL) {
        const foreground = values(token)[theme];
        expect(foreground, `${token} has no value for theme ${theme}`).toBeDefined();
        expect(
          contrastRatio(foreground!, panel),
          `${token} (${foreground}) on ${panel}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    });
  });

  it('keeps the current page legible on its tinted pill', () => {
    const backgrounds = values('--app-sidebar-active-bg');

    backgrounds.forEach((background, theme) => {
      const foreground = values('--app-sidebar-active-text')[theme];
      expect(foreground).toBeDefined();
      expect(
        contrastRatio(foreground!, background),
        `active text ${foreground} on ${background}`,
      ).toBeGreaterThanOrEqual(4.5);
    });
  });
});
