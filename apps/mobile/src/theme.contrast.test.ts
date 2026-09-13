import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Text on the app's grounds must stay readable — in both themes.
 *
 * The direction is `ui-ux-pro-max`'s Dimensional Layering, and the skill marks
 * that style `accessibility risk:high` — depth is easy to chase at the cost of
 * contrast. It had already happened: `text.faint` sat at 2.96:1 on a white
 * card while carrying real sentences ("not yet", a due distance, an amount's
 * caption).
 *
 * Dark mode is the half that fails quietly: a palette inverted rather than
 * chosen looks right to whoever picked it and cannot be read on a phone in
 * daylight. Both palettes are held to the same floor here, on their own
 * grounds — each set's own card, and its own darkest gradient stop.
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

/** The source of one palette, by its exported name. */
function palette(which: 'lightPalette' | 'darkPalette'): string {
  const start = THEME.indexOf(`export const ${which}: Palette = {`);
  expect(start, `${which} is missing from theme.ts`).toBeGreaterThan(-1);
  const end = THEME.indexOf('\n};', start);
  return THEME.slice(start, end);
}

function hex(name: string, source: string = THEME): string {
  // Either a literal in theme.ts, or an alias of a brand token — `primary` and
  // `secondary` are `brand.text` and `brand.textMuted`, so the value has to be
  // followed through to where it is actually written.
  const direct = new RegExp(`${name}:\\s*'(#[0-9a-f]{6})'`, 'i').exec(source);
  if (direct) return direct[1]!;

  const alias = new RegExp(`${name}:\\s*brand\\.(\\w+)`).exec(source);
  expect(alias, `${name} is neither a hex colour nor a brand alias in theme.ts`).not.toBeNull();

  const token = new RegExp(`\\b${alias![1]!}:\\s*'(#[0-9a-f]{6})'`, 'i').exec(TOKENS);
  expect(token, `brand.${alias![1]!} is not a hex colour in tokens.ts`).not.toBeNull();
  return token![1]!;
}

/** The gradient's stops, in source order. */
function gradient(source: string = THEME): string[] {
  const block = /pageGradient: \[([^\]]*)\]/.exec(source);
  expect(block, 'pageGradient is missing from the palette').not.toBeNull();
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
  for (const which of ['lightPalette', 'darkPalette'] as const) {
    describe(which, () => {
      const source = palette(which);

      it('keeps every text colour at AA on the card and on the page', () => {
        const stops = gradient(source);
        // The stop furthest from the text is the hardest ground; passing there
        // passes everywhere on the gradient.
        const hardest = stops.reduce((worst, stop) =>
          Math.abs(luminance(stop) - luminance(hex('primary', source))) >
          Math.abs(luminance(worst) - luminance(hex('primary', source)))
            ? worst
            : stop,
        );
        const grounds = [hex('card', source), hardest];

        // `onBrand` is left out on purpose: it only ever sits on the accent,
        // never on either of these.
        for (const name of ['primary', 'secondary', 'faint']) {
          const colour = hex(name, source);
          for (const ground of grounds) {
            expect(
              contrastRatio(colour, ground),
              `${which} text.${name} on ${ground}`,
            ).toBeGreaterThanOrEqual(4.5);
          }
        }
      });

      it('keeps the gradient stops close enough to be one ground', () => {
        const spread = gradient(source).map(luminance);
        // If the ends drift apart, the same caption passes at the top of the
        // screen and fails at the bottom.
        expect(Math.max(...spread) - Math.min(...spread)).toBeLessThan(0.1);
      });

      it('separates the surfaces it stacks', () => {
        // Depth reads by shadow in the light and by lightness in the dark, so
        // a card that matches its page is invisible in one theme and fine in
        // the other.
        expect(hex('card', source)).not.toBe(hex('page', source));
      });
    });
  }
});
