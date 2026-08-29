/**
 * Development seed.
 *
 * Creates a demo organization, one branch, a local Owner user, the full RBAC
 * catalogue, a safe, a handful of banks, customers and suppliers.
 *
 * Refuses to run when NODE_ENV=production — the demo user must never exist in
 * a real deployment.
 */

import path from 'node:path';

import argon2 from 'argon2';
import { config as loadEnv } from 'dotenv';

import {
  ContactType,
  DEFAULT_ROLE_PERMISSIONS,
  LocationType,
  PERMISSION_DESCRIPTIONS,
  Permission,
  SystemRole,
} from '@cheque-flow/shared-types';

import { createPrismaClient } from '../src/client.js';

loadEnv({ path: path.resolve(__dirname, '../../../.env'), quiet: true });

const DEMO_BANKS = [
  { country: 'SA', code: 'RJHI', name: 'مصرف الراجحي' },
  { country: 'SA', code: 'NCBK', name: 'البنك الأهلي السعودي' },
  { country: 'SA', code: 'RIBL', name: 'بنك الرياض' },
  { country: 'SA', code: 'BSFR', name: 'البنك السعودي الفرنسي' },
  { country: 'SA', code: 'ALBI', name: 'بنك البلاد' },
] as const;

const DEMO_CONTACTS = [
  { type: ContactType.CUSTOMER, name: 'أحمد بن سالم', companyName: 'مؤسسة النخبة للتجارة' },
  { type: ContactType.CUSTOMER, name: 'شركة الأفق المحدودة', companyName: 'شركة الأفق المحدودة' },
  { type: ContactType.CUSTOMER, name: 'خالد العتيبي', companyName: null },
  { type: ContactType.SUPPLIER, name: 'مصنع الشرق للمواد', companyName: 'مصنع الشرق للمواد' },
  { type: ContactType.SUPPLIER, name: 'شركة الإمداد الحديثة', companyName: 'شركة الإمداد الحديثة' },
] as const;

function requireEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('The seed script must never run against a production database.');
  }

  const prisma = createPrismaClient({ databaseUrl: requireEnv('DATABASE_URL') });

  // The sign-in field accepts a user name as well as an email address, so a
  // local install can use a short `admin` login. Anything but a development
  // machine must set a real address and a strong password in .env.
  const ownerEmail = requireEnv('SEED_OWNER_EMAIL', 'admin').toLowerCase();
  const ownerPassword = requireEnv('SEED_OWNER_PASSWORD', 'admin');

  if (ownerPassword.length < 10) {
    console.warn(
      '⚠ The seeded password is short. It is fine for local development only — ' +
        'never deploy an account with this password.',
    );
  }

  try {
    // ── permissions (global catalogue) ──────────────────────────────────────
    for (const key of Object.values(Permission)) {
      await prisma.permission.upsert({
        where: { key },
        update: { description: PERMISSION_DESCRIPTIONS[key] },
        create: { key, description: PERMISSION_DESCRIPTIONS[key] },
      });
    }
    const permissionRecords = await prisma.permission.findMany();
    const permissionIdByKey = new Map(permissionRecords.map((p) => [p.key, p.id]));

    // ── banks (reference data) ──────────────────────────────────────────────
    for (const bank of DEMO_BANKS) {
      await prisma.bank.upsert({
        where: { country_code: { country: bank.country, code: bank.code } },
        update: { name: bank.name },
        create: { country: bank.country, code: bank.code, name: bank.name },
      });
    }

    // ── organization ────────────────────────────────────────────────────────
    const organizationName = requireEnv('SEED_ORG_NAME', 'شركة التجارة النموذجية');
    const existingOrg = await prisma.organization.findFirst({ where: { name: organizationName } });
    const organization =
      existingOrg ??
      (await prisma.organization.create({
        data: {
          name: organizationName,
          country: requireEnv('SEED_ORG_COUNTRY', 'SA'),
          defaultCurrency: requireEnv('SEED_ORG_CURRENCY', 'SAR'),
          timezone: requireEnv('SEED_ORG_TIMEZONE', 'Asia/Riyadh'),
          settingsJson: {
            reminderOffsetDays: [7, 3, 1, 0],
            overdueReminderDays: 1,
            dualApproval: { 'cheque.cancel': false, 'cheque.amount_change': false },
          },
        },
      }));

    // ── branch ──────────────────────────────────────────────────────────────
    const branch = await prisma.branch.upsert({
      where: { organizationId_code: { organizationId: organization.id, code: 'MAIN' } },
      update: {},
      create: {
        organizationId: organization.id,
        name: 'الفرع الرئيسي',
        code: 'MAIN',
        address: 'الرياض، المملكة العربية السعودية',
        phone: '+966500000000',
      },
    });

    // ── roles + role permissions ────────────────────────────────────────────
    const roleIdByName = new Map<string, string>();
    for (const roleName of Object.values(SystemRole)) {
      const role = await prisma.role.upsert({
        where: { organizationId_name: { organizationId: organization.id, name: roleName } },
        update: { isSystem: true },
        create: {
          organizationId: organization.id,
          name: roleName,
          isSystem: true,
          description: `Built-in ${roleName} role`,
        },
      });
      roleIdByName.set(roleName, role.id);

      const grants = DEFAULT_ROLE_PERMISSIONS[roleName];
      await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
      await prisma.rolePermission.createMany({
        data: grants.flatMap((key) => {
          const permissionId = permissionIdByKey.get(key);
          return permissionId ? [{ roleId: role.id, permissionId }] : [];
        }),
        skipDuplicates: true,
      });
    }

    // ── owner user (development only) ───────────────────────────────────────
    const passwordHash = await argon2.hash(ownerPassword, { type: argon2.argon2id });
    const owner = await prisma.user.upsert({
      where: { organizationId_email: { organizationId: organization.id, email: ownerEmail } },
      update: { passwordHash, status: 'ACTIVE' },
      create: {
        organizationId: organization.id,
        branchId: branch.id,
        name: 'مالك الحساب',
        email: ownerEmail,
        phone: '+966500000001',
        passwordHash,
        status: 'ACTIVE',
      },
    });

    const ownerRoleId = roleIdByName.get(SystemRole.OWNER);
    if (ownerRoleId) {
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: owner.id, roleId: ownerRoleId } },
        update: {},
        create: { userId: owner.id, roleId: ownerRoleId },
      });
    }

    // A second, deliberately low-privilege user, used by the permission tests
    // and handy for manually verifying that RBAC actually blocks actions.
    const viewer = await prisma.user.upsert({
      where: {
        organizationId_email: { organizationId: organization.id, email: 'viewer' },
      },
      update: { passwordHash },
      create: {
        organizationId: organization.id,
        branchId: branch.id,
        name: 'مستخدم للاطلاع فقط',
        email: 'viewer',
        passwordHash,
        status: 'ACTIVE',
      },
    });
    const viewerRoleId = roleIdByName.get(SystemRole.VIEWER);
    if (viewerRoleId) {
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: viewer.id, roleId: viewerRoleId } },
        update: {},
        create: { userId: viewer.id, roleId: viewerRoleId },
      });
    }

    // ── locations ───────────────────────────────────────────────────────────
    const locations = [
      { type: LocationType.SAFE, name: 'الخزنة الرئيسية', description: 'خزنة الإدارة المالية' },
      { type: LocationType.DRAWER, name: 'درج الصندوق', description: 'درج أمين الصندوق' },
      { type: LocationType.BANK, name: 'إيداع بنكي', description: 'شيكات مودعة في البنك' },
      { type: LocationType.EXTERNAL, name: 'خارج الشركة', description: 'بحوزة جهة خارجية' },
    ];
    for (const location of locations) {
      const existing = await prisma.location.findFirst({
        where: { organizationId: organization.id, name: location.name },
      });
      if (!existing) {
        await prisma.location.create({
          data: { ...location, organizationId: organization.id, branchId: branch.id },
        });
      }
    }

    // ── contacts ────────────────────────────────────────────────────────────
    for (const contact of DEMO_CONTACTS) {
      const existing = await prisma.contact.findFirst({
        where: { organizationId: organization.id, name: contact.name },
      });
      if (!existing) {
        await prisma.contact.create({
          data: {
            organizationId: organization.id,
            type: contact.type,
            name: contact.name,
            companyName: contact.companyName,
          },
        });
      }
    }

    console.warn('✔ Seed complete');
    console.warn(`  organization : ${organization.name} (${organization.id})`);
    console.warn(`  branch       : ${branch.name}`);
    console.warn(`  owner login  : ${ownerEmail}`);
    console.warn(`  viewer login : viewer  (no write permissions)`);
    console.warn('  passwords come from SEED_OWNER_PASSWORD in your .env');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error('✖ Seed failed:', error);
  process.exitCode = 1;
});
