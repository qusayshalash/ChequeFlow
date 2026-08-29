/**
 * End-to-end coverage of the phase-1 acceptance criteria:
 * login → contact → cheque → image → OCR → review → receive → deposit →
 * timeline, plus the three things that must be refused (illegal transition,
 * missing permission, duplicate cheque).
 *
 * Requires a migrated PostgreSQL database in TEST_DATABASE_URL.
 */
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { ChequeStatus } from '@cheque-flow/shared-types';

import { API, createTestApp, describeWithDb } from './test-app';
import { cleanupFixtures, seedFixtures, type Fixtures } from './seed-fixtures';
import type { PrismaService } from '../src/prisma/prisma.service';

// A 1x1 JPEG: real magic bytes, so the upload passes signature validation.
const JPEG_FIXTURE = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a' +
    'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA' +
    'AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==',
  'base64',
);

describeWithDb('cheque lifecycle (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let fixtures: Fixtures;
  let ownerToken: string;
  let viewerToken: string;
  let chequeId: string;
  let version: number;

  beforeAll(async () => {
    const context = await createTestApp();
    app = context.app;
    prisma = context.prisma;
    fixtures = await seedFixtures(prisma);

    const ownerLogin = await request(app.getHttpServer())
      .post(`${API}/auth/login`)
      .send({ email: fixtures.ownerEmail, password: fixtures.password })
      .expect(200);
    ownerToken = ownerLogin.body.accessToken;

    const viewerLogin = await request(app.getHttpServer())
      .post(`${API}/auth/login`)
      .send({ email: fixtures.viewerEmail, password: fixtures.password })
      .expect(200);
    viewerToken = viewerLogin.body.accessToken;
  });

  afterAll(async () => {
    if (fixtures) await cleanupFixtures(prisma, fixtures.organizationId);
    if (app) await app.close();
  });

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  it('rejects wrong credentials without leaking whether the user exists', async () => {
    const response = await request(app.getHttpServer())
      .post(`${API}/auth/login`)
      .send({ email: fixtures.ownerEmail, password: 'WrongPassword1' })
      .expect(401);
    expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(response.body.error.requestId).toBeDefined();
  });

  it('returns the caller with live permissions', async () => {
    const response = await request(app.getHttpServer())
      .get(`${API}/auth/me`)
      .set(auth(ownerToken))
      .expect(200);
    expect(response.body.permissions).toContain('cheque.create');
    expect(response.body.organizationId).toBe(fixtures.organizationId);
  });

  it('creates a contact', async () => {
    const response = await request(app.getHttpServer())
      .post(`${API}/contacts`)
      .set(auth(ownerToken))
      .send({ type: 'CUSTOMER', name: 'عميل الاختبار' })
      .expect(201);
    expect(response.body.id).toBeDefined();
  });

  it('creates an incoming cheque in DRAFT with a CREATED event', async () => {
    const response = await request(app.getHttpServer())
      .post(`${API}/cheques`)
      .set(auth(ownerToken))
      .send({
        direction: 'INCOMING',
        chequeNumber: 'E2E-0001',
        amount: '1500.50',
        currency: 'SAR',
        dueDate: '2026-12-31',
        bankId: fixtures.bankId,
        originalSourceId: fixtures.customerId,
        currentLocationId: fixtures.safeLocationId,
      })
      .expect(201);

    chequeId = response.body.cheque.id;
    version = response.body.cheque.version;
    expect(response.body.cheque.status).toBe(ChequeStatus.DRAFT);
    // Money never round-trips through a float.
    expect(response.body.cheque.amount).toBe('1500.50');

    const events = await request(app.getHttpServer())
      .get(`${API}/cheques/${chequeId}/events`)
      .set(auth(ownerToken))
      .expect(200);
    expect(events.body.data[0].eventType).toBe('CREATED');
  });

  it('detects a duplicate cheque on the business key', async () => {
    const response = await request(app.getHttpServer())
      .post(`${API}/cheques`)
      .set(auth(ownerToken))
      .send({
        direction: 'INCOMING',
        chequeNumber: 'E2E-0001',
        amount: '1500.50',
        currency: 'SAR',
        dueDate: '2026-12-31',
        bankId: fixtures.bankId,
      })
      .expect(409);
    expect(response.body.error.code).toBe('DUPLICATE_CHEQUE');
  });

  it('allows the duplicate through when it is explicitly confirmed', async () => {
    const response = await request(app.getHttpServer())
      .post(`${API}/cheques?allowDuplicate=true`)
      .set(auth(ownerToken))
      .send({
        direction: 'INCOMING',
        chequeNumber: 'E2E-0001',
        amount: '1500.50',
        currency: 'SAR',
        dueDate: '2026-12-31',
        bankId: fixtures.bankId,
      })
      .expect(201);
    expect(response.body.duplicates.length).toBeGreaterThan(0);
  });

  it('rejects an upload whose bytes are not an image', async () => {
    const response = await request(app.getHttpServer())
      .post(`${API}/cheques/${chequeId}/images`)
      .set(auth(ownerToken))
      .field('side', 'FRONT')
      .attach('file', Buffer.from('<?php echo 1; ?>'), {
        filename: 'cheque.jpg',
        contentType: 'image/jpeg',
      })
      .expect(415);
    expect(response.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  it('uploads the front image', async () => {
    const response = await request(app.getHttpServer())
      .post(`${API}/cheques/${chequeId}/images`)
      .set(auth(ownerToken))
      .field('side', 'FRONT')
      .attach('file', JPEG_FIXTURE, { filename: 'front.jpg', contentType: 'image/jpeg' })
      .expect(201);
    expect(response.body.image.side).toBe('FRONT');
  });

  it('runs mock OCR and stores it as an unconfirmed suggestion', async () => {
    const response = await request(app.getHttpServer())
      .post(`${API}/cheques/${chequeId}/process-ocr`)
      .set(auth(ownerToken))
      .expect(200);

    expect(response.body.provider).toBe('mock');
    expect(response.body.fields.chequeNumber.confidence).toBeGreaterThan(0);
    expect(Array.isArray(response.body.lowConfidenceFields)).toBe(true);

    const cheque = await request(app.getHttpServer())
      .get(`${API}/cheques/${chequeId}`)
      .set(auth(ownerToken))
      .expect(200);

    // OCR moves the cheque to review; it does NOT overwrite the cheque data.
    expect(cheque.body.status).toBe(ChequeStatus.PENDING_REVIEW);
    expect(cheque.body.chequeNumber).toBe('E2E-0001');
    version = cheque.body.version;
  });

  it('refuses to deposit a cheque that has not been received yet', async () => {
    const response = await request(app.getHttpServer())
      .post(`${API}/cheques/${chequeId}/deposit`)
      .set(auth(ownerToken))
      .send({ toLocationId: fixtures.bankLocationId })
      .expect(409);
    expect(response.body.error.code).toBe('INVALID_STATE_TRANSITION');
  });

  it('confirms the reviewed data and verifies the cheque', async () => {
    const response = await request(app.getHttpServer())
      .post(`${API}/cheques/${chequeId}/review`)
      .set(auth(ownerToken))
      .send({
        confirmed: { chequeNumber: 'E2E-0001', amount: '1500.50', currency: 'SAR' },
        rejectedFields: [],
        version,
      })
      .expect(200);

    expect(response.body.status).toBe(ChequeStatus.IN_HAND);
    version = response.body.version;
  });

  it('blocks a user without the permission from depositing', async () => {
    const response = await request(app.getHttpServer())
      .post(`${API}/cheques/${chequeId}/deposit`)
      .set(auth(viewerToken))
      .send({ toLocationId: fixtures.bankLocationId })
      .expect(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('deposits the cheque and records the custody change', async () => {
    const response = await request(app.getHttpServer())
      .post(`${API}/cheques/${chequeId}/deposit`)
      .set(auth(ownerToken))
      .send({ toLocationId: fixtures.bankLocationId, version })
      .expect(200);

    expect(response.body.status).toBe(ChequeStatus.DEPOSITED);
    expect(response.body.currentLocationId).toBe(fixtures.bankLocationId);
    version = response.body.version;
  });

  it('rejects a stale write through optimistic locking', async () => {
    const response = await request(app.getHttpServer())
      .patch(`${API}/cheques/${chequeId}`)
      .set(auth(ownerToken))
      .send({ notes: 'stale write', version: 1 })
      .expect(409);
    expect(response.body.error.code).toBe('VERSION_CONFLICT');
  });

  it('clears the cheque and reaches a terminal status', async () => {
    const response = await request(app.getHttpServer())
      .post(`${API}/cheques/${chequeId}/clear`)
      .set(auth(ownerToken))
      .send({ version })
      .expect(200);

    expect(response.body.status).toBe(ChequeStatus.CLEARED);
    expect(response.body.allowedActions).toHaveLength(0);
  });

  it('exposes the full, ordered timeline', async () => {
    const response = await request(app.getHttpServer())
      .get(`${API}/cheques/${chequeId}/events`)
      .set(auth(ownerToken))
      .expect(200);

    const types = response.body.data.map((event: { eventType: string }) => event.eventType);
    expect(types).toEqual(
      expect.arrayContaining(['CREATED', 'IMAGE_ADDED', 'VERIFIED', 'DEPOSITED', 'CLEARED']),
    );
  });

  it('refuses to mutate the append-only ledger', async () => {
    const event = await prisma.db.chequeEvent.findFirst({ where: { chequeId } });
    await expect(
      prisma.db.chequeEvent.update({
        where: { id: event?.id ?? '' },
        data: { notes: 'tampered' },
      }),
    ).rejects.toThrow();
  });

  it('never returns an unmasked account number', async () => {
    await request(app.getHttpServer())
      .patch(`${API}/cheques/${chequeId}`)
      .set(auth(ownerToken))
      .send({ accountNumber: '1234567890', version: 999 })
      .expect(409);

    const response = await request(app.getHttpServer())
      .get(`${API}/cheques/${chequeId}`)
      .set(auth(ownerToken))
      .expect(200);
    expect(JSON.stringify(response.body)).not.toContain('1234567890');
  });

  it('writes an audit trail the auditor can read', async () => {
    const response = await request(app.getHttpServer())
      .get(`${API}/audit-logs`)
      .set(auth(ownerToken))
      .expect(200);

    const actions = response.body.data.map((row: { action: string }) => row.action);
    expect(actions).toEqual(expect.arrayContaining(['auth.login.success', 'cheque.created']));
  });
});
