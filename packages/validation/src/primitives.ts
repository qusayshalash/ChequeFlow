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

/**
 * Calendar date, `YYYY-MM-DD`. Used for issue/due/received dates.
 *
 * The shape check is not enough and `Date.parse` is not either: it accepts a
 * day past the end of its month and rolls it forward. `2027-02-31` parsed to
 * the 3rd of March, `2025-02-30` to the 2nd, `2027-04-31` to the 1st of May —
 * so a due date typed one digit wrong was stored days away from what was
 * entered, silently, on the one field the whole system is organised around.
 * Only an impossible *month* was ever rejected.
 *
 * So the parsed date is read back and compared to what was typed. A date
 * survives only if it is still itself.
 *
 * The NaN guard is not decoration: an impossible month gives an Invalid Date,
 * whose `toISOString` *throws*. Unguarded, `2027-13-01` would leave here as a
 * 500 instead of the 422 it is.
 */
export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'validation.date.invalid' })
  .refine(
    (value) => {
      const parsed = new Date(`${value}T00:00:00Z`);
      return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
    },
    { message: 'validation.date.invalid' },
  );

/** Full UTC instant. */
export const isoDateTimeSchema = z.iso.datetime({ offset: true });

/**
 * Every active ISO 4217 currency code.
 *
 * A list, not a shape. The rule was `/^[A-Z]{3}$/`, which accepts `XYZ` — and
 * totals here are kept per currency and deliberately never summed across them,
 * so one typo does not produce a wrong number, it produces a permanent extra
 * column that nothing can ever be reconciled against.
 *
 * The full standard rather than a hand-picked regional set: the first attempt
 * at this listed eight codes and immediately rejected `KWD`, which the test
 * suite has always used. "Is a currency" is a question ISO already answers.
 */
export const ISO_4217_CURRENCIES = [
  'AED','AFN','ALL','AMD','ANG','AOA','ARS','AUD','AWG','AZN',
  'BAM','BBD','BDT','BGN','BHD','BIF','BMD','BND','BOB','BOV','BRL','BSD','BTN','BWP','BYN','BZD',
  'CAD','CDF','CHE','CHF','CHW','CLF','CLP','CNY','COP','COU','CRC','CUP','CVE','CZK',
  'DJF','DKK','DOP','DZD',
  'EGP','ERN','ETB','EUR',
  'FJD','FKP',
  'GBP','GEL','GHS','GIP','GMD','GNF','GTQ','GYD',
  'HKD','HNL','HTG','HUF',
  'IDR','ILS','INR','IQD','IRR','ISK',
  'JMD','JOD','JPY',
  'KES','KGS','KHR','KMF','KPW','KRW','KWD','KYD','KZT',
  'LAK','LBP','LKR','LRD','LSL','LYD',
  'MAD','MDL','MGA','MKD','MMK','MNT','MOP','MRU','MUR','MVR','MWK','MXN','MXV','MYR','MZN',
  'NAD','NGN','NIO','NOK','NPR','NZD',
  'OMR',
  'PAB','PEN','PGK','PHP','PKR','PLN','PYG',
  'QAR',
  'RON','RSD','RUB','RWF',
  'SAR','SBD','SCR','SDG','SEK','SGD','SHP','SLE','SOS','SRD','SSP','STN','SVC','SYP','SZL',
  'THB','TJS','TMT','TND','TOP','TRY','TTD','TWD','TZS',
  'UAH','UGX','USD','USN','UYI','UYU','UYW','UZS',
  'VED','VES','VND','VUV',
  'WST',
  'XAF','XCD','XCG','XDR','XOF','XPF','XSU','XUA',
  'YER',
  'ZAR','ZMW','ZWG',
] as const;

/**
 * The handful the pickers offer.
 *
 * Three screens each carried their own copy of this array — two on the web and
 * one on the phone, already in different orders. Kept here so the short list
 * and the accepted list cannot drift apart, and so a typo in it fails to
 * compile rather than producing a dropdown entry the server will refuse.
 */
export const COMMON_CURRENCIES: readonly IsoCurrency[] = ['ILS', 'USD', 'JOD', 'EUR'];

export type IsoCurrency = (typeof ISO_4217_CURRENCIES)[number];


/**
 * Deliberately still typed `string`, not the union.
 *
 * Narrowing the inferred type would ripple into every query object that
 * carries a currency — the list filters, the report ranges, the mobile app's
 * own parameter types — and none of those want a literal union. The guarantee
 * that matters is the runtime one: nothing reaches the database unless it is
 * on the list.
 */
export const currencySchema = z
  .string()
  .trim()
  .toUpperCase()
  .refine((value) => (ISO_4217_CURRENCIES as readonly string[]).includes(value), {
    message: 'validation.currency.invalid',
  });

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
