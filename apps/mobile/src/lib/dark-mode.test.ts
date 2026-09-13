import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The app follows the phone, in every screen or in none.
 *
 * React Native has no cascade: a colour is a value copied into a style object
 * when the module loads, not a variable the renderer reads later. So a theme
 * that changes at runtime cannot be a set of constants — every screen builds
 * its styles from the palette in context, through `useStyles`.
 *
 * The failure mode is partial, and it is ugly: one screen that kept its
 * constants is a white page in a dark app, and one colour written as a hex
 * literal inside a themed stylesheet is a white patch on a dark card. These
 * tests look for both.
 */

const APP = join(process.cwd(), 'app');
const SRC = join(process.cwd(), 'src');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return files(full);
    return /\.tsx$/.test(entry) ? [full] : [];
  });
}

function screens(): Array<{ file: string; text: string }> {
  return [...files(APP), ...files(SRC)].map((file) => ({
    file: file.replace(process.cwd(), ''),
    text: readFileSync(file, 'utf8'),
  }));
}

describe('dark mode', () => {
  it('builds every stylesheet from the palette', () => {
    const frozen = screens().filter((entry) =>
      /const styles = StyleSheet\.create/.test(entry.text),
    );
    // A stylesheet created at module load holds light colours for the life of
    // the process, whatever the phone is set to.
    expect(frozen.map((entry) => entry.file)).toEqual([]);
  });

  it('gives every stylesheet to a component that can read the theme', () => {
    const orphans = screens().filter(
      (entry) =>
        entry.text.includes('const makeStyles') && !entry.text.includes('useStyles(makeStyles)'),
    );
    expect(orphans.map((entry) => entry.file)).toEqual([]);
  });

  it('writes no colour into a screen that the palette should decide', () => {
    const literals: string[] = [];

    for (const { file, text } of screens()) {
      for (const match of text.matchAll(/#[0-9A-Fa-f]{6}/g)) {
        // Shadows are the exception: a shadow is the same near-black in both
        // themes, and in the dark it is barely drawn at all.
        const line = text.slice(text.lastIndexOf('\n', match.index) + 1, match.index + 20);
        if (line.includes('shadowColor')) continue;
        literals.push(`${file}: ${match[0]}`);
      }
    }

    // The tone and monogram palettes are data, not screen colours, and each
    // carries its own dark set beside it.
    const outsidePalettes = literals.filter(
      (entry) =>
        !entry.startsWith('/src/components/marks.tsx') &&
        !entry.startsWith('/src/components/dashboard-parts.tsx'),
    );
    expect(outsidePalettes).toEqual([]);
  });

  it('gives every light palette a dark counterpart', () => {
    const marks = readFileSync(join(SRC, 'components', 'marks.tsx'), 'utf8');
    const parts = readFileSync(join(SRC, 'components', 'dashboard-parts.tsx'), 'utf8');

    for (const [name, text, sets] of [
      ['marks', marks, ['BANK_MARKS', 'CONTACT_MARKS']],
      ['stat tones', parts, ['TONES']],
    ] as const) {
      for (const set of sets) {
        expect(text, `${name}: ${set} has no dark set`).toContain(`DARK_${set}`);
      }
      // And the dark one has to be reachable, not merely declared.
      expect(text, `${name} never asks which theme it is in`).toContain('c.dark ?');
    }
  });

  it('lets the phone decide, and does not ask again in the app', () => {
    const config = JSON.parse(readFileSync(join(process.cwd(), 'app.json'), 'utf8')) as {
      expo: { userInterfaceStyle?: string };
    };
    expect(config.expo.userInterfaceStyle).toBe('automatic');

    // Someone who wants dark at night has already said so in Settings. An
    // in-app switch is a second answer to a question already answered.
    const context = readFileSync(join(SRC, 'theme-context.tsx'), 'utf8');
    expect(context).toContain('useColorScheme');
    expect(context).not.toContain('setTheme');
  });
});
