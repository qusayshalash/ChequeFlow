import { z } from 'zod';

import { ContactType } from '@cheque-flow/shared-types';

import {
  currencySchema,
  emailSchema,
  moneySchema,
  optionalText,
  paginationSchema,
  phoneSchema,
  shortTextSchema,
  uuidSchema,
} from './primitives.js';

const contactTypeSchema = z.enum(Object.values(ContactType) as [ContactType, ...ContactType[]]);

/**
 * The fields a contact can carry.
 *
 * Kept as a plain object so the update schema below can `.partial()` it — a
 * refined schema cannot be, and the two would otherwise have to be written out
 * twice and drift.
 */
const contactCoreObject = z.object({
  type: contactTypeSchema,
  name: shortTextSchema,
  companyName: optionalText(255),
  phone: phoneSchema.nullish().transform((v) => v ?? null),
  email: emailSchema.nullish().transform((v) => v ?? null),
  taxNumber: optionalText(50),
  nationalId: optionalText(50),
  address: optionalText(500),
  notes: optionalText(2000),
  /**
   * Ceiling of uncollected cheques to hold from this contact, and the currency
   * it is measured in. Both or neither — a limit with no currency cannot be
   * compared to anything.
   */
  creditLimit: moneySchema.nullish().transform((v) => v ?? null),
  creditLimitCurrency: currencySchema.nullish().transform((v) => v ?? null),
});

/** A limit with no currency cannot be compared to anything, and the reverse. */
const creditLimitIsComplete = (data: {
  creditLimit?: string | null;
  creditLimitCurrency?: string | null;
}): boolean =>
  ((data.creditLimit ?? null) === null) === ((data.creditLimitCurrency ?? null) === null);

export const createContactSchema = contactCoreObject.refine(creditLimitIsComplete, {
  message: 'validation.contact.creditLimitNeedsCurrency',
  path: ['creditLimitCurrency'],
});
export type CreateContactInput = z.infer<typeof createContactSchema>;

export const updateContactSchema = contactCoreObject
  .partial()
  .extend({ isActive: z.boolean().optional() })
  .refine(creditLimitIsComplete, {
    message: 'validation.contact.creditLimitNeedsCurrency',
    path: ['creditLimitCurrency'],
  });
export type UpdateContactInput = z.infer<typeof updateContactSchema>;

/**
 * Merging two duplicate contacts. `sourceId` is absorbed into `targetId`;
 * the target is the record that survives.
 */
export const mergeContactsSchema = z.object({
  sourceId: uuidSchema,
  targetId: uuidSchema,
});
export type MergeContactsInput = z.infer<typeof mergeContactsSchema>;

export const listContactsQuerySchema = paginationSchema.extend({
  type: contactTypeSchema.optional(),
  search: z.string().trim().max(120).optional(),
  isActive: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  sortBy: z.enum(['name', 'createdAt']).default('name'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});
export type ListContactsQuery = z.infer<typeof listContactsQuerySchema>;
