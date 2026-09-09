/**
 * The orders a list of cheques can be shown in.
 *
 * Sorting was reachable two different ways and neither said what it did. On
 * the web it lived in the column headers, so the only orders on offer were the
 * columns on screen, and clicking one gave no clue whether the arrow meant
 * soonest or latest. On the phone it was a field picker beside two chips
 * labelled `↑` and `↓` — which asks the reader to work out that a rising arrow
 * on a due date means the cheque due first.
 *
 * So the field and the direction are one choice here, named for the answer it
 * gives rather than the mechanism: "due soonest", not "due date, ascending".
 * Both apps read this list, so an order added here appears in both.
 *
 * `labelKey` is resolved by the apps' translator; the keys are asserted to
 * exist in every language by the localization suite.
 */
export interface ChequeSortOption {
  /** Stable identifier — what a control's value is, and what a test names. */
  readonly id: string;
  readonly sortBy: 'createdAt' | 'dueDate' | 'amount';
  readonly sortOrder: 'asc' | 'desc';
  readonly labelKey: string;
}

export const CHEQUE_SORTS: readonly ChequeSortOption[] = [
  // First in the list and the default: someone opening the list has usually
  // just added a cheque, and comes here to see that it arrived.
  { id: 'newest', sortBy: 'createdAt', sortOrder: 'desc', labelKey: 'cheque.sortNewest' },
  { id: 'oldest', sortBy: 'createdAt', sortOrder: 'asc', labelKey: 'cheque.sortOldest' },
  // Ascending by due date puts the overdue first — they are the soonest due,
  // and the most urgent. The table marks them, and the "due" tab narrows to
  // them for anyone who wants those alone.
  { id: 'dueSoonest', sortBy: 'dueDate', sortOrder: 'asc', labelKey: 'cheque.sortDueSoonest' },
  { id: 'dueLatest', sortBy: 'dueDate', sortOrder: 'desc', labelKey: 'cheque.sortDueLatest' },
  { id: 'amountHighest', sortBy: 'amount', sortOrder: 'desc', labelKey: 'cheque.sortAmountHigh' },
  { id: 'amountLowest', sortBy: 'amount', sortOrder: 'asc', labelKey: 'cheque.sortAmountLow' },
];

/** How both lists open, before anyone chooses an order. */
export const DEFAULT_CHEQUE_SORT: ChequeSortOption = CHEQUE_SORTS[0]!;

/**
 * The option matching a field and direction, if it is one of these.
 *
 * `undefined` for a combination that is not on the list — the web table's
 * headers can also sort by cheque number or status, and a control showing the
 * nearest option instead of none would be telling the reader something untrue
 * about what they are looking at.
 */
export function chequeSortOption(
  sortBy: string,
  sortOrder: string,
): ChequeSortOption | undefined {
  return CHEQUE_SORTS.find(
    (option) => option.sortBy === sortBy && option.sortOrder === sortOrder,
  );
}
