import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { CHEQUE_SORTS, DEFAULT_CHEQUE_SORT } from '@cheque-flow/shared-types';
import { describe, expect, it } from 'vitest';

/**
 * The cheque list opens on what was entered last, as the web list does, and
 * offers the same orders by the same names.
 *
 * Both lists opened on the due date ascending, which put the oldest cheque in
 * the book at the top and left one photographed a minute ago wherever its date
 * happened to fall. On the phone that matters more than on the desktop: the
 * phone is where cheques are photographed, and the list is where the person
 * who just photographed one looks to see that it arrived.
 *
 * The order was also chosen here in two parts — a field picker beside chips
 * labelled `↑` and `↓` — so asking for "the ones due soonest" meant knowing
 * which end of a due date a rising arrow points at.
 *
 * The web list is held to the same list by
 * `apps/web/lib/cheques-default-sort.test.ts`; the two are meant to agree, so
 * neither should be changed alone.
 */

const SOURCE = readFileSync(
  join(__dirname, '..', '..', 'app', '(app)', 'cheques', 'index.tsx'),
  'utf8',
);

describe('cheque list sorting', () => {
  it('opens on the most recently added cheque', () => {
    expect(DEFAULT_CHEQUE_SORT.sortBy).toBe('createdAt');
    expect(DEFAULT_CHEQUE_SORT.sortOrder).toBe('desc');
    expect(SOURCE).toContain('useState(DEFAULT_CHEQUE_SORT.id)');
  });

  it('offers every shared order under one control', () => {
    expect(SOURCE).toContain('CHEQUE_SORTS.map');
    for (const option of CHEQUE_SORTS) {
      expect(SOURCE).not.toContain(`'${option.labelKey}'`);
    }
  });

  it('no longer asks the reader to read a direction off an arrow', () => {
    // The two chips were the only way to reverse an order, and the only thing
    // naming the direction.
    expect(SOURCE).not.toContain('label="↑"');
    expect(SOURCE).not.toContain('label="↓"');
  });
});
