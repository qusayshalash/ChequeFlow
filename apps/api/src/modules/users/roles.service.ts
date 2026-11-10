import { Injectable } from '@nestjs/common';

import {
  ALL_PERMISSIONS,
  SystemRole,
  type Permission,
  type RoleView,
} from '@cheque-flow/shared-types';
import type { UpdateRolePermissionsInput } from '@cheque-flow/validation';

import { AppError } from '../../common/errors/app-error';
import type { RequestUser } from '../../common/types/request-user';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditAction, AuditService, type AuditContext } from '../audit/audit.service';

/** Order permissions as the catalogue lists them, so every screen agrees. */
const byCatalogue = (keys: Iterable<string>): string[] => {
  const held = new Set(keys);
  return ALL_PERMISSIONS.filter((key) => held.has(key));
};

/**
 * What each role in this organization grants.
 *
 * Editing is the owner's alone. An admin can already put anyone, themselves
 * included, into any role but the owner's; if they could also choose what a
 * role grants, they could give one of them the owner's permissions and take
 * that role. And the owner role itself is fixed at every permission, so no
 * edit can leave an organization without someone able to undo it.
 */
@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(user: RequestUser): Promise<RoleView[]> {
    const roles = await this.prisma.db.role.findMany({
      where: { organizationId: user.organizationId },
      include: { rolePermissions: { include: { permission: { select: { key: true } } } } },
    });
    const order = Object.values(SystemRole) as string[];
    return roles
      .sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name))
      .map((role) => ({
        id: role.id,
        name: role.name,
        permissions: byCatalogue(role.rolePermissions.map((link) => link.permission.key)),
        isLocked: role.name === SystemRole.OWNER,
      }));
  }

  async updatePermissions(
    actor: RequestUser,
    roleId: string,
    input: UpdateRolePermissionsInput,
    auditMeta: Partial<AuditContext> = {},
  ): Promise<RoleView> {
    if (!actor.roles.includes(SystemRole.OWNER)) {
      throw AppError.forbidden('Only an owner can change what a role grants', {
        required: SystemRole.OWNER,
      });
    }
    const role = await this.prisma.db.role.findFirst({
      where: { id: roleId, organizationId: actor.organizationId },
      include: { rolePermissions: { include: { permission: { select: { key: true } } } } },
    });
    if (!role) throw AppError.notFound('Role', roleId);
    if (role.name === SystemRole.OWNER) {
      throw AppError.forbidden('The owner role always holds every permission');
    }

    const before = byCatalogue(role.rolePermissions.map((link) => link.permission.key));
    const after = byCatalogue(input.permissions as Permission[]);

    await this.prisma.db.$transaction(async (tx) => {
      const catalogue = await tx.permission.findMany({
        where: { key: { in: after } },
        select: { id: true },
      });
      await tx.rolePermission.deleteMany({ where: { roleId } });
      if (catalogue.length > 0) {
        await tx.rolePermission.createMany({
          data: catalogue.map((permission) => ({ roleId, permissionId: permission.id })),
        });
      }
      await this.audit.recordWithin(tx, {
        organizationId: actor.organizationId,
        userId: actor.id,
        action: AuditAction.ROLE_PERMISSIONS_CHANGED,
        entityType: 'role',
        entityId: roleId,
        before: { role: role.name, permissions: before },
        after: { role: role.name, permissions: after },
        ipAddress: auditMeta.ipAddress ?? null,
        deviceInfo: auditMeta.deviceInfo ?? null,
      });
    });

    return { id: role.id, name: role.name, permissions: after, isLocked: false };
  }
}
