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

const summary = (
  currencies: DashboardCurrencyTotals[],
  base: { count: number; total: string; unconvertedCount: number },
): DashboardSummary => ({
  defaultCurrency: 'ILS',
  baseCurrency: 'ILS',
  baseTotal: { currency: 'ILS', ...base },
  currencies,
  recentEvents: [],
});

describe('the all-cheques card', () => {
  // What a screenshot showed: eight dollar cheques, none with a rate.
  const dollarsOnly = summary(
    [
      block('ILS', empty),
      block('USD', { count: 6, total: '21000.00' }, { count: 2, total: '1000.50' }),
    ],
    { count: 0, total: '0.00', unconvertedCount: 8 },
  );

  it('counts every outstanding cheque, converted or not', () => {
    expect(headlineTotal(dollarsOnly, null).count).toBe(8);
  });

  it('lists the money per currency when some of it cannot be converted', () => {
    expect(headlineTotal(dollarsOnly, null).amounts).toEqual([
      { currency: 'USD', total: '22000.50' },
    ]);
  });

  it('follows the currency the reader picked', () => {
    expect(headlineTotal(dollarsOnly, 'USD')).toEqual({
      count: 8,
      amounts: [{ currency: 'USD', total: '22000.50' }],
    });
    expect(headlineTotal(dollarsOnly, 'ILS')).toEqual({
      count: 0,
      amounts: [{ currency: 'ILS', total: '0.00' }],
    });
  });

  it('gives one figure in the books currency when everything converts', () => {
    const converted = summary(
      [block('ILS', { count: 2, total: '500.00' }), block('USD', { count: 1, total: '100.00' })],
      { count: 3, total: '870.00', unconvertedCount: 0 },
    );
    expect(headlineTotal(converted, null)).toEqual({
      count: 3,
      amounts: [{ currency: 'ILS', total: '870.00' }],
    });
  });
});
