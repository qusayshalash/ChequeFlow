import { z } from 'zod';

import { ContactType } from '@cheque-flow/shared-types';

import {
  emailSchema,
  optionalText,
  paginationSchema,
  phoneSchema,
  shortTextSchema,
} from './primitives.js';

const contactTypeSchema = z.enum(Object.values(ContactType) as [ContactType, ...ContactType[]]);

export const createContactSchema = z.object({
  type: contactTypeSchema,
  name: shortTextSchema,
  companyName: optionalText(255),
  phone: phoneSchema.nullish().transform((v) => v ?? null),
  email: emailSchema.nullish().transform((v) => v ?? null),
  taxNumber: optionalText(50),
  nationalId: optionalText(50),
  address: optionalText(500),
  notes: optionalText(2000),
});
export type CreateContactInput = z.infer<typeof createContactSchema>;

export const updateContactSchema = createContactSchema
  .partial()
  .extend({ isActive: z.boolean().optional() });
export type UpdateContactInput = z.infer<typeof updateContactSchema>;

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
