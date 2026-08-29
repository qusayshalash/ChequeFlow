/** Minimal fixtures for the e2e suites: an organization, roles and two users. */
import argon2 from 'argon2';

import {
  ContactType,
  DEFAULT_ROLE_PERMISSIONS,
  LocationType,
  PERMISSION_DESCRIPTIONS,
  Permission,
  SystemRole,
} from '@cheque-flow/shared-types';

import type { PrismaService } from '../src/prisma/prisma.service';

export interface Fixtures {
  organizationId: string;
  branchId: string;
  ownerEmail: string;
  viewerEmail: string;
  password: string;
  safeLocationId: string;
  bankLocationId: string;
  customerId: string;
  supplierId: string;
  bankId: string;
}

export async function seedFixtures(prisma: PrismaService): Promise<Fixtures> {
  const db = prisma.db;
  const password = 'TestPassword1';
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

  for (const key of Object.values(Permission)) {
    await db.permission.upsert({
      where: { key },
      update: {},
      create: { key, description: PERMISSION_DESCRIPTIONS[key] },
    });
  }
  const permissions = await db.permission.findMany();
  const permissionIdByKey = new Map(permissions.map((p) => [p.key, p.id]));

  const organization = await db.organization.create({
    data: {
      name: `E2E Org ${Date.now()}`,
      country: 'PS',
      defaultCurrency: 'USD',
      timezone: 'Asia/Riyadh',
    },
  });

  const branch = await db.branch.create({
    data: { organizationId: organization.id, name: 'Main', code: 'MAIN' },
  });

  // All seven roles, as the real seed script creates them. Seeding only the
  // two the suites sign in as would make "assign a role" untestable and would
  // let a broken role lookup pass unnoticed.
  const roleIds = new Map<string, string>();
  for (const roleName of Object.values(SystemRole)) {
    const role = await db.role.create({
      data: { organizationId: organization.id, name: roleName, isSystem: true },
    });
    roleIds.set(roleName, role.id);
    await db.rolePermission.createMany({
      data: DEFAULT_ROLE_PERMISSIONS[roleName].flatMap((key) => {
        const permissionId = permissionIdByKey.get(key);
        return permissionId ? [{ roleId: role.id, permissionId }] : [];
      }),
      skipDuplicates: true,
    });
  }

  const ownerEmail = `owner+${Date.now()}@e2e.local`;
  const viewerEmail = `viewer+${Date.now()}@e2e.local`;

  const owner = await db.user.create({
    data: {
      organizationId: organization.id,
      branchId: branch.id,
      name: 'Owner',
      email: ownerEmail,
      passwordHash,
      status: 'ACTIVE',
    },
  });
  await db.userRole.create({
    data: { userId: owner.id, roleId: roleIds.get(SystemRole.OWNER) as string },
  });

  const viewer = await db.user.create({
    data: {
      organizationId: organization.id,
      branchId: branch.id,
      name: 'Viewer',
      email: viewerEmail,
      passwordHash,
      status: 'ACTIVE',
    },
  });
  await db.userRole.create({
    data: { userId: viewer.id, roleId: roleIds.get(SystemRole.VIEWER) as string },
  });

  const safe = await db.location.create({
    data: {
      organizationId: organization.id,
      branchId: branch.id,
      type: LocationType.SAFE,
      name: 'Safe',
    },
  });
  const bankLocation = await db.location.create({
    data: {
      organizationId: organization.id,
      branchId: branch.id,
      type: LocationType.BANK,
      name: 'Bank deposit',
    },
  });

  const customer = await db.contact.create({
    data: { organizationId: organization.id, type: ContactType.CUSTOMER, name: 'Customer One' },
  });
  const supplier = await db.contact.create({
    data: { organizationId: organization.id, type: ContactType.SUPPLIER, name: 'Supplier One' },
  });

  const bank = await db.bank.upsert({
    where: { country_code: { country: 'PS', code: 'E2E' } },
    update: {},
    create: { country: 'PS', code: 'E2E', name: 'E2E Bank' },
  });

  return {
    organizationId: organization.id,
    branchId: branch.id,
    ownerEmail,
    viewerEmail,
    password,
    safeLocationId: safe.id,
    bankLocationId: bankLocation.id,
    customerId: customer.id,
    supplierId: supplier.id,
    bankId: bank.id,
  };
}

/**
 * Removes everything the fixtures created.
 *
 * `cheque_events` and `audit_logs` reject DELETE — including the cascade from
 * deleting a cheque or an organization — so the cleanup temporarily switches
 * the session to `replica` role, which is the documented superuser escape
 * hatch for maintenance. Application code never does this.
 */
export async function cleanupFixtures(
  prisma: PrismaService,
  organizationId: string,
): Promise<void> {
  await prisma.db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET LOCAL session_replication_role = 'replica'");
    await tx.$executeRawUnsafe('DELETE FROM audit_logs WHERE organization_id = $1', organizationId);
    await tx.$executeRawUnsafe(
      'DELETE FROM cheque_events WHERE cheque_id IN (SELECT id FROM cheques WHERE organization_id = $1)',
      organizationId,
    );
    await tx.$executeRawUnsafe('DELETE FROM cheques WHERE organization_id = $1', organizationId);
    await tx.$executeRawUnsafe('DELETE FROM organizations WHERE id = $1', organizationId);
  });
}
