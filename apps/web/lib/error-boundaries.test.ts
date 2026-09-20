import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * What the product shows when its own code throws.
 *
 * There was nothing here. In the App Router a screen that throws with no
 * boundary above it unmounts, and the person is left looking at a blank page:
 * no message, no way back, no sign that anything went wrong. That is the worst
 * available answer, because a blank page is indistinguishable from a slow one
 * — people wait, reload, and conclude the product lost their work.
 *
 * The files are the wiring: Next finds them by name and location, so a rename
 * or a move silently removes the boundary and nothing fails until the day
 * something throws in front of somebody.
 */

const WEB = process.cwd();
const file = (...parts: string[]) => join(WEB, 'app', ...parts);

describe('a screen that throws', () => {
  it('is caught inside the authenticated area', () => {
    // Scoped to the segment rather than the root, so the sidebar survives:
    // whatever broke, it was one screen, and walking to another one is most
    // of the recovery.
    expect(existsSync(file('(app)', 'error.tsx'))).toBe(true);
  });

  it('offers a way out that is not a reload', () => {
    const boundary = readFileSync(file('(app)', 'error.tsx'), 'utf8');
    // `reset` re-renders the segment. A reload also works and loses whatever
    // is typed on another screen, so it is not the first thing offered.
    expect(boundary).toContain('reset');
    expect(boundary).toContain("t('common.retry')");
    expect(boundary).toContain('href="/dashboard"');
  });

  it('records the failure somewhere a person can be asked about', () => {
    const boundary = readFileSync(file('(app)', 'error.tsx'), 'utf8');
    // The boundary swallows the stack. Without this the console shows nothing
    // and the digest is the only thread back to the server's own log.
    expect(boundary).toContain('console.error');
    expect(boundary).toContain('digest');
  });
});

describe('the last boundary', () => {
  const global = readFileSync(file('global-error.tsx'), 'utf8');

  it('exists, for the shell itself failing', () => {
    expect(existsSync(file('global-error.tsx'))).toBe(true);
    // It replaces the document, so it has to supply one.
    expect(global).toContain('<html');
    expect(global).toContain('<body');
  });

  it('depends on nothing the app provides', () => {
    // The stylesheet, the fonts, the providers and the translator are all
    // gone by the time this renders. Anything imported here is one more thing
    // that can fail while already handling a failure.
    const imports = [...global.matchAll(/^import .*from '([^']+)';$/gm)].map((m) => m[1]);
    expect(imports).toEqual(['react']);
    expect(global).not.toContain('useTranslator');
  });
});

describe('an address that leads nowhere', () => {
  it('has a page of the product, not of the framework', () => {
    // Next's default is English, in the browser's font, with no way back —
    // somebody else's error page showing through an Arabic product.
    expect(existsSync(file('not-found.tsx'))).toBe(true);
    const notFound = readFileSync(file('not-found.tsx'), 'utf8');
    expect(notFound).toContain("t('errors.notFoundTitle')");
    expect(notFound).toContain('href="/dashboard"');
  });
});
