import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * What the phone says without words.
 *
 * Two senses were unused. Nothing in the app vibrated — the books could be
 * changed, or refuse to change, and the phone in your hand said nothing. And
 * the theme declared `motion.enter` and `motion.exit` while the app contained
 * no animation at all, so every panel and bar snapped into place.
 *
 * Both are easy to overdo, and overdoing them is what makes someone turn
 * haptics off for every app on the phone. These tests hold the line at the
 * moments that change the books, and at the two places where movement answers
 * a tap.
 */

const SRC = join(process.cwd(), 'src');
const APP = join(process.cwd(), 'app');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return files(full);
    return /\.tsx?$/.test(entry) ? [full] : [];
  });
}

function sources(): Array<{ file: string; text: string }> {
  return [...files(APP), ...files(SRC)]
    .filter((file) => !file.endsWith('.test.ts'))
    .map((file) => ({ file: file.replace(process.cwd(), ''), text: readFileSync(file, 'utf8') }));
}

const HAPTICS = readFileSync(join(SRC, 'lib', 'haptics.ts'), 'utf8');

describe('haptics', () => {
  it('names the moment, not the waveform', () => {
    // A screen asks for `recorded()`, not for a notification feedback type, so
    // how that feels is decided in one place.
    for (const moment of ['recorded', 'needsAttention', 'refused', 'captured']) {
      expect(HAPTICS).toContain(`export function ${moment}`);
    }
  });

  it('never fails an action because the phone cannot buzz', () => {
    // Unavailable on a simulator, on some hardware, and whenever the owner has
    // switched it off. None of those is a reason for a save to fail.
    expect(HAPTICS).toContain('.catch(');
    expect(HAPTICS).not.toContain('await Haptics');
  });

  it('fires on what changes the books, and on what refuses', () => {
    const all = sources()
      .map((entry) => entry.text)
      .join('\n');
    expect(all).toContain('haptics.recorded()');
    expect(all).toContain('haptics.refused()');
    expect(all).toContain('haptics.needsAttention()');
  });

  it('stays off the ordinary taps', () => {
    // Every screen that buzzes must do it through the vocabulary; a raw
    // `Haptics.` call elsewhere is how a tap-by-tap buzz creeps in.
    const strays = sources().filter(
      (entry) => !entry.file.endsWith('/src/lib/haptics.ts') && /\bHaptics\./.test(entry.text),
    );
    expect(strays.map((entry) => entry.file)).toEqual([]);
  });
});

describe('motion', () => {
  it('moves only what a tap just asked for', () => {
    const moving = sources().filter((entry) => entry.text.includes('Animated.timing'));
    // The reveal in the UI kit, and the bulk bar. More than a handful of
    // animated surfaces in an app like this is decoration.
    expect(moving.length).toBeLessThanOrEqual(3);
    expect(moving.length).toBeGreaterThanOrEqual(1);
  });

  it('animates transforms and opacity, never layout', () => {
    for (const { file, text } of sources()) {
      if (!text.includes('Animated.timing')) continue;
      // Animating a height or a width reflows everything around it on every
      // frame, and cannot run off the main thread.
      expect(text, `${file} animates layout`).toContain('useNativeDriver: true');
      expect(text, `${file} animates a dimension`).not.toMatch(/interpolate[\s\S]{0,200}height:/);
    }
  });

  it('uses the durations the theme already declared', () => {
    const all = sources()
      .map((entry) => entry.text)
      .join('\n');
    expect(all).toContain('duration: motion.enter');
    // An exit reads as more responsive at about two thirds of the entrance,
    // which is what the theme's pair already encodes.
    expect(all).toContain('motion.exit');
  });
});
