import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import type { Permission } from '@cheque-flow/shared-types';

import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import { AppError } from '../errors/app-error';

/**
 * Enforces the permissions declared with `@RequirePermissions`.
 *
 * Runs after `JwtAuthGuard`, so `request.user` is always populated for
 * non-public routes.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user;
    if (!user) {
      throw AppError.forbidden('Permission check on an unauthenticated request');
    }

    const granted = new Set(user.permissions);
    const missing = required.filter((permission) => !granted.has(permission));
    if (missing.length > 0) {
      throw AppError.forbidden('Missing required permission', { missing: missing.join(',') });
    }
    return true;
  }
}
