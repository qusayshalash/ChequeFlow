import { Injectable } from '@nestjs/common';

import { ApiErrorCode, UserStatus, type Paginated, type UserView } from '@cheque-flow/shared-types';
import type { Prisma } from '@cheque-flow/database';
import type { CreateUserInput, ListUsersQuery, UpdateUserInput } from '@cheque-flow/validation';

import { AppError } from '../../common/errors/app-error';
import type { RequestUser } from '../../common/types/request-user';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditAction, AuditService, type AuditContext } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';

const userInclude = {
  branch: { select: { name: true } },
  userRoles: { include: { role: { select: { name: true } } } },
} satisfies Prisma.UserInclude;

type UserRow = Prisma.UserGetPayload<{ include: typeof userInclude }>;

/**
 * `passwordHash` is not selected anywhere in this mapper, so it cannot leak
 * into a response by accident even if the view type later grows a field.
 */
function toView(user: UserRow): UserView {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    status: user.status,
    branchId: user.branchId,
    branchName: user.branch?.name ?? null,
    roles: user.userRoles.map((link) => link.role.name),
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
  };
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(user: RequestUser, query: ListUsersQuery): Promise<Paginated<UserView>> {
    const where: Prisma.UserWhereInput = {
      organizationId: user.organizationId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const skip = (query.page - 1) * query.pageSize;
    const [rows, total] = await this.prisma.db.$transaction([
      this.prisma.db.user.findMany({
        where,
        include: userInclude,
        orderBy: [{ [query.sortBy]: query.sortOrder }, { id: 'asc' }],
        skip,
        take: query.pageSize,
      }),
      this.prisma.db.user.count({ where }),
    ]);

    return {
      data: rows.map(toView),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
        hasNextPage: skip + rows.length < total,
      },
    };
  }

  async create(
    user: RequestUser,
    input: CreateUserInput,
    auditMeta: Partial<AuditContext> = {},
  ): Promise<UserView> {
    const existing = await this.prisma.db.user.findFirst({
      where: { organizationId: user.organizationId, email: input.email },
      select: { id: true },
    });
    if (existing) {
      throw new AppError(ApiErrorCode.VALIDATION_ERROR, 'That sign-in name is already taken', {
        fieldErrors: [{ path: 'email', message: 'validation.user.emailTaken' }],
      });
    }

    const roles = await this.resolveRoles(user.organizationId, input.roles);
    const passwordHash = await AuthService.hashPassword(input.password);

    const created = await this.prisma.db.$transaction(async (tx) => {
      const record = await tx.user.create({
        data: {
          organizationId: user.organizationId,
          branchId: input.branchId,
          name: input.name,
          email: input.email,
          phone: input.phone,
          passwordHash,
          status: UserStatus.ACTIVE,
          userRoles: { create: roles.map((role) => ({ roleId: role.id })) },
        },
        include: userInclude,
      });

      await this.audit.recordWithin(tx, {
        organizationId: user.organizationId,
        userId: user.id,
        action: AuditAction.USER_CREATED,
        entityType: 'user',
        entityId: record.id,
        // The password is never written to the audit trail, hashed or not.
        after: { name: record.name, email: record.email, roles: input.roles },
        ipAddress: auditMeta.ipAddress ?? null,
        deviceInfo: auditMeta.deviceInfo ?? null,
      });

      return record;
    });

    return toView(created);
  }

  /**
   * Updates a user. Users are never deleted — disabling them keeps every
   * audit-log and cheque-event row that names them resolvable.
   */
  async update(
    actor: RequestUser,
    id: string,
    input: UpdateUserInput,
    auditMeta: Partial<AuditContext> = {},
  ): Promise<UserView> {
    const existing = await this.prisma.db.user.findFirst({
      where: { id, organizationId: actor.organizationId },
      include: userInclude,
    });
    if (!existing) throw AppError.notFound('User', id);

    // Locking yourself out is almost always a mistake, and recovering from it
    // needs a second administrator who may not exist.
    if (id === actor.id && input.status !== undefined && input.status !== UserStatus.ACTIVE) {
      throw new AppError(ApiErrorCode.VALIDATION_ERROR, 'You cannot disable your own account', {
        fieldErrors: [{ path: 'status', message: 'validation.user.cannotDisableSelf' }],
      });
    }

    const roles = input.roles ? await this.resolveRoles(actor.organizationId, input.roles) : null;
    const passwordHash = input.newPassword
      ? await AuthService.hashPassword(input.newPassword)
      : null;

    const updated = await this.prisma.db.$transaction(async (tx) => {
      const record = await tx.user.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.phone !== undefined ? { phone: input.phone } : {}),
          ...(input.branchId !== undefined ? { branchId: input.branchId } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(passwordHash ? { passwordHash } : {}),
        },
        include: userInclude,
      });

      if (roles) {
        await tx.userRole.deleteMany({ where: { userId: id } });
        await tx.userRole.createMany({
          data: roles.map((role) => ({ userId: id, roleId: role.id })),
        });
      }

      if (passwordHash) {
        // A password reset must not leave old sessions alive: revoke every
        // refresh token so the previous holder is signed out everywhere.
        await tx.refreshToken.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }

      await this.audit.recordWithin(tx, {
        organizationId: actor.organizationId,
        userId: actor.id,
        action: passwordHash ? AuditAction.USER_STATUS_CHANGED : AuditAction.USER_UPDATED,
        entityType: 'user',
        entityId: id,
        before: {
          name: existing.name,
          status: existing.status,
          roles: existing.userRoles.map((link) => link.role.name),
        },
        after: {
          name: record.name,
          status: record.status,
          ...(roles ? { roles: input.roles } : {}),
          ...(passwordHash ? { passwordReset: true, reason: input.reason ?? null } : {}),
        },
        ipAddress: auditMeta.ipAddress ?? null,
        deviceInfo: auditMeta.deviceInfo ?? null,
      });

      return roles ? tx.user.findUniqueOrThrow({ where: { id }, include: userInclude }) : record;
    });

    return toView(updated);
  }

  /** Resolves role names to this organization's role rows. */
  private async resolveRoles(
    organizationId: string,
    names: readonly string[],
  ): Promise<{ id: string }[]> {
    const roles = await this.prisma.db.role.findMany({
      where: { organizationId, name: { in: [...names] } },
      select: { id: true, name: true },
    });

    const missing = names.filter((name) => !roles.some((role) => role.name === name));
    if (missing.length > 0) {
      throw new AppError(ApiErrorCode.VALIDATION_ERROR, `Unknown roles: ${missing.join(', ')}`, {
        fieldErrors: [{ path: 'roles', message: 'validation.user.unknownRole' }],
      });
    }

    return roles.map((role) => ({ id: role.id }));
  }
}
