import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Typing in a panel keeps the cursor where it is.
 *
 * The drawer's open effect listed `onClose` as a dependency, and every caller
 * passes a new arrow on each render, so each keystroke re-ran the effect and
 * moved focus to the close button. Adding a user meant clicking back into the
 * field before every letter.
 */
const drawer = readFileSync(join(__dirname, '..', 'components', 'drawer.tsx'), 'utf8');

describe('the drawer', () => {
  it('runs its focus effect on open and close only', () => {
    expect(drawer).toMatch(/\}, \[open\]\);/);
    expect(drawer).not.toMatch(/\[open, onClose\]/);
  });

  it('still closes on Escape, through the latest handler', () => {
    expect(drawer).toMatch(/closeRef\.current = onClose;/);
    expect(drawer).toMatch(/event\.key === 'Escape'[\s\S]*?closeRef\.current\(\);/);
  });
});
