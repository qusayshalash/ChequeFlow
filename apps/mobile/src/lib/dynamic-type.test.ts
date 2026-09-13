import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * What happens when the phone's text is set larger.
 *
 * React Native scales every `Text` with the system setting, so the support was
 * never missing — it had simply never been looked at. Looking at it found one
 * real fault and one shape of it.
 *
 * A row clamped to `numberOfLines={1}` does not wrap when its text outgrows
 * the row: it truncates. On the amounts that meant "USD 9,000.00" could render
 * as "USD 9,00…", which is not a smaller number on screen — it is a different
 * one, in an app whose whole job is the number. Amounts now shrink to fit
 * instead, through one component, down to three quarters and no further.
 *
 * The other shape is the opposite: a monogram is sized from the circle it sits
 * in, not from the reading size, so scaling it pushes the letter out of a
 * container that cannot grow. Those opt out.
 */

const SRC = join(process.cwd(), 'src');
const APP = join(process.cwd(), 'app');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return files(full);
    return /\.tsx$/.test(entry) ? [full] : [];
  });
}

function sources(): Array<{ file: string; text: string }> {
  return [...files(APP), ...files(SRC)].map((file) => ({
    file: file.replace(process.cwd(), ''),
    text: readFileSync(file, 'utf8'),
  }));
}

const UI = readFileSync(join(SRC, 'components', 'ui.tsx'), 'utf8');

describe('larger text', () => {
  it('shrinks an amount rather than cutting it short', () => {
    const component = UI.slice(UI.indexOf('export function Amount'));
    expect(component).toContain('adjustsFontSizeToFit');
    expect(component).toContain('minimumFontScale={0.75}');
  });

  it('never traps an amount on one line it can outgrow', () => {
    // The fault is the pair, not the clamp: money free to wrap is fine — the
    // reports screen prints several currencies joined together and lets them
    // run onto a second line. What cannot happen is money clamped to one line
    // by something that shrinks nothing, because that truncates.
    const offenders: string[] = [];

    for (const { file, text } of sources()) {
      for (const match of text.matchAll(
        /<Text\b[^>]*numberOfLines=\{1\}[^>]*>\s*\{?[^<]*?\bmoney\(/g,
      )) {
        offenders.push(`${file}: ${match[0].replace(/\s+/g, ' ').slice(0, 70)}`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it('actually uses the component, rather than repeating its props', () => {
    const using = sources().filter((entry) => /<Amount\b/.test(entry.text));
    // Nine places print a sum. A rule written out by hand in each of them is a
    // rule that will be written out slightly differently in the tenth.
    expect(using.length).toBeGreaterThanOrEqual(6);

    for (const { file, text } of sources()) {
      if (file.endsWith('/components/ui.tsx')) continue;
      expect(text, `${file} repeats the shrink rule by hand`).not.toContain('minimumFontScale');
    }
  });

  it('does not scale a monogram out of the circle it sits in', () => {
    const marks = readFileSync(join(SRC, 'components', 'marks.tsx'), 'utf8');
    const letters = [...marks.matchAll(/<Text[\s\S]{0,120}?fontSize: size/g)];
    expect(letters.length).toBeGreaterThanOrEqual(2);
    for (const letter of letters) {
      expect(letter[0], 'a monogram still scales with the reading size').toContain(
        'allowFontScaling={false}',
      );
    }
  });

  it('keeps the opt-out to graphics, never to words', () => {
    // Turning scaling off is how an app quietly stops supporting the setting.
    // It is allowed for a glyph inside a fixed circle and nowhere else.
    const optingOut = sources().filter(
      (entry) =>
        entry.text.includes('allowFontScaling={false}') && !entry.file.endsWith('marks.tsx'),
    );
    expect(optingOut.map((entry) => entry.file)).toEqual([]);
  });
});
