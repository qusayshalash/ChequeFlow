import type { DashboardSummary } from './domain.js';
import { addMoney } from './money.js';

export interface DirectionTotal {
  count: number;
  /** One total per currency with cheques in it; empty when there are none. */
  amounts: Array<{ currency: string; total: string }>;
}

export interface HeadlineTotal {
  /** Every outstanding cheque in scope, both directions. */
  count: number;
  /** Cheques we hold from others: money coming to us. */
  incoming: DirectionTotal;
  /** Cheques we issued: money going out. */
  outgoing: DirectionTotal;
}

/**
 * The "all cheques" card.
 *
 * Each currency on its own, never converted: a figure in the books' currency
 * depended on rates that were often never recorded, and read differently
 * under "all" and under the currency itself. Incoming and outgoing apart:
 * added together, a 1,000 cheque received and a 1,000 cheque issued read as
 * 2,000, though one is money owed to us and the other money we owe.
 */
export function headlineTotal(summary: DashboardSummary, currency: string | null): HeadlineTotal {
  const blocks = currency
    ? summary.currencies.filter((entry) => entry.currency === currency)
    : summary.currencies;

  const side = (key: 'incoming' | 'outgoing'): DirectionTotal => {
    const present = blocks.filter((entry) => entry[key].count > 0);
    return {
      count: present.reduce((sum, entry) => sum + entry[key].count, 0),
      amounts: present.map((entry) => ({
        currency: entry.currency,
        total: addMoney([entry[key].total]),
      })),
    };
  };

  const incoming = side('incoming');
  const outgoing = side('outgoing');
  return { count: incoming.count + outgoing.count, incoming, outgoing };
}
