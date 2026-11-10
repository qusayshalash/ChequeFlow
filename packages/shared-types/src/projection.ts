/**
 * The projected balance, day by day, from the cash-flow report.
 *
 * One function for the web dashboard and the phone, so the two cannot
 * disagree about a shortfall. The running total is kept as a money string,
 * added the same exact way as every other figure; the numbers a chart draws
 * are for drawing only.
 */
import { addMoney } from './money.js';

export interface CashFlowPeriodLike {
  period: string;
  byCurrency: Array<{ currency: string; inflow: string; outflow: string; net: string }>;
}

export interface BalanceProjection {
  currency: string;
  /** One point per calendar day, `from` to `to` inclusive. */
  points: Array<{ day: string; balance: string }>;
  /** The lowest point; its balance is negative when there is a shortfall. */
  low: { day: string; balance: string };
  inflow: string;
  outflow: string;
  net: string;
}

function nextDay(iso: string): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}

/**
 * The currency to project: the one chosen, else the first listed that the
 * coming days actually have cheques in (a forecast of zero dollars beside a
 * month of shekel cheques reads as "nothing coming"), else the fallback.
 */
export function forecastCurrency(
  periods: readonly CashFlowPeriodLike[],
  listed: readonly string[],
  chosen: string | null,
  fallback: string | null,
): string | null {
  if (chosen) return chosen;
  const ahead = new Set(periods.flatMap((period) => period.byCurrency.map((row) => row.currency)));
  return listed.find((code) => ahead.has(code)) ?? fallback ?? listed[0] ?? null;
}

/**
 * Days come from the calendar, not the report: it returns only days with
 * cheques on them, and a quiet stretch is a flat line, not a gap.
 */
export function projectBalance(
  periods: readonly CashFlowPeriodLike[],
  currency: string,
  from: string,
  to: string,
): BalanceProjection {
  const byDay = new Map(
    periods.map((period) => [
      period.period,
      period.byCurrency.find((row) => row.currency === currency),
    ]),
  );
  const days: string[] = [];
  for (let day = from; day <= to; day = nextDay(day)) days.push(day);

  let running = '0.00';
  const points = days.map((day) => {
    running = addMoney([running, byDay.get(day)?.net ?? '0.00']);
    return { day, balance: running };
  });
  const low = points.reduce(
    (lowest, point) => (Number(point.balance) < Number(lowest.balance) ? point : lowest),
    points[0] ?? { day: from, balance: '0.00' },
  );

  return {
    currency,
    points,
    low,
    inflow: addMoney(days.map((day) => byDay.get(day)?.inflow)),
    outflow: addMoney(days.map((day) => byDay.get(day)?.outflow)),
    net: running,
  };
}
