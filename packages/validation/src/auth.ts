import { z } from 'zod';

import { loginIdentifierSchema } from './primitives.js';

/**
 * Password policy: at least 10 characters with a lower case letter, an upper
 * case letter and a digit. Deliberately not over-constrained — length matters
 * more than exotic character classes.
 */
export const passwordSchema = z
  .string()
  .min(10, { message: 'validation.password.tooShort' })
  .max(128)
  .regex(/[a-z]/, { message: 'validation.password.needsLowercase' })
  .regex(/[A-Z]/, { message: 'validation.password.needsUppercase' })
  .regex(/[0-9]/, { message: 'validation.password.needsDigit' });

export const loginSchema = z.object({
  /**
   * Kept named `email` so the API contract is unchanged; it accepts a user
   * name as well (see `loginIdentifierSchema`).
   */
  email: loginIdentifierSchema,
  // Not `passwordSchema`: existing passwords must not be re-validated at login.
  password: z.string().min(1).max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().min(20).max(4096),
});
export type RefreshInput = z.infer<typeof refreshSchema>;

export const logoutSchema = z.object({
  refreshToken: z.string().min(20).max(4096).optional(),
  /** Revoke every active session for the user, not just this one. */
  allDevices: z.boolean().default(false),
});
export type LogoutInput = z.infer<typeof logoutSchema>;
