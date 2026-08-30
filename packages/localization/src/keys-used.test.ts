import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { LOCALES, messages, translate } from './index.js';

/**
 * Every `t('some.key')` in the apps must resolve to a string.
 *
 * A key that points at a *branch* of the catalogue rather than a leaf — say
 * `validation.password`, which is an object of four messages — falls through
 * `translate` and renders the raw key on screen. That shipped once: a password
 * hint read "validation.password" to the user. Nothing caught it, because the
 * catalogue itself was perfectly valid; the mistake was in the call.
 */
// `process.cwd()` is the package directory when vitest runs, so the monorepo
// root is two levels up. `import.meta` is avoided because this package is
// compiled as CommonJS for the API's Jest setup.
const ROOT = path.resolve(process.cwd(), '../..');
const SOURCES = ['apps/web/app', 'apps/web/components', 'apps/mobile/app', 'apps/mobile/src'];

/** Literal keys only. A computed key such as `status.${x}` cannot be checked. */
const CALL = /\bt\(\s*'([a-zA-Z0-9_.]+)'/g;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.tsx?$/.test(entry) ? [full] : [];
  });
}

function collectKeys(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const source of SOURCES) {
    const dir = path.join(ROOT, source);
    for (const file of walk(dir)) {
      const text = readFileSync(file, 'utf8');
      for (const match of text.matchAll(CALL)) {
        const key = match[1];
        if (!key) continue;
        const places = found.get(key) ?? [];
        places.push(path.relative(ROOT, file));
        found.set(key, places);
      }
    }
  }
  return found;
}

describe('message keys used in the apps', () => {
  const used = collectKeys();

  it('finds keys to check', () => {
    // Guards the scanner itself: a broken regex would make this suite pass by
    // checking nothing at all.
    expect(used.size).toBeGreaterThan(50);
  });

  it('every literal key resolves to a real string in both languages', () => {
    const broken: string[] = [];

    for (const [key, places] of used) {
      for (const locale of LOCALES) {
        const value = translate(locale, key);
        if (value === key) broken.push(`${locale}: ${key}  (${places[0]})`);
      }
    }

    expect(broken).toEqual([]);
  });

  it('no key points at a branch of the catalogue instead of a leaf', () => {
    const branches: string[] = [];

    for (const [key, places] of used) {
      let node: unknown = messages.ar;
      for (const segment of key.split('.')) {
        if (typeof node !== 'object' || node === null) {
          node = undefined;
          break;
        }
        node = (node as Record<string, unknown>)[segment];
      }
      if (node !== undefined && typeof node !== 'string') {
        branches.push(`${key}  (${places[0]})`);
      }
    }

    expect(branches).toEqual([]);
  });
});
