import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '@prisma/client';

export interface CreatePrismaClientOptions {
  /** PostgreSQL connection string. */
  databaseUrl: string;
  /** Emit query logs; keep this off in production (queries may contain PII). */
  logQueries?: boolean;
  /** Maximum pool size for the underlying node-postgres pool. */
  maxConnections?: number;
}

/**
 * Builds a PrismaClient bound to the node-postgres driver adapter.
 *
 * Prisma 7 requires an explicit adapter, which also lets tests point at a
 * throw-away database without touching global configuration.
 */
export function createPrismaClient(options: CreatePrismaClientOptions): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: options.databaseUrl,
    max: options.maxConnections ?? 10,
  });

  return new PrismaClient({
    adapter,
    log: options.logQueries ? ['query', 'warn', 'error'] : ['warn', 'error'],
  });
}

/** Postgres unique-constraint violation. */
export const PG_UNIQUE_VIOLATION = 'P2002';
/** Prisma "record not found" error code. */
export const PG_RECORD_NOT_FOUND = 'P2025';

export function isPrismaKnownError(
  error: unknown,
  code?: string,
): error is Prisma.PrismaClientKnownRequestError {
  const isKnown = error instanceof Prisma.PrismaClientKnownRequestError;
  return code ? isKnown && error.code === code : isKnown;
}
