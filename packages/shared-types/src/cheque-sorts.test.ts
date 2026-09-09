import { describe, expect, it } from 'vitest';

import { CHEQUE_SORTS, DEFAULT_CHEQUE_SORT, chequeSortOption } from './cheque-sorts.js';

/**
 * The list both cheque lists are built from.
 *
 * It is shared so the two cannot drift apart again, which means a mistake here
 * is a mistake in both apps at once.
 */
describe('cheque sort options', () => {
  it('offers the order the lists open in', () => {
    expect(DEFAULT_CHEQUE_SORT.sortBy).toBe('createdAt');
    expect(DEFAULT_CHEQUE_SORT.sortOrder).toBe('desc');
    expect(CHEQUE_SORTS).toContain(DEFAULT_CHEQUE_SORT);
  });

  it('offers the nearest due date first', () => {
    // The reason this list exists: it was reachable only as "due date" plus an
    // arrow, and only on a column that happened to be switched on.
    const soonest = CHEQUE_SORTS.find((option) => option.id === 'dueSoonest');
    expect(soonest).toBeDefined();
    expect(soonest?.sortBy).toBe('dueDate');
    // Ascending — the earliest date is the soonest due.
    expect(soonest?.sortOrder).toBe('asc');
  });

  it('gives every option a distinct identity, order and label', () => {
    const ids = CHEQUE_SORTS.map((option) => option.id);
    const orders = CHEQUE_SORTS.map((option) => `${option.sortBy}:${option.sortOrder}`);
    const labels = CHEQUE_SORTS.map((option) => option.labelKey);

    expect(new Set(ids).size).toBe(ids.length);
    // Two entries sorting identically would put the same list on screen under
    // two names, and `chequeSortOption` would have to pick between them.
    expect(new Set(orders).size).toBe(orders.length);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('admits when the list is in an order it does not offer', () => {
    // The web table's headers also sort by cheque number and status. Returning
    // the nearest option would make a control report something untrue about
    // what the reader is looking at.
    expect(chequeSortOption('chequeNumber', 'asc')).toBeUndefined();
    expect(chequeSortOption('status', 'desc')).toBeUndefined();
    expect(chequeSortOption('dueDate', 'asc')?.id).toBe('dueSoonest');
  });
});
