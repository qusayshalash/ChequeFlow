import { Injectable } from '@nestjs/common';

import { ApiErrorCode, type Permission } from '@cheque-flow/shared-types';

import { AppError } from '../../common/errors/app-error';
import type { RequestUser } from '../../common/types/request-user';
import { PrismaService } from '../../prisma/prisma.service';
import type { AccessTokenPayload } from '../../common/guards/jwt-auth.guard';

/**
 * Resolves the authenticated principal for a request, including the live set
 * of permissions granted by the user's roles.
 */
@Injectable()
export class SessionService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveRequestUser(payload: AccessTokenPayload): Promise<RequestUser> {
    const user = await this.prisma.db.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        organizationId: true,
        branchId: true,
        email: true,
        name: true,
        status: true,
        userRoles: {
          select: {
            role: {
              select: {
                name: true,
                rolePermissions: { select: { permission: { select: { key: true } } } },
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new AppError(ApiErrorCode.UNAUTHENTICATED, 'Token refers to a deleted user');
    }
    if (user.status !== 'ACTIVE') {
      throw new AppError(ApiErrorCode.UNAUTHENTICATED, `User is ${user.status}`);
    }
    // A token minted for another organization can never be used here.
    if (user.organizationId !== payload.org) {
      throw new AppError(ApiErrorCode.UNAUTHENTICATED, 'Organization mismatch in token');
    }

    const permissions = new Set<Permission>();
    for (const { role } of user.userRoles) {
      for (const { permission } of role.rolePermissions) {
        permissions.add(permission.key as Permission);
      }
    }

    return {
      id: user.id,
      organizationId: user.organizationId,
      branchId: user.branchId,
      email: user.email,
      name: user.name,
      roles: user.userRoles.map(({ role }) => role.name),
      permissions: [...permissions],
    };
  }
}
