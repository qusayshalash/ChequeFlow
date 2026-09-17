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
 *
 * Motion also has an owner who can decline it. "Reduce Motion" is switched on
 * by people for whom a sliding panel causes nausea or a migraine, so a screen
 * that takes its duration straight from the theme is a fault, not a shortcut:
 * the setting has to be answered in one place or it is answered nowhere.
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
const STILLNESS = readFileSync(join(SRC, 'lib', 'reduced-motion.ts'), 'utf8');

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
    // An exit reads as more responsive at about two thirds of the entrance,
    // which is what the theme's pair already encodes — and which the hook
    // hands to the screens unchanged whenever movement is allowed.
    expect(STILLNESS).toMatch(/import \{ motion \} from '@\/theme'/);
    expect(STILLNESS).toMatch(/return[^;]*\bmotion\b/);
  });

  it('reads every duration through the reduced-motion hook', () => {
    // A screen that reaches for `motion.enter` itself is a screen that keeps
    // moving after the owner asked the phone to hold still. The setting has to
    // be answered in one place or it is answered nowhere.
    for (const { file, text } of sources()) {
      if (!text.includes('Animated.timing')) continue;
      expect(text, `${file} animates without the hook`).toContain('useMotionDurations()');
      expect(text, `${file} takes a duration straight from the theme`).not.toMatch(
        /duration:[^,\n]*\bmotion\.(enter|exit)/,
      );
    }
  });

  it('holds still rather than skipping, so nothing is stranded half-faded', () => {
    // The animated values carry the final opacity and offset as well as the
    // travel. An animation that never runs would leave the panel invisible; a
    // zero-length one puts it where it belongs in a single frame.
    expect(STILLNESS).toMatch(/enter: 0,\s*exit: 0/);
    expect(STILLNESS).toContain("AccessibilityInfo.addEventListener('reduceMotionChanged'");
  });
});
