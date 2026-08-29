import { Reflector } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';

import { Permission } from '@cheque-flow/shared-types';

import { PermissionsGuard } from './permissions.guard';
import type { RequestUser } from '../types/request-user';

function contextFor(user: RequestUser | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => () => undefined,
    getClass: () => class {},
  } as unknown as ExecutionContext;
}

const user = (permissions: Permission[]): RequestUser => ({
  id: 'u1',
  organizationId: 'o1',
  branchId: null,
  email: 'a@b.com',
  name: 'Test',
  roles: ['CASHIER'],
  permissions,
});

describe('PermissionsGuard', () => {
  const reflector = new Reflector();

  function guardWith(required: Permission[] | undefined): PermissionsGuard {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(required);
    return new PermissionsGuard(reflector);
  }

  it('allows routes with no declared permissions', () => {
    expect(guardWith(undefined).canActivate(contextFor(user([])))).toBe(true);
  });

  it('allows a user holding every required permission', () => {
    const guard = guardWith([Permission.CHEQUE_VIEW, Permission.CHEQUE_DEPOSIT]);
    expect(
      guard.canActivate(contextFor(user([Permission.CHEQUE_VIEW, Permission.CHEQUE_DEPOSIT]))),
    ).toBe(true);
  });

  it('rejects a user missing one of the required permissions', () => {
    const guard = guardWith([Permission.CHEQUE_VIEW, Permission.CHEQUE_DEPOSIT]);
    expect(() => guard.canActivate(contextFor(user([Permission.CHEQUE_VIEW])))).toThrow(
      /Missing required permission/,
    );
  });

  it('rejects an unauthenticated request', () => {
    const guard = guardWith([Permission.CHEQUE_VIEW]);
    expect(() => guard.canActivate(contextFor(undefined))).toThrow();
  });
});
