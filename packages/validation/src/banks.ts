import { z } from 'zod';

/**
 * A bank an organization adds for itself.
 *
 * The code is optional: most people know a bank by name, and one is made up
 * when none is given. When given it is upper-case letters and digits, the way
 * bank codes are printed.
 */
export const createBankSchema = z.object({
  name: z.string().trim().min(2, { message: 'validation.bank.nameRequired' }).max(100),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{2,12}$/, { message: 'validation.bank.codeInvalid' })
    .optional(),
  country: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/)
    .optional(),
});
export type CreateBankInput = z.infer<typeof createBankSchema>;

export const updateBankSchema = z
  .object({
    name: z.string().trim().min(2, { message: 'validation.bank.nameRequired' }).max(100).optional(),
    /** False hides it from the pickers; cheques already drawn on it keep it. */
    isActive: z.boolean().optional(),
  })
  .refine((value) => value.name !== undefined || value.isActive !== undefined, {
    message: 'validation.bank.nothingToChange',
  });
export type UpdateBankInput = z.infer<typeof updateBankSchema>;
