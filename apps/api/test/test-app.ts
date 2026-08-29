/**
 * Boots the real Nest application against a throw-away database.
 *
 * Every e2e suite calls {@link createTestApp}; when `TEST_DATABASE_URL` is not
 * set the suites skip themselves so `pnpm test` works without infrastructure.
 */
import { VersioningType, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { PrismaService } from '../src/prisma/prisma.service';

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
export const hasDatabase = Boolean(TEST_DATABASE_URL);

/** `describe` that turns into `describe.skip` without a database. */
export const describeWithDb: jest.Describe = hasDatabase ? describe : describe.skip;

export interface TestContext {
  app: INestApplication;
  prisma: PrismaService;
}

export async function createTestApp(): Promise<TestContext> {
  // The environment itself is prepared by test/setup-env.ts, which runs
  // before AppModule is imported.
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();

  return { app, prisma: app.get(PrismaService) };
}

export const API = '/api/v1';
