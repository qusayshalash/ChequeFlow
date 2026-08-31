import { Prisma } from '@prisma/client';

/** Decimal type used for every monetary value. Never use `number` for money. */
export const Decimal = Prisma.Decimal;
export type Decimal = Prisma.Decimal;

export const MONEY_SCALE = 2;

/** Parses a user-supplied decimal string into a Decimal, rejecting junk. */
export function toMoney(value: string | number | Prisma.Decimal): Prisma.Decimal {
  const decimal = new Prisma.Decimal(value);
  if (!decimal.isFinite()) {
    throw new TypeError(`Invalid monetary value: ${String(value)}`);
  }
  return decimal.toDecimalPlaces(MONEY_SCALE, Prisma.Decimal.ROUND_HALF_UP);
}

/** Serializes a Decimal for transport — always a fixed-scale string. */
export function moneyToString(value: Prisma.Decimal | string | number): string {
  return new Prisma.Decimal(value).toFixed(MONEY_SCALE);
}

export function sumMoney(values: Iterable<Prisma.Decimal | string | number>): Prisma.Decimal {
  let total = new Prisma.Decimal(0);
  for (const value of values) {
    total = total.plus(new Prisma.Decimal(value));
  }
  return total.toDecimalPlaces(MONEY_SCALE, Prisma.Decimal.ROUND_HALF_UP);
}

/** Rates carry more precision than money: a ratio rounded to cents is noise. */
export const RATE_SCALE = 6;

/** Parses a conversion rate, rejecting junk and anything that is not positive. */
export function toRate(value: string | number | Prisma.Decimal): Prisma.Decimal {
  // Decimal throws its own error type for unparseable input; everything that
  // reaches a caller from here is a TypeError, so one catch handles all of it.
  let decimal: Prisma.Decimal;
  try {
    decimal = new Prisma.Decimal(value);
  } catch {
    throw new TypeError(`Invalid exchange rate: ${String(value)}`);
  }

  if (!decimal.isFinite() || decimal.lessThanOrEqualTo(0)) {
    throw new TypeError(`Invalid exchange rate: ${String(value)}`);
  }
  return decimal.toDecimalPlaces(RATE_SCALE, Prisma.Decimal.ROUND_HALF_UP);
}

export function rateToString(value: Prisma.Decimal | string | number): string {
  // Trailing zeros are dropped: a rate of 3.6 should read as "3.6", not
  // "3.600000", which looks like false precision to anyone checking it.
  return new Prisma.Decimal(value).toDecimalPlaces(RATE_SCALE).toString();
}

/**
 * Converts an amount into the base currency at a given rate.
 *
 * Multiplies at full precision and rounds once, at the end. Rounding the rate
 * or the amount first is what makes a converted total drift a cent per row.
 */
export function convertMoney(
  amount: Prisma.Decimal | string | number,
  rate: Prisma.Decimal | string | number,
): Prisma.Decimal {
  return new Prisma.Decimal(amount)
    .times(new Prisma.Decimal(rate))
    .toDecimalPlaces(MONEY_SCALE, Prisma.Decimal.ROUND_HALF_UP);
}
