import { SetMetadata } from '@nestjs/common';
import type { Permission } from '@cheque-flow/shared-types';

export const PERMISSIONS_KEY = 'chequeflow:permissions';

/**
 * Declares the permissions a route requires. All listed permissions must be
 * held by the user (AND semantics).
 */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
