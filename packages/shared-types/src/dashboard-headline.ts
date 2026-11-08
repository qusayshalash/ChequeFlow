import type { DashboardSummary } from './domain.js';
import { addMoney } from './money.js';

export interface HeadlineTotal {
  /** Every outstanding cheque in scope, converted or not. */
  count: number;
  /**
   * One figure in the books' currency when every cheque in scope converts;
   * otherwise one per currency, since a sum that leaves cheques out is wrong.
   */
  amounts: Array<{ currency: string; total: string }>;
}

/**
 * The "all cheques" card.
 *
 * It showed the base-currency aggregate: a count of the cheques that carry an
 * exchange rate and their converted sum. With every cheque in dollars and none
 * converted, it read "0" and "ILS 0.00" beside cards counting those same
 * cheques, and it ignored the currency the reader had picked.
 */
export function headlineTotal(summary: DashboardSummary, currency: string | null): HeadlineTotal {
  const blocks = currency
    ? summary.currencies.filter((entry) => entry.currency === currency)
    : summary.currencies;

  const perCurrency = blocks
    .map((entry) => ({
      currency: entry.currency,
      count: entry.incoming.count + entry.outgoing.count,
      total: addMoney([entry.incoming.total, entry.outgoing.total]),
    }))
    .filter((entry) => entry.count > 0);

  const count = perCurrency.reduce((sum, entry) => sum + entry.count, 0);
  const base = summary.baseTotal;

  if (!currency && count > 0 && base.unconvertedCount === 0) {
    return { count, amounts: [{ currency: base.currency, total: base.total }] };
  }
  if (perCurrency.length === 0) {
    return { count: 0, amounts: [{ currency: currency ?? base.currency, total: '0.00' }] };
  }
  return {
    count,
    amounts: perCurrency.map(({ currency: code, total }) => ({ currency: code, total })),
  };
}
