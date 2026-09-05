import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Nothing you can press may be smaller than a fingertip.
 *
 * 44pt on iOS and 48dp on Android — the skill lists this as CRITICAL, and the
 * theme already holds whichever applies as `TAP`. Six controls had drifted
 * under it anyway: a filter chip at 38, a banner action at 32, the dashboard's
 * "view all" at 34, a snooze chip and a status toggle at 40, and the sign-in
 * screen's password reveal at 34×34. Each looked fine on its own; only a sweep
 * catches them.
 *
 * **What this does and does not catch.** It matches style names that say they
 * are controls — button, chip, tab, toggle, action and so on. A control named
 * something else slips through, and that is the honest limit of reading source
 * rather than rendering. The alternative, flagging every small number
 * anywhere, produced eighteen false hits on decorative dots and shadow offsets
 * and would have been switched off within a week.
 *
 * Source rather than render because the screens import React Native, whose
 * Flow-typed entry point the test runner cannot parse.
 */

const ROOT = join(__dirname, '..');

/** Style names that denote something a finger lands on. */
const CONTROL = /(button|chip|tab|toggle|action|reveal|pill|pressable|option|submit|link)/i;

/**
 * …unless the name also says it is decoration.
 *
 * `submitSpacer`, `pillarRule` and `pillDot` all contain a control word by
 * accident. Checked second so a name has to be a control *and* not obviously
 * scenery — cheaper and more honest than listing every exception.
 */
const SCENERY = /(spacer|rule|dot|line|divider|bar|mark|track|wash|ring|edge)/i;

/** `minHeight: 38` and friends — a literal size where `TAP` belongs. */
const SIZE = /\b(minHeight|height|minWidth|width):\s*(\d{1,2})\b/g;

function sources(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) sources(path, found);
    else if (entry.endsWith('.tsx')) found.push(path);
  }
  return found;
}

describe('tap targets', () => {
  it('has no named control smaller than the platform minimum', () => {
    const offenders: string[] = [];

    for (const file of [...sources(join(ROOT, 'app')), ...sources(join(ROOT, 'src'))]) {
      for (const line of readFileSync(file, 'utf8').split('\n')) {
        // A shadow's offset is a direction, not a size.
        if (line.includes('shadowOffset')) continue;

        const name = /^\s*([A-Za-z][A-Za-z0-9]*)\s*:/.exec(line)?.[1];
        if (!name || !CONTROL.test(name) || SCENERY.test(name)) continue;

        for (const [, prop, value] of line.matchAll(SIZE)) {
          // 44 is the smaller of the two platform floors; `TAP` resolves
          // higher than that on Android.
          if (Number(value) < 44) {
            offenders.push(`${file.replace(ROOT, '')} — ${name}.${prop} = ${value}`);
          }
        }
      }
    }

    expect(offenders, `use TAP instead of a literal:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('actually looks at the screens', () => {
    // Guards against the sweep passing because it found no files to read.
    const files = [...sources(join(ROOT, 'app')), ...sources(join(ROOT, 'src'))];
    expect(files.length).toBeGreaterThan(20);
  });
});
