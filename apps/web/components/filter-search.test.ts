import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Typing in a list filter must not be one request per keystroke.
 *
 * The value goes straight into the list's query key, so an unbuffered field
 * fetches on every character: typing "صائب" fired five requests in about a
 * second. Against the 120-a-minute limit that empties the budget quickly, and
 * then the next thing the page asks for — the refetch after a bulk action —
 * comes back 429 and the list turns into an error, which is what the user hit.
 *
 * There is no DOM test environment in this app, and adding one for a single
 * component is a bigger change than the fix. This checks the two properties
 * that make the debounce real instead: the field is driven by its own state,
 * and the parent's callback is not wired straight to the input.
 */

const SOURCE = readFileSync(join(__dirname, 'filter-search.tsx'), 'utf8');

describe('filter search', () => {
  it('drives the field from its own state, not the committed value', () => {
    // `value={value}` would mean every keystroke is already a committed one.
    expect(SOURCE).toContain('value={draft}');
    expect(SOURCE).not.toContain('value={value}');
  });

  it('does not hand the parent every keystroke', () => {
    expect(SOURCE).not.toMatch(/onChange=\{\(event\) => onChange\(/);
  });

  it('waits before committing', () => {
    expect(SOURCE).toMatch(/setTimeout\(\(\) => commit\.current\(draft\), SETTLE_MS\)/);
    // Long enough to swallow a typed word, short enough to still feel live.
    const settle = /const SETTLE_MS = (\d+);/.exec(SOURCE);
    expect(settle).not.toBeNull();
    expect(Number(settle![1])).toBeGreaterThanOrEqual(200);
    expect(Number(settle![1])).toBeLessThanOrEqual(500);
  });
});
