import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { listChequesQuerySchema } from '@cheque-flow/validation';
import { describe, expect, it } from 'vitest';

/**
 * The cheques page opens on what was entered last.
 *
 * It used to open on the due date ascending, so the top of the table was the
 * oldest cheque in the book and a cheque recorded a minute ago sat wherever
 * its date fell — frequently on another page. Someone who has just entered or
 * photographed a cheque comes here to see that it arrived.
 *
 * Two halves, and both have to hold: the page has to ask for that order, and
 * the API has to accept it. A default the query schema rejects would not sort
 * anything — it would turn the first load of the page into an error.
 */

const SOURCE = readFileSync(join(__dirname, '..', 'app', '(app)', 'cheques', 'page.tsx'), 'utf8');

/** The initial value of a `useState` on the named variable. */
function initialState(name: string): string | undefined {
  const match = SOURCE.match(
    new RegExp(`const \\[${name}, set\\w+\\] = useState<[^>]+>\\('([^']+)'\\)`),
  );
  return match?.[1];
}

describe('cheques page default sort', () => {
  it('opens on the most recently added cheque', () => {
    expect(initialState('sortBy')).toBe('createdAt');
    expect(initialState('sortOrder')).toBe('desc');
  });

  it('sorts by the entry date rather than a date the user typed', () => {
    // `dueDate` is a field of the cheque and can be backdated to anything;
    // only `createdAt` records when the row reached the system.
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
