import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The sidebar's text must stay readable.
 *
 * Its labels are white at a fraction of opacity over a near-black panel, and
 * that fraction is easy to nudge downwards while chasing a look: the section
 * headings, the wordmark's subtitle and the collapse control all sat at 35%,
 * which measures 3.2:1 — below the 4.5:1 floor for text that size.
 *
 * This reads the real values out of the two files rather than restating them,
 * so lowering an opacity in the component or darkening the panel in the
 * stylesheet fails here instead of shipping.
 */

const ROOT = join(__dirname, '..');

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

/** White laid over the panel at `alpha`, which is what the browser paints. */
function whiteOver(background: string, alpha: number): string {
  const blended = [1, 3, 5].map((offset) => {
    const under = Number.parseInt(background.slice(offset, offset + 2), 16);
    return Math.round(255 * alpha + under * (1 - alpha));
  });
  return `#${blended.map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}

/** Every `--app-sidebar:` the stylesheet defines — light theme and dark. */
function sidebarBackgrounds(): string[] {
  const css = readFileSync(join(ROOT, 'app/globals.css'), 'utf8');
  const found = [...css.matchAll(/--app-sidebar:\s*(#[0-9a-f]{6})/gi)].map((match) => match[1]!);
  expect(found.length, 'no --app-sidebar in globals.css').toBeGreaterThan(0);
  return found;
}

/** Every `text-white/NN` the sidebar component uses. */
function textOpacities(): number[] {
  const shell = readFileSync(join(ROOT, 'components/app-shell.tsx'), 'utf8');
  const found = [...shell.matchAll(/text-white\/(\d{1,3})\b/g)].map(
    (match) => Number(match[1]) / 100,
  );
  expect(found.length, 'no text-white/NN in app-shell.tsx').toBeGreaterThan(0);
  return [...new Set(found)];
}

describe('sidebar contrast', () => {
  it('keeps every white-on-panel text at AA against both themes', () => {
    for (const background of sidebarBackgrounds()) {
      for (const alpha of textOpacities()) {
        const ratio = contrastRatio(whiteOver(background, alpha), background);
        expect(
          ratio,
          `text-white/${Math.round(alpha * 100)} on ${background}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('keeps the muted token readable too', () => {
    const css = readFileSync(join(ROOT, 'app/globals.css'), 'utf8');
    const muted = [...css.matchAll(/--app-sidebar-muted:\s*(#[0-9a-f]{6})/gi)].map(
      (match) => match[1]!,
    );
    expect(muted.length).toBeGreaterThan(0);

    for (const background of sidebarBackgrounds()) {
      for (const colour of muted) {
        expect(
          contrastRatio(colour, background),
          `${colour} on ${background}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});
