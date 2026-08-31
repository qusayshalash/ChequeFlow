import { randomUUID } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';

import { ApiErrorCode } from '@cheque-flow/shared-types';
import { moneyToString } from '@cheque-flow/database';
import type { RestoreBackupInput } from '@cheque-flow/validation';

import { AppError } from '../../common/errors/app-error';
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

/** What a restore put back, and what it could not. */
export interface RestoreResult {
  restored: Record<string, number>;
  /**
   * Users in the archive that were not recreated, because the id or the email
   * is already taken. Cheques that referenced them keep the cheque and lose
   * the name.
   */
  skippedUsers: number;
  /**
   * Always true, and said out loud: the archive carries no password hashes by
   * design, so every restored user has to be given a password again before
   * they can sign in.
   */
  usersNeedPasswords: boolean;
}

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

  /**
   * Puts an archive back into an empty organization.
   *
   * A backup you cannot restore is not a backup, and until now this system
   * only had the first half.
   *
   * Three decisions worth knowing about:
   *
   *  - It refuses unless the target organization is empty. There is no merge
   *    and no overwrite: `cheque_events` and `audit_logs` cannot be deleted (a
   *    database trigger forbids it), so a restore over live data could only
   *    ever add a second copy of everything.
   *
   *  - Every row gets a new id. Preserving the originals would be tidier, but
   *    it fails the moment the archive is restored into a database that still
   *    holds the organization it came from — copying a live organization onto
   *    a staging server, or restoring a second copy for comparison. Rewriting
   *    the ids makes the restore work in every case rather than most.
   *
   *  - It is all-or-nothing. A half-restored organization looks like a working
   *    one, which is the worst possible outcome of a disaster recovery.
   *
   * What the archive cannot bring back, and what the caller is told: passwords
   * (never exported, so restored users must be given one again), roles, and
   * cheque images, which live in object storage.
   */
  async restore(
    user: RequestUser,
    input: RestoreBackupInput,
    auditMeta: Partial<AuditContext> = {},
  ): Promise<RestoreResult> {
    const organizationId = user.organizationId;
    const db = this.prisma.db;
    const { archive } = input;

    if (archive.format !== BACKUP_FORMAT) {
      throw new AppError(
        ApiErrorCode.VALIDATION_ERROR,
        `Unsupported archive format ${archive.format}`,
        { details: { expected: BACKUP_FORMAT, found: archive.format } },
      );
    }

    // "Empty" is judged on the records a restore would collide with, not on
    // the user accounts — the person doing the restore has to exist to do it.
    const [cheques, contacts, locations, branches] = await Promise.all([
      db.cheque.count({ where: { organizationId } }),
      db.contact.count({ where: { organizationId } }),
      db.location.count({ where: { organizationId } }),
      db.branch.count({ where: { organizationId } }),
    ]);

    if (cheques + contacts + locations + branches > 0) {
      throw new AppError(ApiErrorCode.CONFLICT, 'Restore requires an empty organization', {
        details: { reason: 'ORGANIZATION_NOT_EMPTY', cheques, contacts, locations, branches },
      });
    }

    const rows = (key: keyof typeof archive.data): Array<Record<string, unknown>> =>
      archive.data[key];

    /** Old id → new id, one map per table, built before anything is written. */
    const idMap = (source: Array<Record<string, unknown>>): Map<string, string> =>
      new Map(
        source.flatMap((row) =>
          typeof row.id === 'string' ? [[row.id, randomUUID()] as [string, string]] : [],
        ),
      );

    const branchIds = idMap(rows('branches'));
    const locationIds = idMap(rows('locations'));
    const contactIds = idMap(rows('contacts'));
    const chequeIds = idMap(rows('cheques'));

    // A user whose email is already in use cannot be recreated — the caller's
    // own account is usually one of them. Their cheques survive; only the name
    // attached to them is lost.
    const takenEmails = new Set(
      (await db.user.findMany({ select: { email: true } })).map((row) => row.email),
    );
    const restorableUsers = rows('users').filter(
      (row) => typeof row.email === 'string' && !takenEmails.has(row.email),
    );
    const userIds = idMap(restorableUsers);

    /** Looks a reference up, and drops it when the target was not restored. */
    const ref = (map: Map<string, string>, value: unknown): string | null =>
      typeof value === 'string' ? (map.get(value) ?? null) : null;

    const restored = await db.$transaction(async (tx) => {
      // Organization details come from the archive; its id does not.
      await tx.organization.update({
        where: { id: organizationId },
        data: {
          name: archive.organization.name,
          country: archive.organization.country,
          defaultCurrency: archive.organization.defaultCurrency,
        },
      });

      // Banks are shared reference data rather than organization records, so
      // they keep their ids and existing rows are left alone.
      const banks = rows('banks');
      if (banks.length > 0) {
        await tx.bank.createMany({ data: banks as never, skipDuplicates: true });
      }

      const branchRows = await tx.branch.createMany({
        data: rows('branches').map((row) => ({
          ...row,
          id: branchIds.get(row.id as string)!,
          organizationId,
        })) as never,
      });

      const locationRows = await tx.location.createMany({
        data: rows('locations').map((row) => ({
          ...row,
          id: locationIds.get(row.id as string)!,
          organizationId,
          branchId: ref(branchIds, row.branchId),
        })) as never,
      });

      const contactRows = await tx.contact.createMany({
        data: rows('contacts').map((row) => ({
          ...row,
          id: contactIds.get(row.id as string)!,
          organizationId,
        })) as never,
      });

      // After branches: a user can belong to one, and the row would be
      // rejected if the branch did not exist yet.
      const users = await tx.user.createMany({
        data: restorableUsers.map((row) => ({
          id: userIds.get(row.id as string)!,
          organizationId,
          branchId: ref(branchIds, row.branchId),
          // The archive is JSON from outside this process, so a field that
          // should be text may be anything; anything that is not becomes blank
          // rather than the string "[object Object]".
          name: typeof row.name === 'string' ? row.name : '',
          email: String(row.email),
          phone: (row.phone as string | null) ?? null,
          // No password in the archive by design, so a restore is not a way to
          // obtain a working account.
          passwordHash: '',
          status: 'INVITED' as const,
        })),
      });

      const chequeRows = await tx.cheque.createMany({
        data: rows('cheques').map((row) => ({
          ...row,
          id: chequeIds.get(row.id as string)!,
          organizationId,
          branchId: ref(branchIds, row.branchId),
          originalSourceId: ref(contactIds, row.originalSourceId),
          currentRecipientId: ref(contactIds, row.currentRecipientId),
          currentLocationId: ref(locationIds, row.currentLocationId),
          currentHolderId: ref(userIds, row.currentHolderId),
          createdBy: ref(userIds, row.createdBy),
          reviewedBy: ref(userIds, row.reviewedBy),
        })) as never,
      });

      // The ledger is inserted, never updated — which the append-only trigger
      // allows, and which is why a restore has to target an empty organization.
      const eventRows = await tx.chequeEvent.createMany({
        data: rows('chequeEvents').flatMap((row) => {
          const chequeId = ref(chequeIds, row.chequeId);
          // An event whose cheque did not come back has nothing to attach to.
          if (!chequeId) return [];
          return [
            {
              ...row,
              id: randomUUID(),
              chequeId,
              fromContactId: ref(contactIds, row.fromContactId),
              toContactId: ref(contactIds, row.toContactId),
              fromLocationId: ref(locationIds, row.fromLocationId),
              toLocationId: ref(locationIds, row.toLocationId),
              fromUserId: ref(userIds, row.fromUserId),
              toUserId: ref(userIds, row.toUserId),
              performedBy: ref(userIds, row.performedBy),
              approvedBy: ref(userIds, row.approvedBy),
              // Images are not in the archive, so a proof attachment has
              // nothing to point at.
              proofAttachmentId: null,
            },
          ];
        }) as never,
      });

      const reminderRows = await tx.reminder.createMany({
        data: rows('reminders').flatMap((row) => {
          const chequeId = ref(chequeIds, row.chequeId);
          if (!chequeId) return [];
          return [
            {
              ...row,
              id: randomUUID(),
              chequeId,
              recipientUserId: ref(userIds, row.recipientUserId),
            },
          ];
        }) as never,
      });

      const counts = {
        users: users.count,
        branches: branchRows.count,
        locations: locationRows.count,
        contacts: contactRows.count,
        cheques: chequeRows.count,
        chequeEvents: eventRows.count,
        reminders: reminderRows.count,
      };

      await this.audit.recordWithin(tx, {
        organizationId,
        userId: user.id,
        action: AuditAction.BACKUP_RESTORED,
        entityType: 'organization',
        entityId: organizationId,
        after: { ...counts, exportedAt: archive.exportedAt },
        ipAddress: auditMeta.ipAddress ?? null,
        deviceInfo: auditMeta.deviceInfo ?? null,
      });

      return counts;
    });

    this.logger.log(`Restored a backup into ${organizationId}: ${JSON.stringify(restored)}`);

    return {
      restored,
      skippedUsers: rows('users').length - restorableUsers.length,
      usersNeedPasswords: restored.users > 0,
    };
  }
}
