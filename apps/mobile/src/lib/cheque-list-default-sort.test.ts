import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { listChequesQuerySchema } from '@cheque-flow/validation';
import { describe, expect, it } from 'vitest';

/**
 * The cheque list opens on what was entered last, as the web list does.
 *
 * Both lists opened on the due date ascending, which put the oldest cheque in
 * the book at the top and left one photographed a minute ago wherever its date
 * happened to fall. On the phone that matters more than on the desktop: the
 * phone is where cheques are photographed, and the list is where the person
 * who just photographed one looks to see that it arrived.
 *
 * `dueDate` is a field of the cheque and can be backdated to anything; only
 * `createdAt` records when the row reached the system.
 *
 * The API half is asserted too. A default the query schema rejects would not
 * sort anything — it would turn the first load of the screen into an error.
 *
 * The web list is held to the same order by
 * `apps/web/lib/cheques-default-sort.test.ts`; the two are meant to agree, so
 * neither should be changed alone.
 */

const SOURCE = readFileSync(
  join(__dirname, '..', '..', 'app', '(app)', 'cheques', 'index.tsx'),
  'utf8',
);

/** The initial value of a `useState` on the named variable. */
function initialState(name: string): string | undefined {
  return SOURCE.match(new RegExp(`const \\[${name}, set\\w+\\] = useState<[^=]+>\\('([^']+)'\\)`))
    ?.[1];
}

describe('cheque list default sort', () => {
  it('opens on the most recently added cheque', () => {
    expect(initialState('sortBy')).toBe('createdAt');
    expect(initialState('sortOrder')).toBe('desc');
  });

  it('sorts by the entry date rather than a date the user typed', () => {
    expect(initialState('sortBy')).not.toBe('dueDate');
  });

  it('sends an order the API accepts', () => {
    const parsed = listChequesQuerySchema.parse({
      sortBy: initialState('sortBy'),
      sortOrder: initialState('sortOrder'),
    });
    expect(parsed.sortBy).toBe('createdAt');
    expect(parsed.sortOrder).toBe('desc');
  });
});
