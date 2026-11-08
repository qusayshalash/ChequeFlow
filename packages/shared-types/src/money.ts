import type { MoneyString } from './domain.js';

/**
 * Arithmetic on amounts without floating point.
 *
 * The API sums money in SQL and sends it as strings; the screens then added
 * those strings up again as JavaScript numbers for their totals, where
 * 0.1 + 0.2 is 0.30000000000000004. These work in whole minor units instead,
 * at the precision of the most precise input (never less than two places).
 */
const MONEY = /^(-)?(\d+)(?:\.(\d+))?$/;

function parse(value: string): { units: bigint; scale: number } {
  const match = MONEY.exec(value.trim());
  if (!match) throw new Error(`Not an amount: ${value}`);
  const [, sign, whole = '0', fraction = ''] = match;
  const units = BigInt(`${whole}${fraction}` || '0');
  return { units: sign ? -units : units, scale: fraction.length };
}

function rescale(units: bigint, from: number, to: number): bigint {
  return units * BigInt(10) ** BigInt(to - from);
}

function format(units: bigint, scale: number): MoneyString {
  const negative = units < BigInt(0);
  const digits = (negative ? -units : units).toString().padStart(scale + 1, '0');
  const whole = digits.slice(0, digits.length - scale);
  const fraction = digits.slice(digits.length - scale);
  return `${negative ? '-' : ''}${whole}${scale > 0 ? `.${fraction}` : ''}`;
}

/** The sum of the given amounts; missing ones count as zero. */
export function addMoney(values: readonly (MoneyString | null | undefined)[]): MoneyString {
  const parsed = values.filter((value): value is string => Boolean(value)).map(parse);
  const scale = Math.max(2, ...parsed.map((entry) => entry.scale));
  const total = parsed.reduce(
    (sum, entry) => sum + rescale(entry.units, entry.scale, scale),
    BigInt(0),
  );
  return format(total, scale);
}

/** `a - b`. */
export function subtractMoney(a: MoneyString, b: MoneyString): MoneyString {
  const negated = b.trim().startsWith('-') ? b.trim().slice(1) : `-${b.trim()}`;
  return addMoney([a, negated]);
}

export function isNegativeMoney(value: MoneyString): boolean {
  return parse(value).units < BigInt(0);
}

/** Whether two spellings are the same amount; anything unparsable is not. */
export function sameMoney(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b || !MONEY.test(a.trim()) || !MONEY.test(b.trim())) return false;
  return isZeroMoney(subtractMoney(a, b));
}

export function isZeroMoney(value: MoneyString): boolean {
  return parse(value).units === BigInt(0);
}
