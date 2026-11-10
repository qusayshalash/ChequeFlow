import { describe, expect, it } from 'vitest';

import { forecastCurrency, projectBalance } from './projection';

const periods = [
  {
    period: '2026-11-11',
    byCurrency: [{ currency: 'ILS', inflow: '12000.00', outflow: '0.00', net: '12000.00' }],
  },
  {
    period: '2026-11-12',
    byCurrency: [{ currency: 'ILS', inflow: '0.00', outflow: '20000.00', net: '-20000.00' }],
  },
  {
    period: '2026-11-14',
    byCurrency: [
      { currency: 'ILS', inflow: '1200.10', outflow: '0.00', net: '1200.10' },
      { currency: 'USD', inflow: '800.00', outflow: '0.00', net: '800.00' },
    ],
  },
];

describe('projectBalance', () => {
  it('runs the balance day by day, filling quiet days, in exact money', () => {
    const result = projectBalance(periods, 'ILS', '2026-11-10', '2026-11-15');
    expect(result.points.map((point) => point.balance)).toEqual([
      '0.00',
      '12000.00',
      '-8000.00',
      '-8000.00',
      '-6799.90',
      '-6799.90',
    ]);
    expect(result.low).toEqual({ day: '2026-11-12', balance: '-8000.00' });
    expect(result).toMatchObject({ inflow: '13200.10', outflow: '20000.00', net: '-6799.90' });
  });

  it('keeps currencies apart', () => {
    expect(projectBalance(periods, 'USD', '2026-11-10', '2026-11-15').net).toBe('800.00');
  });
});

describe('forecastCurrency', () => {
  it('prefers the chosen one, then one with cheques ahead, then the fallback', () => {
    expect(forecastCurrency(periods, ['USD', 'ILS'], 'JOD', 'ILS')).toBe('JOD');
    expect(forecastCurrency(periods, ['JOD', 'ILS', 'USD'], null, 'USD')).toBe('ILS');
    expect(forecastCurrency([], ['JOD'], null, 'USD')).toBe('USD');
  });
});
