import { z } from 'zod';

import {
  ALL_PERMISSIONS,
  SystemRole,
  UserStatus,
  type Permission,
} from '@cheque-flow/shared-types';

import { passwordSchema } from './auth.js';
import {
  loginIdentifierSchema,
  optionalText,
  paginationSchema,
  phoneSchema,
  shortTextSchema,
  uuidSchema,
} from './primitives.js';

const roleNameSchema = z.enum(Object.values(SystemRole) as [SystemRole, ...SystemRole[]]);
const userStatusSchema = z.enum(Object.values(UserStatus) as [UserStatus, ...UserStatus[]]);

export const createUserSchema = z.object({
  name: shortTextSchema,
  /** Either an email or a plain username, matching how people sign in. */
  email: loginIdentifierSchema,
  password: passwordSchema,
  phone: phoneSchema.nullish().transform((v) => v ?? null),
  branchId: uuidSchema.nullish().transform((v) => v ?? null),
  /** At least one role: a user with no role can sign in but do nothing. */
  roles: z.array(roleNameSchema).min(1),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z.object({
  name: shortTextSchema.optional(),
  phone: phoneSchema.nullish(),
  branchId: uuidSchema.nullish(),
  status: userStatusSchema.optional(),
  roles: z.array(roleNameSchema).min(1).optional(),
  /**
   * An administrator resetting someone's password. Kept separate from the
   * self-service flow and always audited; the old password is never required
   * here because the administrator does not know it.
   */
  newPassword: passwordSchema.optional(),
  /** Free-text justification, recorded in the audit trail when supplied. */
  reason: optionalText(500).optional(),
});
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

/** The full set of permissions a role should hold after the change. */
export const updateRolePermissionsSchema = z.object({
  permissions: z
    .array(z.enum(ALL_PERMISSIONS as [Permission, ...Permission[]]))
    .max(ALL_PERMISSIONS.length)
    .transform((keys) => [...new Set(keys)]),
});
export type UpdateRolePermissionsInput = z.infer<typeof updateRolePermissionsSchema>;

export const listUsersQuerySchema = paginationSchema.extend({
  search: z.string().trim().max(120).optional(),
  status: userStatusSchema.optional(),
  sortBy: z.enum(['name', 'createdAt', 'lastLoginAt']).default('name'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
