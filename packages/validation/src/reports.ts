import { z } from 'zod';

import { isoDateSchema, uuidSchema } from './primitives.js';

/**
 * Optional due-date window for the dashboard.
 *
 * It scopes which cheques the figures describe; the buckets themselves keep
 * their own meaning inside that window.
 */
export const dashboardQuerySchema = z.object({
  dueFrom: isoDateSchema.optional(),
  dueTo: isoDateSchema.optional(),
});
export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;

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

/**
 * The day's deposit run: which cheques to take to which bank.
 *
 * `on` defaults to today on the server. `throughDate` is deliberate — a cheque
 * that came due last week and is still in the safe belongs on today's run just
 * as much as one due today, and leaving it out is how a cheque quietly ages.
 */
export const depositSlipQuerySchema = z.object({
  on: isoDateSchema.optional(),
  branchId: uuidSchema.optional(),
  /** Restrict the run to one bank, for a trip that only visits that branch. */
  bankId: uuidSchema.optional(),
});
export type DepositSlipQuery = z.infer<typeof depositSlipQuerySchema>;
