import { Injectable } from '@nestjs/common';

import { ApiErrorCode, isValidTimeZone, type Permission } from '@cheque-flow/shared-types';

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
    // The session the token was issued under must still be open.
    //
    // `sid` was carried in every token and checked nowhere, so signing out, a
    // password reset by an administrator, and a detected token theft each
    // revoked the refresh token and left the access token working until it
    // expired, up to fifteen minutes later. Rotation keeps exactly one live
    // token per family, so a family with none has ended.
    const [user, session] = await Promise.all([
      this.findUser(payload.sub),
      this.prisma.db.refreshToken.findFirst({
        where: {
          familyId: payload.sid,
          userId: payload.sub,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        select: { id: true },
      }),
    ]);

    if (!session) {
      throw new AppError(ApiErrorCode.UNAUTHENTICATED, 'Session has ended');
    }
    return this.toRequestUser(user, payload);
  }

  private findUser(id: string) {
    return this.prisma.db.user.findUnique({
      where: { id },
      select: {
        id: true,
        organizationId: true,
        branchId: true,
        email: true,
        name: true,
        status: true,
        organization: { select: { timezone: true } },
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
  }

  private toRequestUser(
    user: Awaited<ReturnType<SessionService['findUser']>>,
    payload: AccessTokenPayload,
  ): RequestUser {
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
      // A zone the runtime cannot read would make every date wrong in a way
      // nobody could see; UTC is wrong in a way the setting explains.
      timeZone: isValidTimeZone(user.organization.timezone) ? user.organization.timezone : 'UTC',
    };
  }
}
