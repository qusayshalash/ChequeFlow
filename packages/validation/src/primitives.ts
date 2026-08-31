import { z } from 'zod';

/** UUID v4 identifier used for every primary key. */
export const uuidSchema = z.uuid();

/**
 * Monetary amounts are transported as decimal strings so that no value ever
 * passes through a JavaScript float. Up to 16 integer digits and 2 decimals,
 * matching `Decimal(18, 2)` in PostgreSQL.
 */
export const moneySchema = z
  .string()
  .trim()
  .regex(/^\d{1,16}(\.\d{1,2})?$/, { message: 'validation.money.invalid' })
  .refine((value) => Number.parseFloat(value) > 0, { message: 'validation.money.positive' });

/**
 * A currency conversion rate: a positive ratio with up to six decimals.
 *
 * Kept as a string alongside the money values, for the same reason: parsing a
 * rate through a float and multiplying it by an amount is how a total ends up
 * a cent out on every row.
 */
export const exchangeRateSchema = z
  .string()
  .trim()
  .regex(/^\d{1,11}(\.\d{1,6})?$/, { message: 'validation.exchangeRate.invalid' })
  .refine((value) => Number.parseFloat(value) > 0, {
    message: 'validation.exchangeRate.positive',
  });

/** Calendar date, `YYYY-MM-DD`. Used for issue/due/received dates. */
export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'validation.date.invalid' })
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), {
    message: 'validation.date.invalid',
  });

/** Full UTC instant. */
export const isoDateTimeSchema = z.iso.datetime({ offset: true });

export const currencySchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, { message: 'validation.currency.invalid' });

export const countrySchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}$/, { message: 'validation.country.invalid' });

export const emailSchema = z.email().trim().toLowerCase().max(254);

/**
 * The value typed into the "user name" field at sign-in.
 *
 * Accepts either a full email address or a short user name (`admin`), so a
 * deployment can issue either style of account. It is matched against the
 * `users.email` column, which stores whichever form was registered.
 */
export const loginIdentifierSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(254)
  .regex(/^[a-z0-9._%+-]+(@[a-z0-9.-]+\.[a-z]{2,})?$/, {
    message: 'validation.identifier.invalid',
  });

export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[0-9\s-]{6,20}$/, { message: 'validation.phone.invalid' });

/** Cheque numbers are alphanumeric and may contain separators. */
export const chequeNumberSchema = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .regex(/^[A-Za-z0-9/-]+$/, { message: 'validation.chequeNumber.invalid' });

export const shortTextSchema = z.string().trim().min(1).max(255);
export const longTextSchema = z.string().trim().max(2000);

/** Optional free text: empty strings from forms become `null`. */
export const optionalText = (max = 255) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value.length === 0 ? null : value))
    .nullish()
    .transform((value) => value ?? null);

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type PaginationInput = z.infer<typeof paginationSchema>;

export const sortOrderSchema = z.enum(['asc', 'desc']).default('desc');
