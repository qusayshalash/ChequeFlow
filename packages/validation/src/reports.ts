import { z } from 'zod';

import { isoDateSchema, uuidSchema } from './primitives.js';

export const dueReportQuerySchema = z.object({
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  /** Convenience window in days when `from`/`to` are not supplied. */
  withinDays: z.coerce.number().int().min(0).max(365).optional(),
  branchId: uuidSchema.optional(),
  includeOverdue: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
});
export type DueReportQuery = z.infer<typeof dueReportQuerySchema>;

export const cashFlowReportQuerySchema = z.object({
  from: isoDateSchema,
  to: isoDateSchema,
  granularity: z.enum(['day', 'week', 'month']).default('week'),
  branchId: uuidSchema.optional(),
});
export type CashFlowReportQuery = z.infer<typeof cashFlowReportQuerySchema>;

export const custodyReportQuerySchema = z.object({
  branchId: uuidSchema.optional(),
  locationId: uuidSchema.optional(),
  holderId: uuidSchema.optional(),
});
export type CustodyReportQuery = z.infer<typeof custodyReportQuerySchema>;

export const auditLogQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  userId: uuidSchema.optional(),
  entityType: z.string().trim().max(50).optional(),
  entityId: z.string().trim().max(64).optional(),
  action: z.string().trim().max(80).optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
});
export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;
