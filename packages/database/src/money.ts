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
