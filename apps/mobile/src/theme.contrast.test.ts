import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Text on the app's two grounds must stay readable.
 *
 * The direction is `ui-ux-pro-max`'s Dimensional Layering, and the skill marks
 * that style `accessibility risk:high` — depth is easy to chase at the cost of
 * contrast. It had already happened: `text.faint` sat at 2.96:1 on a white
 * card while carrying real sentences ("not yet", a due distance, an amount's
 * caption).
 *
 * The values are read out of `theme.ts` as text rather than imported. The
 * module pulls in `Platform` for the tap-target size, which drags React
 * Native's Flow-typed entry point in with it, and the test runner cannot parse
 * that. Reading the file also means a colour changed anywhere in it is caught,
 * not only the ones an import happens to name.
 */

const THEME = readFileSync(join(__dirname, 'theme.ts'), 'utf8');
/** Two of the three text colours are aliases of the shared brand tokens. */
const TOKENS = readFileSync(join(__dirname, '../../../packages/ui/src/tokens.ts'), 'utf8');

function hex(name: string): string {
  // Either a literal in theme.ts, or an alias of a brand token — `primary` and
  // `secondary` are `brand.text` and `brand.textMuted`, so the value has to be
  // followed through to where it is actually written.
  const direct = new RegExp(`${name}:\\s*'(#[0-9a-f]{6})'`, 'i').exec(THEME);
  if (direct) return direct[1]!;

  const alias = new RegExp(`${name}:\\s*brand\\.(\\w+)`).exec(THEME);
  expect(alias, `${name} is neither a hex colour nor a brand alias in theme.ts`).not.toBeNull();

  const token = new RegExp(`\\b${alias![1]!}:\\s*'(#[0-9a-f]{6})'`, 'i').exec(TOKENS);
  expect(token, `brand.${alias![1]!} is not a hex colour in tokens.ts`).not.toBeNull();
  return token![1]!;
}

/** The gradient's stops, in source order. */
function gradient(): string[] {
  const block = /pageGradient = \[([^\]]*)\]/.exec(THEME);
  expect(block, 'pageGradient is missing from theme.ts').not.toBeNull();
  const stops = [...block![1]!.matchAll(/'(#[0-9a-f]{6})'/gi)].map((match) => match[1]!);
  expect(stops.length, 'pageGradient has no stops').toBeGreaterThan(1);
  return stops;
}

function luminance(colour: string): number {
  const channels = [1, 3, 5].map((offset) => {
    const value = Number.parseInt(colour.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

describe('theme contrast', () => {
  it('keeps every text colour at AA on the card and on the page', () => {
    const stops = gradient();
    // The darkest stop is the hardest ground; passing there passes everywhere
    // on the gradient.
    const darkest = stops.reduce((worst, stop) =>
      luminance(stop) < luminance(worst) ? stop : worst,
    );
    const grounds = ['#FFFFFF', darkest];

    // `onBrand` is left out on purpose: it is white and only ever sits on the
    // accent, never on either of these.
    for (const name of ['primary', 'secondary', 'faint']) {
      const colour = hex(name);
      for (const ground of grounds) {
        expect(contrastRatio(colour, ground), `text.${name} on ${ground}`).toBeGreaterThanOrEqual(
          4.5,
        );
      }
    }
  });

  it('keeps the gradient stops close enough to be one ground', () => {
    const spread = gradient().map(luminance);
    // If the ends drift apart, the same caption passes at the top of the
    // screen and fails at the bottom.
    expect(Math.max(...spread) - Math.min(...spread)).toBeLessThan(0.1);
  });
});
