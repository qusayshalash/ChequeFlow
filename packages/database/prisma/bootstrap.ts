/**
 * The first organization and its owner, on a production database.
 *
 * The development seed refuses to run in production, and rightly — it creates
 * demo contacts, a demo viewer account and a short default password. Which
 * left a fresh deployment with no way in at all: an empty database, and no
 * account to sign in with to create one.
 *
 * This creates only what a real organization needs to start: the permission
 * catalogue, the reference banks, the organization, one branch, its storage
 * locations, the built-in roles, and an owner. Everything else is entered through the product.
 *
 * It runs once. With any organization already present it refuses, so running
 * it again by mistake cannot create a second owner or touch existing data.
 *
 *   ORG_NAME=… ORG_TIMEZONE=Asia/Hebron OWNER_NAME=… OWNER_EMAIL=… \
 *   OWNER_PASSWORD=… tsx prisma/bootstrap.ts
 *
 * docs/deployment.md has the version to run inside the deployed stack.
 */
import argon2 from 'argon2';

import {
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSION_DESCRIPTIONS,
  Permission,
  SystemRole,
  isValidTimeZone,
} from '@cheque-flow/shared-types';

import { createPrismaClient } from '../src/client.js';
import { DEFAULT_LOCATIONS } from './default-locations.js';
import { ensureReferenceBanks } from './reference-banks.js';

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

/**
 * The product's own password rule, restated: ten characters, an upper and a
 * lower case letter, and a digit. The owner is the account with every
 * permission; it must not start on a password the product would refuse.
 */
function assertStrong(password: string): void {
  const problems = [
    password.length < 10 && 'at least 10 characters',
    !/[a-z]/.test(password) && 'a lower case letter',
    !/[A-Z]/.test(password) && 'an upper case letter',
    !/[0-9]/.test(password) && 'a digit',
  ].filter(Boolean);
  if (problems.length > 0) {
    throw new Error(`OWNER_PASSWORD needs ${problems.join(', ')}`);
  }
}

async function main(): Promise<void> {
  const organizationName = required('ORG_NAME');
  const country = (process.env.ORG_COUNTRY ?? 'PS').trim().toUpperCase();
  const currency = (process.env.ORG_CURRENCY ?? 'ILS').trim().toUpperCase();
  const timezone = (process.env.ORG_TIMEZONE ?? 'Asia/Hebron').trim();
  const ownerName = required('OWNER_NAME');
  const ownerEmail = required('OWNER_EMAIL').toLowerCase();
  const ownerPassword = required('OWNER_PASSWORD');

  if (!/^[A-Z]{2}$/.test(country)) throw new Error('ORG_COUNTRY must be two letters, e.g. PS');
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error('ORG_CURRENCY must be three letters, e.g. ILS');
  // An unknown zone would make every "today" in the product quietly UTC.
  if (!isValidTimeZone(timezone)) throw new Error(`ORG_TIMEZONE "${timezone}" is not a time zone`);
  assertStrong(ownerPassword);

  const prisma = createPrismaClient({ databaseUrl: required('DATABASE_URL') });
  try {
    const existing = await prisma.organization.count();
    if (existing > 0) {
      throw new Error(
        'An organization already exists. Bootstrap runs once, on an empty database, and changes nothing otherwise.',
      );
    }

    for (const key of Object.values(Permission)) {
      await prisma.permission.upsert({
        where: { key },
        update: { description: PERMISSION_DESCRIPTIONS[key] },
        create: { key, description: PERMISSION_DESCRIPTIONS[key] },
      });
    }
    const permissionIdByKey = new Map(
      (await prisma.permission.findMany()).map((permission) => [permission.key, permission.id]),
    );

    await ensureReferenceBanks(prisma);

    const passwordHash = await argon2.hash(ownerPassword, { type: argon2.argon2id });

    const owner = await prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: {
          name: organizationName,
          country,
          defaultCurrency: currency,
          baseCurrency: currency,
          timezone,
          settingsJson: { reminderOffsetDays: [7, 3, 1, 0], overdueReminderDays: 1 },
        },
      });

      const branch = await tx.branch.create({
        data: { organizationId: organization.id, name: 'الفرع الرئيسي', code: 'MAIN' },
      });

      await tx.location.createMany({
        data: DEFAULT_LOCATIONS.map((location) => ({
          ...location,
          organizationId: organization.id,
          branchId: branch.id,
        })),
      });

      let ownerRoleId = '';
      for (const roleName of Object.values(SystemRole)) {
        const role = await tx.role.create({
          data: {
            organizationId: organization.id,
            name: roleName,
            isSystem: true,
            description: `Built-in ${roleName} role`,
          },
        });
        if (roleName === SystemRole.OWNER) ownerRoleId = role.id;
        await tx.rolePermission.createMany({
          data: DEFAULT_ROLE_PERMISSIONS[roleName].flatMap((key) => {
            const permissionId = permissionIdByKey.get(key);
            return permissionId ? [{ roleId: role.id, permissionId }] : [];
          }),
        });
      }

      return tx.user.create({
        data: {
          organizationId: organization.id,
          branchId: branch.id,
          email: ownerEmail,
          name: ownerName,
          passwordHash,
          status: 'ACTIVE',
          userRoles: { create: [{ roleId: ownerRoleId }] },
        },
        select: { email: true },
      });
    });

    process.stdout.write(
      `Created "${organizationName}" and its owner, ${owner.email}.\n` +
        'Sign in to finish setting up. Running this again will be refused.\n',
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
