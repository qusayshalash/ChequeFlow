import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * What the app shows when a screen's own code throws.
 *
 * There was nothing. In a debug build expo-router puts up its development
 * overlay; in a release build the screen goes blank or the app closes, with no
 * message and no way back. A blank screen is the worst available answer,
 * because it is indistinguishable from a slow one.
 *
 * The subtle rule is the second one below. A boundary that reaches for the
 * app's own providers will throw while handling a throw when the thing that
 * broke is the layout mounting them — and React then falls back to the blank
 * screen this exists to prevent.
 */

const ROOT = process.cwd();
const CRASH = readFileSync(join(ROOT, 'src', 'components', 'crash-screen.tsx'), 'utf8');

const layouts = [join(ROOT, 'app', '_layout.tsx'), join(ROOT, 'app', '(app)', '_layout.tsx')].map(
  (file) => ({ file: file.replace(ROOT, ''), text: readFileSync(file, 'utf8') }),
);

describe('a screen that throws', () => {
  it('is caught at the root and inside the authenticated area', () => {
    // expo-router looks for an export named `ErrorBoundary` on the route, not
    // for a default: a rename removes the boundary and nothing complains.
    for (const layout of layouts) {
      expect(layout.text, `${layout.file} has no boundary`).toMatch(
        /export function ErrorBoundary\(/,
      );
      expect(layout.text).toContain('CrashScreen');
    }
  });

  it('draws without the providers the broken tree may own', () => {
    // The palette comes from the system and the words from the catalogue,
    // because `useTheme` and `useTranslator` both need a context that the
    // crashing layout is the one that mounts.
    expect(CRASH).toContain('useColorScheme()');
    expect(CRASH).toContain('createTranslator(');
    expect(CRASH).not.toContain('useTheme(');
    expect(CRASH).not.toContain('useTranslator(');
    expect(CRASH).not.toContain('useStyles(');
  });

  it('offers a way out, and says what happened', () => {
    expect(CRASH).toContain("t('common.retry')");
    expect(CRASH).toContain('retry');
    // A screenshot of the message is the whole bug report, so it is on screen
    // and selectable rather than swallowed.
    expect(CRASH).toContain('error.message');
    expect(CRASH).toContain('selectable');
  });
});

describe('a route that does not exist', () => {
  it('has a screen of the product, not the router’s sitemap', () => {
    // Reachable from a notification pointing at a deleted cheque. Without
    // this file expo-router shows its own unmatched-route screen, in English,
    // offering a developer's sitemap in the middle of someone's working day.
    const path = join(ROOT, 'app', '+not-found.tsx');
    expect(existsSync(path)).toBe(true);
    const screen = readFileSync(path, 'utf8');
    expect(screen).toContain("t('errors.notFoundTitle')");
    expect(screen).toContain('href="/(app)"');
  });
});
