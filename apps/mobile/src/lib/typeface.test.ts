import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * One typeface, everywhere.
 *
 * The app was set in the platform default — SF Arabic on iOS, and on Android
 * whatever Noto fallback the phone shipped. IBM Plex Sans Arabic replaces it,
 * and the failure mode of that change is not a crash: it is a screen where
 * three labels are Plex and the fourth is the system face, which looks like a
 * rendering fault rather than a design.
 *
 * React Native does not cascade a font down the tree the way CSS does, so
 * every style that sets a size has to name a family too. These tests read the
 * screens and hold that line.
 *
 * Source text rather than imports, like every other suite here: importing a
 * screen pulls in `react-native`, which ships Flow and does not parse under
 * this runner.
 */

const THEME = readFileSync(join(process.cwd(), 'src', 'theme.ts'), 'utf8');

/** The body of the `type` scale, where each role is declared. */
function typeScale(): string {
  const start = THEME.indexOf('export const type');
  const end = THEME.indexOf('};', start);
  expect(start, 'no type scale in the theme').toBeGreaterThan(-1);
  return THEME.slice(start, end);
}

const ROOT = join(process.cwd(), '.');

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sources(full);
    return /\.tsx$/.test(entry) ? [full] : [];
  });
}

/** Every style object in the app that sets a font size. */
function stylesWithSize(): Array<{ file: string; body: string }> {
  const found: Array<{ file: string; body: string }> = [];

  for (const file of [...sources(join(ROOT, 'app')), ...sources(join(ROOT, 'src'))]) {
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(/\{[^{}]*\bfontSize:[^{}]*\}/g)) {
      found.push({ file: file.replace(ROOT, ''), body: match[0] });
    }
  }
  return found;
}

describe('the app has one typeface', () => {
  it('names a family for every role in the scale', () => {
    // Android does not synthesise weights: asking for 600 on a family with no
    // semibold file gives regular, silently.
    const roles = [...typeScale().matchAll(/^\s{2}(\w+): \{([^}]*)\}/gm)];
    expect(roles.length).toBeGreaterThanOrEqual(8);

    for (const [, role, body] of roles) {
      expect(body, `type.${role} has no family`).toContain('fontFamily: fontFamily.');
    }
  });

  it('sets no weight through the scale, since the family carries it', () => {
    expect(typeScale()).not.toContain('fontWeight');
  });

  it('loads every weight it names, before the first paint', () => {
    const layout = readFileSync(join(process.cwd(), 'app', '_layout.tsx'), 'utf8');
    for (const weight of ['400Regular', '500Medium', '600SemiBold', '700Bold']) {
      expect(layout, `weight ${weight} is used but never loaded`).toContain(weight);
    }
    // A face that arrives after the first frame re-flows every line on screen.
    expect(layout).toContain('preventAutoHideAsync');
  });

  it('leaves no size without a face', () => {
    const orphans = stylesWithSize().filter((entry) => {
      if (entry.body.includes('fontFamily')) return false;
      // A style built on the scale inherits the scale's family.
      if (entry.body.includes('...type.')) return false;
      // A size-only modifier — `{ fontSize: size * 0.4 }` passed in a style
      // array to scale a glyph — adjusts one property of a base style that
      // already carries the face. Naming a family here would override it, and
      // that is how the bank monogram lost its weight the first time.
      const keys = [...entry.body.matchAll(/(\w+):/g)].map((match) => match[1]);
      return !keys.every((key) => key === 'fontSize' || key === 'color');
    });

    // Named, not counted: the message has to say which screen to open.
    expect(orphans.map((entry) => `${entry.file}: ${entry.body.slice(0, 60)}`)).toEqual([]);
  });

  it('finds enough styles to be checking anything', () => {
    // Guards the scanner: a broken regex would make this suite pass by
    // reading nothing at all.
    expect(stylesWithSize().length).toBeGreaterThan(40);
  });
});
