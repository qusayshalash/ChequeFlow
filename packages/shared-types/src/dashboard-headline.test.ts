import { describe, expect, it } from 'vitest';

import { headlineTotal } from './dashboard-headline.js';
import type { DashboardCurrencyTotals, DashboardSummary } from './domain.js';

const empty = { count: 0, total: '0.00' };
const block = (
  currency: string,
  incoming: { count: number; total: string },
  outgoing = empty,
): DashboardCurrencyTotals => ({
  currency,
  draft: empty,
  inHand: empty,
  dueToday: empty,
  dueWithin7Days: empty,
  dueWithin30Days: empty,
  overdue: empty,
  deposited: empty,
  cleared: empty,
  bounced: empty,
  returned: empty,
  incoming,
  outgoing,
});

const summary = (currencies: DashboardCurrencyTotals[]): DashboardSummary => ({
  defaultCurrency: 'USD',
  baseCurrency: 'USD',
  // Ignored: nothing on the card is converted.
  baseTotal: { currency: 'USD', count: 0, total: '64005.00', unconvertedCount: 0 },
  currencies,
  recentEvents: [],
});

describe('the all-cheques card', () => {
  const book = summary([
    block('ILS', { count: 1, total: '10000.00' }),
    block('USD', { count: 17, total: '73002.00' }, { count: 2, total: '1500.00' }),
  ]);

  it('counts every outstanding cheque, both directions', () => {
    expect(headlineTotal(book, null).count).toBe(20);
  });

  it('keeps what we hold apart from what we issued', () => {
    const all = headlineTotal(book, null);
    expect(all.incoming).toEqual({
      count: 18,
      amounts: [
        { currency: 'ILS', total: '10000.00' },
        { currency: 'USD', total: '73002.00' },
      ],
    });
    expect(all.outgoing).toEqual({ count: 2, amounts: [{ currency: 'USD', total: '1500.00' }] });
  });

  it('never converts one currency into another', () => {
    const all = headlineTotal(book, null);
    expect(JSON.stringify(all)).not.toContain('64005');
  });

  it('follows the currency picked', () => {
    expect(headlineTotal(book, 'ILS')).toEqual({
      count: 1,
      incoming: { count: 1, amounts: [{ currency: 'ILS', total: '10000.00' }] },
      outgoing: { count: 0, amounts: [] },
    });
  });

  it('agrees with each currency picked on its own', () => {
    const all = headlineTotal(book, null).incoming.amounts;
    expect(all).toContainEqual(headlineTotal(book, 'USD').incoming.amounts[0]);
    expect(all).toContainEqual(headlineTotal(book, 'ILS').incoming.amounts[0]);
  });
});
