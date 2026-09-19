import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { DEFAULT_THEME_CHOICE, THEME_CHOICES, applyThemeChoice, isThemeChoice } from './theme';

/**
 * The dashboard in the dark.
 *
 * The product was light-only, and the dark values sat unused in the stylesheet
 * behind a `data-theme` attribute nothing ever set. Enabling them was not the
 * work: 41 of the 59 screens painted themselves with raw palette classes —
 * `bg-white`, `text-slate-500` — and a raw class cannot follow a theme. The
 * result would have been a dark page carrying white cards.
 *
 * So the rule these tests hold is narrower than "dark mode works", which no
 * source-reading test can check: every colour in the dashboard is a token, the
 * two themes declare the same tokens, and each theme's own foreground clears
 * 4.5:1 on its own background. A raw colour anywhere is the fault.
 */

const WEB = process.cwd();
const CSS = readFileSync(join(WEB, 'app', 'globals.css'), 'utf8');

function sources(): Array<{ file: string; text: string }> {
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((entry) => {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) return walk(full);
      return /\.tsx$/.test(entry) ? [full] : [];
    });

  return [...walk(join(WEB, 'app')), ...walk(join(WEB, 'components'))].map((file) => ({
    file: file.replace(WEB, ''),
    text: readFileSync(file, 'utf8'),
  }));
}

const PALETTE =
  'white|black|slate|gray|neutral|zinc|stone|red|rose|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink';

describe('every colour is a token', () => {
  it('uses no raw palette class', () => {
    // `bg-white` in a card is a white rectangle in a dark room: the class names
    // a fixed colour, so no amount of theming can move it.
    const raw = new RegExp(
      `\\b(?:bg|text|border|ring|divide|outline)-(?:${PALETTE})(?:-[0-9]{2,3})?\\b`,
    );
    const offenders = sources().filter((entry) => raw.test(entry.text));
    expect(offenders.map((entry) => entry.file)).toEqual([]);
  });

  it('writes no colour literal into a class or a prop', () => {
    // The charts used to carry their series colours as hex strings, which is
    // the same fault one layer down: the line stayed dark green on a dark page.
    const literal = /(?:#[0-9a-fA-F]{6}\b|\brgba?\(\s*\d)/;
    const offenders = sources().filter((entry) => {
      const withoutShadows = entry.text.replace(/shadow-\[[^\]]*\]/g, '');
      return literal.test(withoutShadows);
    });
    expect(offenders.map((entry) => entry.file)).toEqual([]);
  });
});

/** Pulls `--app-x: value;` pairs out of one block of the stylesheet. */
function tokensIn(block: string): Map<string, string> {
  const found = new Map<string, string>();
  for (const match of block.matchAll(/--app-([a-z0-9-]+):\s*([^;]+);/g)) {
    const [, name, value] = match as unknown as [string, string, string];
    found.set(name, value.trim());
  }
  return found;
}

const LIGHT = tokensIn(
  CSS.slice(CSS.indexOf(':root {'), CSS.indexOf('@media (prefers-color-scheme: dark)')),
);
const FOLLOWS_SYSTEM = CSS.slice(
  CSS.indexOf('@media (prefers-color-scheme: dark)'),
  CSS.indexOf(":root[data-theme='dark']"),
);
const EXPLICIT = CSS.slice(CSS.indexOf(":root[data-theme='dark']"));
const DARK = tokensIn(FOLLOWS_SYSTEM);

describe('the two themes stay the same shape', () => {
  it('declares the dark theme twice, identically', () => {
    // One block follows the operating system, the other lets an attribute
    // override it. They are written out twice, so they can drift.
    expect([...tokensIn(EXPLICIT).entries()]).toEqual([...DARK.entries()]);
  });

  it('answers the system, and lets an explicit light override win', () => {
    // Without the guard, a future switch could set light and the media query
    // would paint over it.
    expect(CSS).toContain('@media (prefers-color-scheme: dark)');
    expect(CSS).toContain(":root:not([data-theme='light'])");
    expect(CSS).toContain('color-scheme: dark;');
  });

  it('gives every light token a dark counterpart', () => {
    // A token defined in one theme only is a colour that stops following.
    const colours = (from: Map<string, string>) =>
      [...from.keys()].filter((name) => !/^(radius|shadow)-/.test(name)).sort();
    expect(colours(DARK)).toEqual(colours(LIGHT));
  });
});

function contrast(one: string, two: string): number {
  const channel = (hex: string) =>
    [1, 3, 5].map((at) => {
      const value = parseInt(hex.slice(at, at + 2), 16) / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
  const relative = (hex: string) => {
    const [r, g, b] = channel(hex) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [high, low] = [relative(one), relative(two)].sort((a, b) => b - a) as [number, number];
  return (high + 0.05) / (low + 0.05);
}

/** What is written on what. Each pair has to hold in both themes, separately. */
const PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['text', 'bg'],
  ['text', 'surface'],
  ['text', 'surface-subtle'],
  ['text', 'surface-sunken'],
  ['text', 'surface-raised'],
  ['text-secondary', 'bg'],
  ['text-secondary', 'surface'],
  ['text-secondary', 'surface-subtle'],
  ['text-muted', 'bg'],
  ['text-muted', 'surface'],
  ['text-muted', 'surface-subtle'],
  ['primary-ink', 'surface'],
  ['primary-ink', 'primary-soft'],
  ['on-primary', 'primary'],
  ['on-primary', 'primary-hover'],
  ['danger', 'surface'],
  ['danger', 'danger-soft'],
  ['on-danger', 'danger-solid'],
  ['warning', 'surface'],
  ['warning', 'warning-soft'],
  ['success', 'surface'],
  ['success', 'success-soft'],
  ['on-success', 'success'],
  ['info', 'surface'],
  ['info', 'info-soft'],
  ['sidebar-text', 'sidebar'],
  ['sidebar-muted', 'sidebar'],
  ['sidebar-section', 'sidebar'],
  ['sidebar-active-text', 'sidebar-active-bg'],
  ['hero-ink', 'hero'],
  ['hero-accent', 'hero'],
  ['hero', 'hero-accent'],
  ...(
    [
      'teal',
      'indigo',
      'orange',
      'fuchsia',
      'cyan',
      'sky',
      'violet',
      'emerald',
      'amber',
      'rose',
      'neutral',
    ] as const
  ).map((hue) => [`mark-${hue}-ink`, `mark-${hue}`] as const),
];

describe('each theme is readable on its own terms', () => {
  for (const [theme, tokens] of [
    ['light', LIGHT],
    ['dark', DARK],
  ] as const) {
    it(`clears 4.5:1 throughout the ${theme} theme`, () => {
      for (const [ink, ground] of PAIRS) {
        const one = tokens.get(ink);
        const two = tokens.get(ground);
        expect(one, `${theme}: --app-${ink} is missing`).toBeDefined();
        expect(two, `${theme}: --app-${ground} is missing`).toBeDefined();
        const ratio = contrast(one as string, two as string);
        expect(
          Math.round(ratio * 100) / 100,
          `${theme}: ${ink} on ${ground}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    });
  }
});

/**
 * The manual switch.
 *
 * Following the system is the right default and stays the default. This is for
 * the cases the system setting cannot express — a shared machine set to light,
 * a screen being photographed — so the one thing it must never do is become a
 * one-way door: "system" has to remain reachable after someone has tried dark.
 */

const LIB = readFileSync(join(WEB, 'lib', 'theme.ts'), 'utf8');
const LAYOUT = readFileSync(join(WEB, 'app', 'layout.tsx'), 'utf8');
const CONTROL = readFileSync(join(WEB, 'components', 'theme-choice.tsx'), 'utf8');

/** Enough of an element for `applyThemeChoice`, which only needs two methods. */
function fakeRoot() {
  let attribute: string | null = null;
  return {
    get value() {
      return attribute;
    },
    setAttribute: (_: string, next: string) => {
      attribute = next;
    },
    removeAttribute: () => {
      attribute = null;
    },
  };
}

describe('choosing a theme by hand', () => {
  it('offers the system as an answer, not as the absence of one', () => {
    expect(THEME_CHOICES).toEqual(['system', 'light', 'dark']);
    expect(DEFAULT_THEME_CHOICE).toBe('system');
  });

  it('hands the question back to the stylesheet for "system"', () => {
    // Writing data-theme="system" would match neither selector, so the page
    // would keep whatever it had and the choice would look ignored.
    const root = fakeRoot();
    applyThemeChoice('dark', root as unknown as HTMLElement);
    expect(root.value).toBe('dark');
    applyThemeChoice('system', root as unknown as HTMLElement);
    expect(root.value).toBeNull();
  });

  it('writes an explicit light, which the stylesheet lets win', () => {
    const root = fakeRoot();
    applyThemeChoice('light', root as unknown as HTMLElement);
    expect(root.value).toBe('light');
    // The guard in globals.css is what makes that override a dark system.
    expect(CSS).toContain(":root:not([data-theme='light'])");
  });

  it('refuses a stored value it does not recognise', () => {
    // Storage is shared with anything else on the origin and survives a
    // rename; a stale value must fall back rather than be written to the root.
    expect(isThemeChoice('dark')).toBe(true);
    expect(isThemeChoice('sepia')).toBe(false);
    expect(isThemeChoice(null)).toBe(false);
  });

  it('applies the choice before the first paint', () => {
    // From an effect it arrives after the browser has drawn: the person sees
    // the system's theme flash before their own replaces it.
    expect(LAYOUT).toContain('THEME_BOOT_SCRIPT');
    expect(LAYOUT).toMatch(/<head>[\s\S]*THEME_BOOT_SCRIPT[\s\S]*<\/head>/);
    expect(LIB).toContain('const THEME_BOOT_SCRIPT');
    expect(LIB).toMatch(/THEME_BOOT_SCRIPT = `try\{/);
  });

  it('survives a browser that refuses storage', () => {
    // A private window throws on read and on write. A theme is not worth
    // failing a page load over, and the boot script runs before any handler.
    const guarded = LIB.match(/try \{[\s\S]*?\} catch/g) ?? [];
    expect(guarded.length).toBeGreaterThanOrEqual(2);
    expect(LIB).toContain('catch');
  });

  it('is one question with one answer', () => {
    // Three buttons that happen to sit together are announced as three
    // controls; a radio group is announced as "2 of 3" and moves on arrows.
    expect(CONTROL).toContain('role="radiogroup"');
    expect(CONTROL).toContain('role="radio"');
    expect(CONTROL).toContain('aria-checked={selected}');
  });
});
