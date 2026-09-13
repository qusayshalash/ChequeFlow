import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * A screen's title is one thing, drawn one way.
 *
 * It was three: the dashboard declared its own title and subtitle styles with
 * a negative margin holding them together, three other screens used `Heading`
 * with whatever spacing that screen happened to have, and one printed a title
 * the navigator was already showing. The sizes happened to agree — `Heading`
 * is the same 21pt role — but nothing else did, and a title that sits at a
 * different height on each screen reads as a different app on each screen.
 *
 * The other half of the rule: a screen inside a stack already has its title in
 * the navigator's bar. Printing it again in the body says it twice, which the
 * OCR review screen did.
 */

const APP = join(process.cwd(), 'app');

function screens(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return screens(full);
    return /\.tsx$/.test(entry) && !/_layout/.test(entry) ? [full] : [];
  });
}

/** Every screen that has a title of its own, and what it titles with. */
function titled(): Array<{ file: string; source: string }> {
  return screens(APP)
    .map((file) => ({ file: file.replace(APP, ''), source: readFileSync(file, 'utf8') }))
    .filter((entry) => entry.source.includes('ScreenHeader') || entry.source.includes('<Heading>'));
}

/**
 * The titles the navigator draws in a header bar of its own.
 *
 * Stack layouts only. The tab layout's `title` is the label under the tab's
 * icon, not a header — it runs with `headerShown: false` — so counting it here
 * would forbid the "Add" screen from naming itself.
 */
function navigatorTitles(): string[] {
  return readdirSync(APP, { recursive: true, encoding: 'utf8' })
    .filter((entry) => entry.endsWith('_layout.tsx'))
    .map((entry) => readFileSync(join(APP, entry), 'utf8'))
    .filter((source) => source.includes('<Stack'))
    .flatMap((source) => [...source.matchAll(/title: t\('([^']+)'\)/g)])
    .map((match) => match[1]!);
}

describe('screen titles', () => {
  it('uses one component for the screens the navigator does not title', () => {
    const usingHeader = titled().filter((entry) => entry.source.includes('<ScreenHeader'));
    // The tab roots and the camera: the screens with no header bar above them.
    expect(usingHeader.length).toBeGreaterThanOrEqual(3);
  });

  it('never repeats a title the navigator is already showing', () => {
    const fromNavigator = new Set(navigatorTitles());

    for (const { file, source } of titled()) {
      for (const match of source.matchAll(/<ScreenHeader title=\{t\('([^']+)'\)\}/g)) {
        expect(fromNavigator.has(match[1]!), `${file} repeats the header's own title`).toBe(false);
      }
    }
  });

  it('takes its size from the scale rather than a number', () => {
    const ui = readFileSync(join(process.cwd(), 'src', 'components', 'ui.tsx'), 'utf8');
    // The point of the component is that one place decides. A literal size
    // here is how three screens came to disagree in the first place.
    expect(ui).toMatch(/screenTitle: \{ \.\.\.type\.\w+/);
    expect(ui).not.toMatch(/screenTitle: \{[^}]*fontSize/);
  });

  it('carries the subtitle, so no screen invents its own again', () => {
    const ui = readFileSync(join(process.cwd(), 'src', 'components', 'ui.tsx'), 'utf8');
    expect(ui).toContain('screenSubtitle');
    // The dashboard held its title and subtitle together with a negative
    // margin — the kind of number that is copied to the next screen slightly
    // wrong.
    const dashboard = readFileSync(join(APP, '(app)', 'index.tsx'), 'utf8');
    expect(dashboard).not.toContain('pageSubtitle');
  });
});
