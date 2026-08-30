import { Injectable, Logger } from '@nestjs/common';

import { moneyToString } from '@cheque-flow/database';

import type { RequestUser } from '../../common/types/request-user';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditAction, AuditService, type AuditContext } from '../audit/audit.service';

/**
 * Format version of the archive.
 *
 * Written into every file so a restore can refuse an archive it does not
 * understand rather than importing it wrongly.
 */
export const BACKUP_FORMAT = 1;

export interface BackupFile {
  format: number;
  exportedAt: string;
  organization: { id: string; name: string; country: string; defaultCurrency: string };
  counts: Record<string, number>;
  data: Record<string, unknown[]>;
}

/**
 * A complete, readable copy of one organization's records.
 *
 * JSON rather than a database dump on purpose: a dump is only restorable into
 * the same PostgreSQL version by someone with shell access, whereas this can be
 * read, checked and, if it ever comes to it, salvaged by hand. The people who
 * need a backup most are the ones least able to run `pg_restore`.
 *
 * What is deliberately NOT included:
 *  - password hashes and refresh tokens — a backup is copied around and
 *    emailed, and it must not carry the means to sign in as anyone;
 *  - cheque images — they live in object storage and would turn a readable
 *    file into hundreds of megabytes of base64.
 */
@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async export(user: RequestUser, auditMeta: Partial<AuditContext> = {}): Promise<BackupFile> {
    const organizationId = user.organizationId;
    const db = this.prisma.db;

    const organization = await db.organization.findUniqueOrThrow({
      where: { id: organizationId },
    });

    const [branches, locations, contacts, banks, cheques, events, reminders, users] =
      await Promise.all([
        db.branch.findMany({ where: { organizationId } }),
        db.location.findMany({ where: { organizationId } }),
        db.contact.findMany({ where: { organizationId } }),
        db.bank.findMany(),
        db.cheque.findMany({ where: { organizationId } }),
        db.chequeEvent.findMany({ where: { cheque: { organizationId } } }),
        db.reminder.findMany({ where: { cheque: { organizationId } } }),
        db.user.findMany({
          where: { organizationId },
          // Never the password hash: see the note on this class.
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            status: true,
            branchId: true,
            createdAt: true,
          },
        }),
      ]);

    /** Decimal columns become strings so no amount passes through a float. */
    const serialiseCheque = (cheque: (typeof cheques)[number]) => ({
      ...cheque,
      amount: moneyToString(cheque.amount),
      bounceFee: cheque.bounceFee === null ? null : moneyToString(cheque.bounceFee),
      ocrOverallConfidence:
        cheque.ocrOverallConfidence === null ? null : String(cheque.ocrOverallConfidence),
      // The account number stays encrypted exactly as stored. A backup that
      // decrypted it would be a plaintext list of bank accounts.
    });

    const data = {
      branches,
      locations,
      contacts,
      banks,
      users,
      cheques: cheques.map(serialiseCheque),
      chequeEvents: events,
      reminders,
    };

    const counts = Object.fromEntries(
      Object.entries(data).map(([key, rows]) => [key, rows.length]),
    );

    await this.audit.record({
      organizationId,
      userId: user.id,
      action: AuditAction.BACKUP_EXPORTED,
      entityType: 'organization',
      entityId: organizationId,
      after: counts,
      ipAddress: auditMeta.ipAddress ?? null,
      deviceInfo: auditMeta.deviceInfo ?? null,
    });

    this.logger.log(`Exported a backup of ${organization.name}: ${JSON.stringify(counts)}`);

    return {
      format: BACKUP_FORMAT,
      exportedAt: new Date().toISOString(),
      organization: {
        id: organization.id,
        name: organization.name,
        country: organization.country,
        defaultCurrency: organization.defaultCurrency,
      },
      counts,
      data,
    };
  }
}
