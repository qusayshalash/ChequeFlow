import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The balances sit under the heading that names them.
 *
 * The stack of figures was `items-end`, which in a right-to-left page is the
 * left edge: measured at the contacts table, every figure's right edge sat
 * 70px to the left of where the "الرصيد" heading begins, while the "settled"
 * text of the rows without a balance sat correctly under it. The column read
 * as though the numbers belonged to the heading beside them.
 *
 * `start` and `end` are the trap. They flip with direction, so the one that
 * looks right while writing English is the wrong one on screen here — the
 * same reason a popover anchored `end-0` opened off the side of the page.
 */

const SOURCE = readFileSync(
  join(__dirname, '..', 'app', '(app)', 'contacts', 'page.tsx'),
  'utf8',
);

/** The class list on the element wrapping the per-currency figures. */
function balanceStack(): string {
  const match = SOURCE.match(/<span className="(flex flex-col[^"]*)"/);
  expect(match).not.toBeNull();
  return match![1]!;
}

describe('contacts balance column', () => {
  it('does not hang the figures on the far side of the cell', () => {
    expect(balanceStack()).not.toContain('items-end');
  });

  it('aligns them where the row starts, which is where the heading is', () => {
    expect(balanceStack()).toContain('items-start');
  });
});
