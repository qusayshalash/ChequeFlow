/**
 * An organization's own banks: added in settings, seen only by that
 * organization, hidden from the pickers without leaving the cheques drawn on
 * them, and never able to touch the shared reference list.
 */
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { API, createTestApp, describeWithDb } from './test-app';
import { cleanupFixtures, seedFixtures, type Fixtures } from './seed-fixtures';
import type { PrismaService } from '../src/prisma/prisma.service';

describeWithDb('organization banks (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let orgA: Fixtures;
  let orgB: Fixtures;
  let ownerA: string;
  let viewerA: string;
  let ownerB: string;
  let bankId: string;

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
    orgA = await seedFixtures(prisma);
    orgB = await seedFixtures(prisma);
    ownerA = await login(orgA.ownerEmail, orgA.password);
    viewerA = await login(orgA.viewerEmail, orgA.password);
    ownerB = await login(orgB.ownerEmail, orgB.password);
  });

  afterAll(async () => {
    if (orgA) await cleanupFixtures(prisma, orgA.organizationId);
    if (orgB) await cleanupFixtures(prisma, orgB.organizationId);
    if (app) await app.close();
  });

  it('adds a bank, generating a code when none is given, and audits it', async () => {
    const created = await request(app.getHttpServer())
      .post(`${API}/banks`)
      .set(as(ownerA))
      .send({ name: 'Local Test Bank' })
      .expect(201);
    bankId = created.body.id;
    expect(created.body).toMatchObject({
      name: 'Local Test Bank',
      isReference: false,
      isActive: true,
      chequeCount: 0,
    });
    expect(created.body.code).toMatch(/^[A-Z0-9-]{2,12}$/);

    const audit = await prisma.db.auditLog.findFirst({
      where: { organizationId: orgA.organizationId, action: 'bank.created', entityId: bankId },
    });
    expect(audit).not.toBeNull();
  });

  it('offers the new bank in this organization only', async () => {
    const mine = await request(app.getHttpServer()).get(`${API}/banks`).set(as(ownerA)).expect(200);
    expect(mine.body.map((bank: { id: string }) => bank.id)).toContain(bankId);

    const theirs = await request(app.getHttpServer())
      .get(`${API}/banks`)
      .set(as(ownerB))
      .expect(200);
    expect(theirs.body.map((bank: { id: string }) => bank.id)).not.toContain(bankId);
    // The reference list is still everyone's.
    expect(theirs.body.map((bank: { id: string }) => bank.id)).toContain(orgB.bankId);
  });

  it("refuses a cheque drawn on another organization's bank", async () => {
    const response = await request(app.getHttpServer())
      .post(`${API}/cheques`)
      .set(as(ownerB))
      .send({
        direction: 'INCOMING',
        chequeNumber: 'FOREIGN-BANK-1',
        amount: '10.00',
        currency: 'USD',
        dueDate: '2026-12-31',
        bankId,
      })
      .expect(404);
    expect(response.body.error.details.entity).toBe('Bank');
  });

  it('does not let another organization edit it', async () => {
    await request(app.getHttpServer())
      .patch(`${API}/banks/${bankId}`)
      .set(as(ownerB))
      .send({ name: 'Taken over' })
      .expect(404);
  });

  it('rejects a second bank of the same name, in any letter case', async () => {
    const response = await request(app.getHttpServer())
      .post(`${API}/banks`)
      .set(as(ownerA))
      .send({ name: 'local test BANK' })
      .expect(422);
    expect(response.body.error.fieldErrors[0]).toMatchObject({
      path: 'name',
      message: 'validation.bank.nameTaken',
    });
  });

  it('rejects a code a reference bank already uses', async () => {
    const reference = await prisma.db.bank.findUniqueOrThrow({ where: { id: orgA.bankId } });
    const response = await request(app.getHttpServer())
      .post(`${API}/banks`)
      .set(as(ownerA))
      .send({ name: 'Some Other Bank', code: reference.code, country: reference.country })
      .expect(422);
    expect(response.body.error.fieldErrors[0].path).toBe('code');
  });

  it('hides a bank from the pickers while its cheques keep it', async () => {
    const cheque = await request(app.getHttpServer())
      .post(`${API}/cheques`)
      .set(as(ownerA))
      .send({
        direction: 'INCOMING',
        chequeNumber: 'OWN-BANK-1',
        amount: '25.00',
        currency: 'USD',
        dueDate: '2026-12-31',
        bankId,
      })
      .expect(201);

    const hidden = await request(app.getHttpServer())
      .patch(`${API}/banks/${bankId}`)
      .set(as(ownerA))
      .send({ isActive: false })
      .expect(200);
    expect(hidden.body).toMatchObject({ isActive: false, chequeCount: 1 });

    const picker = await request(app.getHttpServer())
      .get(`${API}/banks`)
      .set(as(ownerA))
      .expect(200);
    expect(picker.body.map((bank: { id: string }) => bank.id)).not.toContain(bankId);

    const manage = await request(app.getHttpServer())
      .get(`${API}/banks/manage`)
      .set(as(ownerA))
      .expect(200);
    expect(manage.body.find((bank: { id: string }) => bank.id === bankId)).toMatchObject({
      isActive: false,
    });

    const detail = await request(app.getHttpServer())
      .get(`${API}/cheques/${cheque.body.cheque.id}`)
      .set(as(ownerA))
      .expect(200);
    expect(detail.body.bankId ?? detail.body.bank?.id).toBe(bankId);
  });

  it('renames a bank and audits the change', async () => {
    const renamed = await request(app.getHttpServer())
      .patch(`${API}/banks/${bankId}`)
      .set(as(ownerA))
      .send({ name: 'Renamed Test Bank' })
      .expect(200);
    expect(renamed.body.name).toBe('Renamed Test Bank');

    const audit = await prisma.db.auditLog.findFirst({
      where: { organizationId: orgA.organizationId, action: 'bank.updated', entityId: bankId },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit).not.toBeNull();
  });

  it('refuses to change a reference bank', async () => {
    await request(app.getHttpServer())
      .patch(`${API}/banks/${orgA.bankId}`)
      .set(as(ownerA))
      .send({ name: 'Mine now' })
      .expect(403);
  });

  it('needs the settings permission to add or change banks', async () => {
    await request(app.getHttpServer())
      .post(`${API}/banks`)
      .set(as(viewerA))
      .send({ name: 'Viewer Bank' })
      .expect(403);
    await request(app.getHttpServer())
      .patch(`${API}/banks/${bankId}`)
      .set(as(viewerA))
      .send({ isActive: true })
      .expect(403);
    await request(app.getHttpServer()).get(`${API}/banks/manage`).set(as(viewerA)).expect(403);
    // Reading the picker list is still open to anyone who can see cheques.
    await request(app.getHttpServer()).get(`${API}/banks`).set(as(viewerA)).expect(200);
  });

  it('rejects the same name spelt without its hamza, naming the bank it clashes with', async () => {
    const reference = await prisma.db.bank.create({
      data: {
        country: 'PS',
        code: `HZ${Date.now().toString(36).slice(-6).toUpperCase()}`,
        name: 'بنك الإختبار الإسلامي',
      },
    });
    try {
      const response = await request(app.getHttpServer())
        .post(`${API}/banks`)
        .set(as(ownerA))
        .send({ name: 'بنك الاختبار الاسلامي' })
        .expect(422);
      expect(response.body.error.fieldErrors[0].message).toBe('validation.bank.nameTaken');
      expect(response.body.error.details.existingName).toBe('بنك الإختبار الإسلامي');
    } finally {
      await prisma.db.bank.delete({ where: { id: reference.id } });
    }
  });

  it('deletes a bank no cheque uses, freeing its name and code', async () => {
    const created = await request(app.getHttpServer())
      .post(`${API}/banks`)
      .set(as(ownerA))
      .send({ name: 'Short Lived Bank', code: 'SHORT1' })
      .expect(201);

    await request(app.getHttpServer())
      .delete(`${API}/banks/${created.body.id}`)
      .set(as(ownerA))
      .expect(204);

    const manage = await request(app.getHttpServer())
      .get(`${API}/banks/manage`)
      .set(as(ownerA))
      .expect(200);
    expect(manage.body.map((bank: { id: string }) => bank.id)).not.toContain(created.body.id);

    // Soft: the row and its audit stay, so the history still has it.
    const row = await prisma.db.bank.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(row.deletedAt).not.toBeNull();
    expect(
      await prisma.db.auditLog.count({
        where: { action: 'bank.deleted', entityId: created.body.id },
      }),
    ).toBe(1);

    await request(app.getHttpServer())
      .post(`${API}/banks`)
      .set(as(ownerA))
      .send({ name: 'Short Lived Bank', code: 'SHORT1' })
      .expect(201);
  });

  it('refuses to delete a bank with cheques, or a reference bank', async () => {
    const response = await request(app.getHttpServer())
      .delete(`${API}/banks/${bankId}`)
      .set(as(ownerA))
      .expect(409);
    expect(response.body.error.details.reason).toBe('BANK_IN_USE');

    await request(app.getHttpServer())
      .delete(`${API}/banks/${orgA.bankId}`)
      .set(as(ownerA))
      .expect(403);
    await request(app.getHttpServer()).delete(`${API}/banks/${bankId}`).set(as(ownerB)).expect(404);
  });
});
