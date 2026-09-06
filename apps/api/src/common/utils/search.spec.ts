import { escapeLike } from './search';

/**
 * A search term is text, not a pattern.
 *
 * Measured before this existed: searching the cheque list for `%` returned all
 * 56 rows, and so did `_`. Both are SQL `LIKE` operators, and Prisma's
 * `contains` hands the term to `LIKE` untouched.
 */
describe('escapeLike', () => {
  it('escapes the two LIKE operators', () => {
    expect(escapeLike('%')).toBe('\\%');
    expect(escapeLike('_')).toBe('\\_');
    expect(escapeLike('50% off')).toBe('50\\% off');
  });

  it('escapes the escape character itself, and does it first', () => {
    // Doing the backslash last would escape the escapes just added, turning
    // `%` into a literal backslash followed by a live wildcard.
    expect(escapeLike('\\')).toBe('\\\\');
    expect(escapeLike('\\%')).toBe('\\\\\\%');
  });

  it('leaves ordinary text alone, in either script', () => {
    for (const term of ['30000001', 'صائب صنوبر', 'Refat', 'a-b.c@d', '']) {
      expect(escapeLike(term)).toBe(term);
    }
  });
});
