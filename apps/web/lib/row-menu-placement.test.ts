import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The "…" menu on a row is placed against the window.
 *
 * Tables scroll inside their own container, which clips anything that leaves
 * it. With a single cheque in the review queue the menu opened below the only
 * row and could be reached only by scrolling inside the table.
 */
const menu = readFileSync(join(__dirname, '..', 'components', 'row-actions.tsx'), 'utf8');

describe('the row menu', () => {
  it('is fixed to the window rather than absolute inside the table', () => {
    expect(menu).toMatch(/role="menu"\s+className="fixed /);
    expect(menu).not.toMatch(/className="absolute end-0 top-11/);
  });

  it('opens above the button when there is no room below', () => {
    expect(menu).toMatch(
      /below \+ height <= window\.innerHeight - gap\s*\?\s*below\s*:\s*Math\.max\(gap, anchor\.top - gap - height\)/,
    );
  });

  it('closes on scroll instead of drifting away from its row', () => {
    expect(menu).toMatch(/window\.addEventListener\('scroll', onScroll, true\)/);
  });
});
