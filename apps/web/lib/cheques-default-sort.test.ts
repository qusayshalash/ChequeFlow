import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { CHEQUE_SORTS, DEFAULT_CHEQUE_SORT } from '@cheque-flow/shared-types';
import { listChequesQuerySchema } from '@cheque-flow/validation';
import { describe, expect, it } from 'vitest';

/**
 * The cheques page opens on what was entered last, and offers the rest.
 *
 * It used to open on the due date ascending, so the top of the table was the
 * oldest cheque in the book and a cheque recorded a minute ago sat wherever
 * its date fell — frequently on another page. Someone who has just entered or
 * photographed a cheque comes here to see that it arrived.
 *
 * Choosing another order was possible only by clicking a column header, which
 * limited the orders on offer to the columns switched on and left an arrow to
 * explain itself. The filter panel now carries the shared list by name.
 *
 * The API half is asserted too: an order the query schema rejects would not
 * sort anything — it would turn a load of the page into an error.
 *
 * The phone list is held to the same list by
 * `apps/mobile/src/lib/cheque-list-default-sort.test.ts`; the two are meant to
 * agree, so neither should be changed alone.
 */

const SOURCE = readFileSync(
  join(__dirname, '..', 'app', '(app)', 'cheques', 'page.tsx'),
  'utf8',
);

describe('cheques page sorting', () => {
  it('opens on the most recently added cheque', () => {
    expect(DEFAULT_CHEQUE_SORT.sortBy).toBe('createdAt');
    expect(DEFAULT_CHEQUE_SORT.sortOrder).toBe('desc');
    // Bound to the shared default rather than repeating it, so the page cannot
    // open in one order while the phone opens in another.
    expect(SOURCE).toContain('useState<ChequeSortKey>(DEFAULT_CHEQUE_SORT.sortBy)');
    expect(SOURCE).toContain("useState<'asc' | 'desc'>(DEFAULT_CHEQUE_SORT.sortOrder)");
  });

  it('offers every shared order in the filter panel', () => {
    expect(SOURCE).toContain('CHEQUE_SORTS.map');
    // Built from the list, not from a copy of it written out in the page.
    for (const option of CHEQUE_SORTS) {
      expect(SOURCE).not.toContain(`'${option.labelKey}'`);
    }
  });

  it('sends orders the API accepts', () => {
    for (const option of CHEQUE_SORTS) {
      const parsed = listChequesQuerySchema.parse({
        sortBy: option.sortBy,
        sortOrder: option.sortOrder,
      });
      expect([parsed.sortBy, parsed.sortOrder]).toEqual([option.sortBy, option.sortOrder]);
    }
  });
});
