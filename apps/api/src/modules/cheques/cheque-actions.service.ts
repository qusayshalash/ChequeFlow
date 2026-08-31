import { Injectable, Logger } from '@nestjs/common';

import {
  ApiErrorCode,
  ChequeAction,
  assertTransition,
  utcToday,
  type ChequeDetailView,
  type ChequeEventView,
  type ChequeSummaryView,
  type TransitionDefinition,
} from '@cheque-flow/shared-types';
import { Prisma, toMoney, type Cheque } from '@cheque-flow/database';

import { AppError } from '../../common/errors/app-error';
import { FieldEncryptionService } from '../../common/crypto/field-encryption.service';
import type { RequestUser } from '../../common/types/request-user';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditAction, AuditService, type AuditContext } from '../audit/audit.service';
import { RemindersService } from '../reminders/reminders.service';
import {
  chequeDetailInclude,
  chequeEventInclude,
  chequeSummarySelect,
  toChequeDetail,
  toChequeEventView,
  toChequeSummary,
} from './cheque.mapper';
import { toDateOnly } from './cheque.service';

/** Everything an action may change, besides the status itself. */
export interface ChequeActionPayload {
  notes?: string | undefined;
  eventDate?: string | undefined;
  approvedBy?: string | undefined;
  version?: number | undefined;
  fromContactId?: string | undefined;
  toContactId?: string | undefined;
  toUserId?: string | undefined;
  toLocationId?: string | undefined;
  proofAttachmentId?: string | undefined;
  /** Applied to `receivedDate` / `dueDate` depending on the action. */
  effectiveDate?: string | undefined;
  reason?: string | undefined;
  /** Bank charge, currently only meaningful for BOUNCE. */
  fee?: string | undefined;
}

/** A cheque a bulk action could not be applied to, and the reason why. */
export interface BulkActionSkip {
  chequeId: string;
  chequeNumber: string;
  /** A message key, so the reason reaches the user in their own language. */
  reason: string;
}

export interface BulkActionResult {
  /** `BLOCKED` means nothing was written — `skipped` says which cheque stopped it. */
  status: 'APPLIED' | 'BLOCKED';
  applied: ChequeSummaryView[];
  skipped: BulkActionSkip[];
}

/**
 * Whether any transition in the run needs a counterparty the payload lacks.
 *
 * Checked once for the whole selection rather than per cheque: one action and
 * one payload apply to all of them, so a missing counterparty is a fault in
 * the request, not in any particular cheque.
 */
function transitionNeedsCounterparty(
  runnable: ReadonlyArray<{ transition: TransitionDefinition }>,
  payload: ChequeActionPayload,
): boolean {
  const hasCounterparty =
    payload.toContactId ?? payload.fromContactId ?? payload.toLocationId ?? payload.toUserId;
  if (hasCounterparty) return false;
  return runnable.some((entry) => entry.transition.requiresCounterparty);
}

/**
 * The only component in the system allowed to change `cheques.status`.
 *
 * Every action validates the transition through the shared state machine,
 * writes the new status, the custody columns and the `cheque_events` row in a
 * single database transaction, and records an audit entry.
 */
@Injectable()
export class ChequeActionsService {
  private readonly logger = new Logger(ChequeActionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly encryption: FieldEncryptionService,
    private readonly reminders: RemindersService,
  ) {}

  async execute(
    user: RequestUser,
    chequeId: string,
    action: ChequeAction,
    payload: ChequeActionPayload,
    auditMeta: Partial<AuditContext> = {},
  ): Promise<ChequeDetailView> {
    const cheque = await this.prisma.db.cheque.findFirst({
      where: { id: chequeId, organizationId: user.organizationId, deletedAt: null },
    });
    if (!cheque) throw AppError.notFound('Cheque', chequeId);

    // 1. Is the transition legal at all?
    const transition = assertTransition(cheque.status, action, cheque.direction);

    // 2. Does the caller hold the permission the transition requires?
    if (!user.permissions.includes(transition.permission)) {
      throw AppError.forbidden(`Action ${action} requires ${transition.permission}`, {
        required: transition.permission,
      });
    }

    // 3. Is the counterparty present when the transition needs one?
    if (transition.requiresCounterparty) {
      const hasCounterparty =
        payload.toContactId ?? payload.fromContactId ?? payload.toLocationId ?? payload.toUserId;
      if (!hasCounterparty) {
        throw new AppError(ApiErrorCode.VALIDATION_ERROR, `${action} requires a counterparty`, {
          fieldErrors: [{ path: 'toContactId', message: 'validation.counterparty.required' }],
        });
      }
    }

    // 4. Optimistic locking, when the client sent the version it read.
    if (payload.version !== undefined && payload.version !== cheque.version) {
      throw AppError.versionConflict(payload.version, cheque.version);
    }

    await this.assertReferencesInTenant(user.organizationId, payload);

    const updated = await this.prisma.db.$transaction(async (tx) => {
      await this.applyWithin(tx, user, cheque, transition, payload, auditMeta);
      return tx.cheque.findUniqueOrThrow({ where: { id: chequeId }, include: chequeDetailInclude });
    });

    // Reminder scheduling is a side effect: a failure here must not roll back
    // a completed custody change.
    try {
      await this.reminders.syncForCheque(updated.id);
    } catch (error) {
      this.logger.error(
        `Failed to schedule reminders for cheque ${updated.id}`,
        error instanceof Error ? error.stack : undefined,
      );
    }

    return toChequeDetail(updated, user.permissions, this.encryption);
  }

  /**
   * Applies one action to many cheques at once.
   *
   * Entering twenty cheques in a batch only solved half the day's work: those
   * twenty then have to be deposited, and doing that one screen at a time is
   * the same twenty trips through the app.
   *
   * The default is all-or-nothing. A selection where one cheque cannot take
   * the action is almost always a mistake in the selection, not an invitation
   * to silently do nineteen of them — so nothing is written and the blocked
   * cheques are named. `skipInvalid` is the deliberate override for the case
   * where the user has seen the report and wants the rest applied anyway.
   *
   * Either way the caller gets the full report: this returns 200 with
   * `status: 'BLOCKED'` rather than an error, because "nothing happened, and
   * here is exactly which cheque stopped it" is an answer, not a failure.
   */
  async executeBulk(
    user: RequestUser,
    chequeIds: readonly string[],
    action: ChequeAction,
    payload: ChequeActionPayload,
    options: { skipInvalid?: boolean } = {},
    auditMeta: Partial<AuditContext> = {},
  ): Promise<BulkActionResult> {
    const today = utcToday();

    const cheques = await this.prisma.db.cheque.findMany({
      where: { id: { in: [...chequeIds] }, organizationId: user.organizationId, deletedAt: null },
    });

    const byId = new Map(cheques.map((cheque) => [cheque.id, cheque]));
    const skipped: BulkActionSkip[] = [];
    const runnable: Array<{ cheque: (typeof cheques)[number]; transition: TransitionDefinition }> =
      [];

    for (const chequeId of chequeIds) {
      const cheque = byId.get(chequeId);
      if (!cheque) {
        // An id from another tenant is indistinguishable from one that does
        // not exist, and must stay that way.
        skipped.push({ chequeId, chequeNumber: '', reason: 'errors.NOT_FOUND' });
        continue;
      }

      let transition: TransitionDefinition;
      try {
        transition = assertTransition(cheque.status, action, cheque.direction);
      } catch {
        skipped.push({
          chequeId,
          chequeNumber: cheque.chequeNumber,
          reason: 'errors.INVALID_STATE_TRANSITION',
        });
        continue;
      }

      // A missing permission is about the caller, not about this cheque, so
      // it fails the request outright the way the single-cheque path does.
      // Reporting it as a per-row "skip" would also confirm to someone without
      // the permission that the cheque exists.
      if (!user.permissions.includes(transition.permission)) {
        throw AppError.forbidden(`Action ${action} requires ${transition.permission}`, {
          required: transition.permission,
        });
      }

      runnable.push({ cheque, transition });
    }

    if (transitionNeedsCounterparty(runnable, payload)) {
      throw new AppError(ApiErrorCode.VALIDATION_ERROR, `${action} requires a counterparty`, {
        fieldErrors: [{ path: 'toContactId', message: 'validation.counterparty.required' }],
      });
    }

    if (skipped.length > 0 && options.skipInvalid !== true) {
      return { status: 'BLOCKED', applied: [], skipped };
    }

    if (runnable.length === 0) return { status: 'BLOCKED', applied: [], skipped };

    await this.assertReferencesInTenant(user.organizationId, payload);

    const applied = await this.prisma.db.$transaction(async (tx) => {
      for (const entry of runnable) {
        await this.applyWithin(tx, user, entry.cheque, entry.transition, payload, auditMeta);
      }

      return tx.cheque.findMany({
        where: { id: { in: runnable.map((entry) => entry.cheque.id) } },
        select: chequeSummarySelect,
      });
    });

    // Reminders are a side effect: a failure here must not undo custody
    // changes that have already been committed.
    for (const entry of runnable) {
      try {
        await this.reminders.syncForCheque(entry.cheque.id);
      } catch (error) {
        this.logger.error(
          `Failed to schedule reminders for cheque ${entry.cheque.id}`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }

    return {
      status: 'APPLIED',
      applied: applied.map((cheque) => toChequeSummary(cheque, today)),
      skipped,
    };
  }

  /**
   * Writes one transition: the status, the custody columns, the ledger event
   * and the audit entry.
   *
   * Takes the transaction rather than opening one, so a bulk action can put
   * many cheques through it and still be a single all-or-nothing write. It
   * deliberately does not validate — the caller has already checked the
   * transition, the permission and the counterparty, and re-checking here
   * would let a caller skip those by not calling them.
   */
  private async applyWithin(
    tx: Prisma.TransactionClient,
    user: RequestUser,
    cheque: Pick<Cheque, 'id' | 'status' | 'version' | 'currentHolderId' | 'currentLocationId'>,
    transition: TransitionDefinition,
    payload: ChequeActionPayload,
    auditMeta: Partial<AuditContext>,
  ): Promise<void> {
    const custody = this.custodyChanges(transition, payload, user);

    const result = await tx.cheque.updateMany({
      where: { id: cheque.id, organizationId: user.organizationId, version: cheque.version },
      data: {
        status: transition.to,
        ...custody,
        version: { increment: 1 },
      },
    });
    if (result.count === 0) {
      // Someone changed the cheque between the read and the write.
      throw AppError.versionConflict(cheque.version, cheque.version + 1);
    }

    await tx.chequeEvent.create({
      data: {
        chequeId: cheque.id,
        eventType: transition.eventType,
        fromStatus: cheque.status,
        toStatus: transition.to,
        fromContactId: payload.fromContactId ?? null,
        toContactId: payload.toContactId ?? null,
        fromUserId: cheque.currentHolderId,
        toUserId: payload.toUserId ?? null,
        fromLocationId: cheque.currentLocationId,
        toLocationId: payload.toLocationId ?? null,
        eventDate: payload.eventDate ? new Date(payload.eventDate) : new Date(),
        notes: payload.notes ?? payload.reason ?? null,
        proofAttachmentId: payload.proofAttachmentId ?? null,
        performedBy: user.id,
        approvedBy: payload.approvedBy ?? null,
      },
    });

    await this.audit.recordWithin(tx, {
      organizationId: user.organizationId,
      userId: user.id,
      action: AuditAction.CHEQUE_ACTION,
      entityType: 'cheque',
      entityId: cheque.id,
      before: { status: cheque.status },
      after: { status: transition.to, action: transition.action, notes: payload.notes ?? null },
      ipAddress: auditMeta.ipAddress ?? null,
      deviceInfo: auditMeta.deviceInfo ?? null,
    });
  }

  /** Maps an action onto the custody columns it is allowed to move. */
  private custodyChanges(
    transition: TransitionDefinition,
    payload: ChequeActionPayload,
    user: RequestUser,
  ): Prisma.ChequeUncheckedUpdateInput {
    const changes: Prisma.ChequeUncheckedUpdateInput = {};

    switch (transition.action) {
      case ChequeAction.RECEIVE:
        changes.originalSourceId = payload.fromContactId ?? null;
        changes.currentHolderId = payload.toUserId ?? user.id;
        changes.currentLocationId = payload.toLocationId ?? null;
        changes.currentRecipientId = null;
        if (payload.effectiveDate) changes.receivedDate = toDateOnly(payload.effectiveDate);
        break;

      case ChequeAction.HANDOVER:
        // The cheque leaves the company: the recipient becomes the holder of
        // record and the internal holder is cleared.
        changes.currentRecipientId = payload.toContactId ?? null;
        changes.currentLocationId = payload.toLocationId ?? null;
        changes.currentHolderId = null;
        break;

      case ChequeAction.DEPOSIT:
        changes.currentLocationId = payload.toLocationId ?? null;
        changes.currentHolderId = null;
        break;

      case ChequeAction.RETURN:
        changes.currentRecipientId = payload.toContactId ?? null;
        changes.currentHolderId = payload.toUserId ?? user.id;
        if (payload.toLocationId) changes.currentLocationId = payload.toLocationId;
        break;

      case ChequeAction.BOUNCE:
        // The bank's reason and charge stay on the cheque. They survive a
        // later re-presentation, so the history of a bounced cheque is never
        // lost when it moves on to another status.
        changes.bounceReason = payload.reason ?? null;
        if (payload.fee !== undefined) changes.bounceFee = toMoney(payload.fee);
        break;

      case ChequeAction.POSTPONE:
        if (payload.effectiveDate) changes.dueDate = toDateOnly(payload.effectiveDate);
        break;

      case ChequeAction.REVIEW:
        changes.reviewedBy = user.id;
        changes.reviewedAt = new Date();
        break;

      case ChequeAction.RESERVE:
      case ChequeAction.RELEASE_RESERVATION:
      case ChequeAction.RESUME:
      case ChequeAction.RECOVER:
        if (payload.toLocationId) changes.currentLocationId = payload.toLocationId;
        if (payload.toUserId) changes.currentHolderId = payload.toUserId;
        break;

      default:
        break;
    }

    return changes;
  }

  private async assertReferencesInTenant(
    organizationId: string,
    payload: ChequeActionPayload,
  ): Promise<void> {
    const contactIds = [payload.fromContactId, payload.toContactId].filter(
      (id): id is string => typeof id === 'string',
    );
    for (const id of contactIds) {
      const contact = await this.prisma.db.contact.findFirst({
        where: { id, organizationId },
        select: { id: true },
      });
      if (!contact) throw AppError.notFound('Contact', id);
    }

    if (payload.toLocationId) {
      const location = await this.prisma.db.location.findFirst({
        where: { id: payload.toLocationId, organizationId },
        select: { id: true },
      });
      if (!location) throw AppError.notFound('Location', payload.toLocationId);
    }

    for (const userId of [payload.toUserId, payload.approvedBy].filter(
      (id): id is string => typeof id === 'string',
    )) {
      const member = await this.prisma.db.user.findFirst({
        where: { id: userId, organizationId },
        select: { id: true },
      });
      if (!member) throw AppError.notFound('User', userId);
    }
  }

  /** Timeline for a cheque; events are read-only by construction. */
  async listEvents(user: RequestUser, chequeId: string): Promise<ChequeEventView[]> {
    const cheque = await this.prisma.db.cheque.findFirst({
      where: { id: chequeId, organizationId: user.organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!cheque) throw AppError.notFound('Cheque', chequeId);

    const events = await this.prisma.db.chequeEvent.findMany({
      where: { chequeId },
      include: chequeEventInclude,
      orderBy: [{ createdAt: 'asc' }],
    });
    return events.map(toChequeEventView);
  }
}
