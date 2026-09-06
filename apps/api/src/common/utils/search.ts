/**
 * Makes a typed search term mean itself.
 *
 * Prisma's `contains` becomes a SQL `LIKE`, and it passes the term through
 * untouched — so `%` and `_`, which a person types as characters, arrive as
 * the pattern operators "anything" and "any one character". Searching for `%`
 * returned every row in the table; searching for a literal `%` was impossible.
 *
 * PostgreSQL's `LIKE` treats a backslash as the escape character unless told
 * otherwise, so escaping the three characters that matter is enough. The
 * backslash goes first: escaping it after the others would escape the escapes.
 */
export function escapeLike(term: string): string {
  return term.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}
