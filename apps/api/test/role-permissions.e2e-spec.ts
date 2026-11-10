/**
 * Editing what a role grants.
 *
 * The rules that matter are the refusals: only the owner edits, the owner role
 * cannot be edited, and an admin, who can already put people into roles,
 * cannot also choose what those roles grant.
 */
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { API, createTestApp, describeWithDb } from './test-app';
import { cleanupFixtures, seedFixtures, type Fixtures } from './seed-fixtures';
import type { PrismaService } from '../src/prisma/prisma.service';

describeWithDb('role permissions (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let org: Fixtures;
  let other: Fixtures;
  let owner: string;
  let otherOwner: string;
  let roleIds: Record<string, string>;

  const login = async (email: string, password: string) =>
    (
      await request(app.getHttpServer())
        .post(`${API}/auth/login`)
        .send({ email, password })
        .expect(200)
    ).body.accessToken as string;
  const as = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    const context = await createTestApp();
    app = context.app;
    prisma = context.prisma;
    org = await seedFixtures(prisma);
    other = await seedFixtures(prisma);
    owner = await login(org.ownerEmail, org.password);
    otherOwner = await login(other.ownerEmail, other.password);
    const roles = await prisma.db.role.findMany({ where: { organizationId: org.organizationId } });
    roleIds = Object.fromEntries(roles.map((role) => [role.name, role.id]));
  });

  afterAll(async () => {
    if (org) await cleanupFixtures(prisma, org.organizationId);
    if (other) await cleanupFixtures(prisma, other.organizationId);
    if (app) await app.close();
  });

  it('lists each role with what it grants', async () => {
    const response = await request(app.getHttpServer())
      .get(`${API}/roles`)
      .set(as(owner))
      .expect(200);
    const ownerRole = response.body.find((role: { name: string }) => role.name === 'OWNER');
    expect(ownerRole.isLocked).toBe(true);
    expect(ownerRole.permissions).toContain('settings.manage');
    const viewer = response.body.find((role: { name: string }) => role.name === 'VIEWER');
    expect(viewer.permissions).toEqual(['cheque.view', 'report.view']);
  });

  it('lets the owner change a role, effective at once and audited', async () => {
    const viewerToken = await login(org.viewerEmail, org.password);
    const contact = { type: 'CUSTOMER', name: 'Granted Later' };
    await request(app.getHttpServer())
      .post(`${API}/contacts`)
      .set(as(viewerToken))
      .send(contact)
      .expect(403);

    const updated = await request(app.getHttpServer())
      .patch(`${API}/roles/${roleIds.VIEWER}/permissions`)
      .set(as(owner))
      .send({ permissions: ['report.view', 'cheque.view', 'contact.manage', 'cheque.view'] })
      .expect(200);
    // Catalogue order, duplicates gone.
    expect(updated.body.permissions).toEqual(['cheque.view', 'contact.manage', 'report.view']);

    // The same token: permissions are read per request, not baked into it.
    await request(app.getHttpServer())
      .post(`${API}/contacts`)
      .set(as(viewerToken))
      .send(contact)
      .expect(201);

    const audit = await prisma.db.auditLog.findFirstOrThrow({
      where: { organizationId: org.organizationId, action: 'role.permissions.changed' },
    });
    expect(audit.entityId).toBe(roleIds.VIEWER);
    expect((audit.beforeJson as { permissions: string[] }).permissions).toEqual([
      'cheque.view',
      'report.view',
    ]);
  });

  it('refuses to edit the owner role', async () => {
    await request(app.getHttpServer())
      .patch(`${API}/roles/${roleIds.OWNER}/permissions`)
      .set(as(owner))
      .send({ permissions: ['cheque.view'] })
      .expect(403);
  });

  it('refuses an unknown permission', async () => {
    await request(app.getHttpServer())
      .patch(`${API}/roles/${roleIds.VIEWER}/permissions`)
      .set(as(owner))
      .send({ permissions: ['everything.all'] })
      .expect(422);
  });

  it("refuses another organization's role", async () => {
    await request(app.getHttpServer())
      .patch(`${API}/roles/${roleIds.VIEWER}/permissions`)
      .set(as(otherOwner))
      .send({ permissions: [] })
      .expect(404);
  });

  // Last: it promotes this organization's viewer to admin.
  it('does not let an admin choose what roles grant', async () => {
    const viewer = await prisma.db.user.findFirstOrThrow({ where: { email: org.viewerEmail } });
    await prisma.db.userRole.deleteMany({ where: { userId: viewer.id } });
    await prisma.db.userRole.create({ data: { userId: viewer.id, roleId: roleIds.ADMIN! } });
    const admin = await login(org.viewerEmail, org.password);

    // Reading is fine; it is part of managing users.
    await request(app.getHttpServer()).get(`${API}/roles`).set(as(admin)).expect(200);
    // Writing is not: with it an admin could add settings.manage to a role
    // and then assign that role to themselves.
    await request(app.getHttpServer())
      .patch(`${API}/roles/${roleIds.ACCOUNTANT}/permissions`)
      .set(as(admin))
      .send({ permissions: ['settings.manage'] })
      .expect(403);
    const accountant = await prisma.db.rolePermission.count({
      where: { roleId: roleIds.ACCOUNTANT, permission: { key: 'settings.manage' } },
    });
    expect(accountant).toBe(0);
  });
});
