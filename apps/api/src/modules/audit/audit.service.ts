import { Injectable, Logger } from '@nestjs/common';
import type { Request } from 'express';

import { Prisma } from '@cheque-flow/database';

import { PrismaService } from '../../prisma/prisma.service';

/** Actions recorded in the audit trail. */
export const AuditAction = {
  LOGIN_SUCCESS: 'auth.login.success',
  LOGIN_FAILED: 'auth.login.failed',
  LOGOUT: 'auth.logout',
  TOKEN_REFRESH: 'auth.token.refresh',
  TOKEN_REUSE_DETECTED: 'auth.token.reuse_detected',
  CHEQUE_CREATED: 'cheque.created',
  CHEQUE_UPDATED: 'cheque.updated',
  CHEQUE_AMOUNT_CHANGED: 'cheque.amount_changed',
  CHEQUE_DATE_CHANGED: 'cheque.date_changed',
  CHEQUE_ACTION: 'cheque.action',
  CHEQUE_REVIEWED: 'cheque.reviewed',
  CHEQUE_IMAGE_UPLOADED: 'cheque.image.uploaded',
  CHEQUE_IMAGE_VIEWED: 'cheque.image.viewed',
  CHEQUE_EXPORTED: 'cheque.exported',
  BACKUP_EXPORTED: 'backup.exported',
  BACKUP_RESTORED: 'backup.restored',
  CONTACT_CREATED: 'contact.created',
  CONTACT_UPDATED: 'contact.updated',
  CONTACT_DELETED: 'contact.deleted',
  CONTACT_MERGED: 'contact.merged',
  USER_CREATED: 'user.created',
  USER_UPDATED: 'user.updated',
  USER_STATUS_CHANGED: 'user.status.changed',
  ROLE_CHANGED: 'user.role.changed',
  SETTINGS_CHANGED: 'settings.changed',
} as const;
export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];

export interface AuditContext {
  organizationId: string;
  userId?: string | null;
  ipAddress?: string | null;
  deviceInfo?: string | null;
}

export interface AuditEntry extends AuditContext {
  /** A value from {@link AuditAction}, or a module-specific action key. */
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
}

/** Keys never written to the audit trail, even when part of a changed record. */
const REDACTED_KEYS = new Set([
  'password',
  'passwordHash',
  'accountNumber',
  'accountNumberEncrypted',
  'ibanEncrypted',
  'refreshToken',
  'accessToken',
  'tokenHash',
]);

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Extracts the request metadata worth auditing (never headers wholesale). */
  static contextFromRequest(request: Request): Pick<AuditContext, 'ipAddress' | 'deviceInfo'> {
    return {
      ipAddress: request.ip ?? null,
      deviceInfo: request.header('user-agent')?.slice(0, 255) ?? null,
    };
  }

  /**
   * Writes an audit row. Auditing must never break the business operation, so
   * failures are logged and swallowed — except inside an explicit transaction,
   * where {@link recordWithin} is used instead.
   */
  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.db.auditLog.create({ data: this.toCreateInput(entry) });
    } catch (error) {
      this.logger.error(
        `Failed to write audit log for ${entry.action} on ${entry.entityType}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  /** Writes an audit row inside a caller-provided transaction. */
  async recordWithin(tx: Prisma.TransactionClient, entry: AuditEntry): Promise<void> {
    await tx.auditLog.create({ data: this.toCreateInput(entry) });
  }

  private toCreateInput(entry: AuditEntry): Prisma.AuditLogUncheckedCreateInput {
    return {
      organizationId: entry.organizationId,
      userId: entry.userId ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      beforeJson: AuditService.sanitize(entry.before),
      afterJson: AuditService.sanitize(entry.after),
      ipAddress: entry.ipAddress ?? null,
      deviceInfo: entry.deviceInfo ?? null,
    };
  }

  /** Recursively strips secrets and unserializable values. */
  static sanitize(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
    if (value === undefined || value === null) return Prisma.JsonNull;
    return AuditService.sanitizeValue(value) as Prisma.InputJsonValue;
  }

  private static sanitizeValue(value: unknown): unknown {
    if (value === null || value === undefined) return null;
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'bigint') return value.toString();
    if (typeof value === 'object') {
      if (typeof (value as { toFixed?: unknown }).toFixed === 'function') {
        // Prisma.Decimal — keep full precision by using its own serializer.
        return (value as { toFixed: (places?: number) => string }).toFixed();
      }
      if (Array.isArray(value)) return value.map((item) => AuditService.sanitizeValue(item));
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([key, item]) => [
          key,
          REDACTED_KEYS.has(key) ? '[redacted]' : AuditService.sanitizeValue(item),
        ]),
      );
    }
    return value;
  }
}
