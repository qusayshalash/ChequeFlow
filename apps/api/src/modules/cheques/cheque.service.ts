import { Injectable } from '@nestjs/common';

import {
  ApiErrorCode,
  ChequeEventType,
  ChequeStatus,
  OUTSTANDING_CHEQUE_STATUSES,
  utcToday,
  type ChequeDetailView,
  type ChequeSummaryView,
  type DuplicateChequeMatch,
  type Paginated,
} from '@cheque-flow/shared-types';
import {
  Prisma,
  convertMoney,
  moneyToString,
  rateToString,
  toMoney,
  toRate,
} from '@cheque-flow/database';
import type {
  CreateChequeBatchInput,
  CreateChequeInput,
  ListChequesQuery,
  UpdateChequeInput,
} from '@cheque-flow/validation';

import { FieldEncryptionService } from '../../common/crypto/field-encryption.service';
import { AppError } from '../../common/errors/app-error';
import type { RequestUser } from '../../common/types/request-user';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditAction, AuditService, type AuditContext } from '../audit/audit.service';
import {
  chequeDetailInclude,
  chequeSummarySelect,
  toChequeDetail,
  toChequeSummary,
} from './cheque.mapper';
import { DuplicateDetectorService } from './duplicate-detector.service';

/** The conversion columns, kept together because the database requires both or neither. */
interface Conversion {
  exchangeRate: Prisma.Decimal | null;
  amountBase: Prisma.Decimal | null;
}

/**
 * Works out what a cheque is worth in the books' currency.
 *
 * A cheque already in the base currency converts at 1 without anyone having to
 * say so — asking a user to type "1" for every shekel cheque in a shekel
 * business is a field they will eventually get wrong.
 *
 * A foreign cheque with no rate stays unconverted. The server never invents a
 * rate: today's rate applied to a cheque taken in last year is a number no
 * document supports, and it would be indistinguishable in the books from one
 * that was actually recorded.
 */
export function computeConversion(
  amount: string,
  currency: string,
  baseCurrency: string,
  rate: string | null,
): Conversion {
  if (currency === baseCurrency) {
    const one = toRate(1);
    return { exchangeRate: one, amountBase: toMoney(amount) };
  }

  if (rate === null) return { exchangeRate: null, amountBase: null };

  const parsed = toRate(rate);
  return { exchangeRate: parsed, amountBase: convertMoney(amount, parsed) };
}

/** Converts `YYYY-MM-DD` into the UTC midnight `Date` a DATE column expects. */
export function toDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export interface CreateChequeResult {
  cheque: ChequeDetailView;
  duplicates: DuplicateChequeMatch[];
}

/** A row of a batch that matched a cheque already on file. */
export interface BatchDuplicate {
  /** Position in the submitted batch, so the form can point at the right row. */
  index: number;
  chequeNumber: string;
  matches: DuplicateChequeMatch[];
}

export interface CreateChequeBatchResult {
  cheques: ChequeSummaryView[];
  duplicates: BatchDuplicate[];
}

@Injectable()
export class ChequeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly duplicates: DuplicateDetectorService,
    private readonly encryption: FieldEncryptionService,
    private readonly audit: AuditService,
  ) {}

  /**
   * The currency this organization keeps its books in.
   *
   * Read per write rather than cached on the session: it is one indexed lookup
   * by primary key, and a stale base currency would silently convert cheques
   * into the wrong books.
   */
  private async baseCurrency(organizationId: string): Promise<string> {
    const organization = await this.prisma.db.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { baseCurrency: true },
    });
    return organization.baseCurrency;
  }

  /**
   * Creates a cheque in DRAFT together with its CREATED event.
   *
   * `organizationId` comes from the session — a client-supplied value is
   * ignored by the schema and never read here.
   */
  async create(
    user: RequestUser,
    input: CreateChequeInput,
    options: { allowDuplicate?: boolean } = {},
    auditMeta: Partial<AuditContext> = {},
  ): Promise<CreateChequeResult> {
    const duplicates = await this.duplicates.findByBusinessKey({
      organizationId: user.organizationId,
      bankId: input.bankId,
      chequeNumber: input.chequeNumber,
      amount: input.amount,
      dueDate: input.dueDate,
    });
    DuplicateDetectorService.assertNoDuplicates(duplicates, options.allowDuplicate === true);

    await this.assertTenantReferences(user.organizationId, {
      branchId: input.branchId,
      contactIds: [input.originalSourceId],
      locationId: input.currentLocationId,
      bankId: input.bankId,
    });

    const conversion = computeConversion(
      input.amount,
      input.currency,
      await this.baseCurrency(user.organizationId),
      input.exchangeRate,
    );

    const created = await this.prisma.db.$transaction(async (tx) => {
      const cheque = await tx.cheque.create({
        data: {
          organizationId: user.organizationId,
          branchId: input.branchId ?? user.branchId,
          direction: input.direction,
          chequeNumber: input.chequeNumber,
          amount: toMoney(input.amount),
          amountInWords: input.amountInWords,
          currency: input.currency,
          exchangeRate: conversion.exchangeRate,
          amountBase: conversion.amountBase,
          issueDate: input.issueDate ? toDateOnly(input.issueDate) : null,
          dueDate: toDateOnly(input.dueDate),
          receivedDate: input.receivedDate ? toDateOnly(input.receivedDate) : null,
          bankId: input.bankId,
          bankNameRaw: input.bankNameRaw,
          bankBranchRaw: input.bankBranchRaw,
          accountNumberEncrypted: this.encryption.encryptNullable(input.accountNumber),
          drawerName: input.drawerName,
          originalSourceId: input.originalSourceId,
          originalPayeeName: input.originalPayeeName,
          currentLocationId: input.currentLocationId,
          currentHolderId: user.id,
          purpose: input.purpose,
          referenceNumber: input.referenceNumber,
          notes: input.notes,
          status: ChequeStatus.DRAFT,
          createdBy: user.id,
        },
        include: chequeDetailInclude,
      });

      // Every cheque starts its ledger with a CREATED event, in the same
      // transaction, so a cheque can never exist without history.
      await tx.chequeEvent.create({
        data: {
          chequeId: cheque.id,
          eventType: ChequeEventType.CREATED,
          toStatus: ChequeStatus.DRAFT,
          toLocationId: input.currentLocationId,
          toUserId: user.id,
          performedBy: user.id,
          notes: null,
        },
      });

      await this.audit.recordWithin(tx, {
        organizationId: user.organizationId,
        userId: user.id,
        action: AuditAction.CHEQUE_CREATED,
        entityType: 'cheque',
        entityId: cheque.id,
        after: {
          chequeNumber: cheque.chequeNumber,
          amount: moneyToString(cheque.amount),
          currency: cheque.currency,
          dueDate: cheque.dueDate.toISOString().slice(0, 10),
          direction: cheque.direction,
        },
        ipAddress: auditMeta.ipAddress ?? null,
        deviceInfo: auditMeta.deviceInfo ?? null,
      });

      return cheque;
    });

    return {
      cheque: toChequeDetail(created, user.permissions, this.encryption),
      duplicates,
    };
  }

  /**
   * Creates a run of serial cheques in one transaction.
   *
   * A customer settling on credit hands over a whole cheque book at once —
   * consecutive numbers, one due date a month apart, the same bank and drawer
   * throughout. Entering those one form at a time is twenty chances to mistype
   * the bank.
   *
   * The batch is all-or-nothing. Half a book recorded is worse than none: the
   * missing half is invisible until a cheque nobody knew about bounces, while a
   * failed batch is obvious and can simply be sent again.
   */
  async createBatch(
    user: RequestUser,
    input: CreateChequeBatchInput,
    options: { allowDuplicate?: boolean } = {},
    auditMeta: Partial<AuditContext> = {},
  ): Promise<CreateChequeBatchResult> {
    // Every row is checked before anything is written, so the user is told
    // about all the duplicates at once instead of discovering them one retry
    // at a time.
    const perRow = await Promise.all(
      input.cheques.map((row) =>
        this.duplicates.findByBusinessKey({
          organizationId: user.organizationId,
          bankId: input.bankId,
          chequeNumber: row.chequeNumber,
          amount: row.amount,
          dueDate: row.dueDate,
        }),
      ),
    );

    const duplicates: BatchDuplicate[] = perRow.flatMap((matches, index) =>
      matches.length === 0
        ? []
        : [{ index, chequeNumber: input.cheques[index]?.chequeNumber ?? '', matches }],
    );

    if (duplicates.length > 0 && options.allowDuplicate !== true) {
      throw new AppError(ApiErrorCode.DUPLICATE_CHEQUE, 'Duplicate cheques detected in batch', {
        // `details` carries flat scalars only, so the offending rows travel as
        // comma-separated lists rather than as objects. The client splits them
        // to highlight the rows; `duplicateRows` is the authoritative one.
        details: {
          reason: 'BUSINESS_KEY',
          duplicateRows: duplicates.map((entry) => entry.index).join(','),
          duplicateNumbers: duplicates.map((entry) => entry.chequeNumber).join(','),
          duplicateCount: duplicates.length,
        },
      });
    }

    // The shared references are checked once — they are identical for the whole
    // batch by construction.
    await this.assertTenantReferences(user.organizationId, {
      branchId: input.branchId,
      contactIds: [input.originalSourceId],
      locationId: input.currentLocationId,
      bankId: input.bankId,
    });

    const accountNumberEncrypted = this.encryption.encryptNullable(input.accountNumber);
    // One lookup for the whole book: every cheque in it shares a currency and
    // a rate, so they all convert against the same base.
    const base = await this.baseCurrency(user.organizationId);
    const today = utcToday();

    const created = await this.prisma.db.$transaction(async (tx) => {
      const rows: Array<Awaited<ReturnType<typeof this.createOneWithin>>> = [];
      for (const row of input.cheques) {
        rows.push(
          await this.createOneWithin(tx, user, input, row, accountNumberEncrypted, base, auditMeta),
        );
      }
      return rows;
    });

    return {
      cheques: created.map((cheque) => toChequeSummary(cheque, today)),
      duplicates,
    };
  }

  /**
   * Writes one cheque of a batch, with its CREATED event and audit entry.
   *
   * Split out rather than inlined so the loop above reads as "one row, then the
   * next" — and so the event and the audit entry can never be forgotten for a
   * row, which is exactly the kind of omission a loop body invites.
   */
  private async createOneWithin(
    tx: Prisma.TransactionClient,
    user: RequestUser,
    shared: CreateChequeBatchInput,
    row: CreateChequeBatchInput['cheques'][number],
    accountNumberEncrypted: string | null,
    baseCurrency: string,
    auditMeta: Partial<AuditContext>,
  ) {
    const conversion = computeConversion(
      row.amount,
      shared.currency,
      baseCurrency,
      shared.exchangeRate,
    );

    const cheque = await tx.cheque.create({
      data: {
        organizationId: user.organizationId,
        branchId: shared.branchId ?? user.branchId,
        direction: shared.direction,
        chequeNumber: row.chequeNumber,
        amount: toMoney(row.amount),
        amountInWords: row.amountInWords,
        currency: shared.currency,
        exchangeRate: conversion.exchangeRate,
        amountBase: conversion.amountBase,
        issueDate: shared.issueDate ? toDateOnly(shared.issueDate) : null,
        dueDate: toDateOnly(row.dueDate),
        receivedDate: shared.receivedDate ? toDateOnly(shared.receivedDate) : null,
        bankId: shared.bankId,
        bankNameRaw: shared.bankNameRaw,
        bankBranchRaw: shared.bankBranchRaw,
        accountNumberEncrypted,
        drawerName: shared.drawerName,
        originalSourceId: shared.originalSourceId,
        originalPayeeName: shared.originalPayeeName,
        currentLocationId: shared.currentLocationId,
        currentHolderId: user.id,
        purpose: shared.purpose,
        referenceNumber: shared.referenceNumber,
        notes: shared.notes,
        status: ChequeStatus.DRAFT,
        createdBy: user.id,
      },
      select: chequeSummarySelect,
    });

    await tx.chequeEvent.create({
      data: {
        chequeId: cheque.id,
        eventType: ChequeEventType.CREATED,
        toStatus: ChequeStatus.DRAFT,
        toLocationId: shared.currentLocationId,
        toUserId: user.id,
        performedBy: user.id,
        notes: null,
      },
    });

    await this.audit.recordWithin(tx, {
      organizationId: user.organizationId,
      userId: user.id,
      action: AuditAction.CHEQUE_CREATED,
      entityType: 'cheque',
      entityId: cheque.id,
      after: {
        chequeNumber: cheque.chequeNumber,
        amount: moneyToString(cheque.amount),
        currency: cheque.currency,
        dueDate: cheque.dueDate.toISOString().slice(0, 10),
        direction: cheque.direction,
        // Marks the row as part of a book, which is the difference between one
        // cheque and one of twenty when reading the log back.
        batchSize: shared.cheques.length,
      },
      ipAddress: auditMeta.ipAddress ?? null,
      deviceInfo: auditMeta.deviceInfo ?? null,
    });

    return cheque;
  }

  async findById(user: RequestUser, chequeId: string): Promise<ChequeDetailView> {
    const cheque = await this.prisma.db.cheque.findFirst({
      // Tenant scoping is part of the query, never a post-fetch check.
      where: { id: chequeId, organizationId: user.organizationId, deletedAt: null },
      include: chequeDetailInclude,
    });
    if (!cheque) throw AppError.notFound('Cheque', chequeId);
    return toChequeDetail(cheque, user.permissions, this.encryption);
  }

  async list(user: RequestUser, query: ListChequesQuery): Promise<Paginated<ChequeSummaryView>> {
    // One reference day for the whole page, so overdue flags stay consistent.
    const today = utcToday();
    const where = this.buildWhere(user, query);
    const skip = (query.page - 1) * query.pageSize;

    const [rows, total] = await this.prisma.db.$transaction([
      this.prisma.db.cheque.findMany({
        where,
        select: chequeSummarySelect,
        orderBy: [{ [query.sortBy]: query.sortOrder }, { id: 'asc' }],
        skip,
        take: query.pageSize,
      }),
      this.prisma.db.cheque.count({ where }),
    ]);

    return {
      data: rows.map((row) => toChequeSummary(row, today)),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
        hasNextPage: skip + rows.length < total,
      },
    };
  }

  /**
   * Updates cheque data (never its status).
   *
   * Uses the `version` column for optimistic locking: a stale write fails with
   * VERSION_CONFLICT instead of silently overwriting someone else's edit.
   */
  async update(
    user: RequestUser,
    chequeId: string,
    input: UpdateChequeInput,
    auditMeta: Partial<AuditContext> = {},
  ): Promise<ChequeDetailView> {
    const existing = await this.prisma.db.cheque.findFirst({
      where: { id: chequeId, organizationId: user.organizationId, deletedAt: null },
    });
    if (!existing) throw AppError.notFound('Cheque', chequeId);

    if (existing.status === ChequeStatus.CANCELLED || existing.status === ChequeStatus.CLEARED) {
      throw new AppError(
        ApiErrorCode.INVALID_STATE_TRANSITION,
        `Cannot edit a cheque in status ${existing.status}`,
        { details: { status: existing.status } },
      );
    }

    const amountChanged =
      input.amount !== undefined && moneyToString(existing.amount) !== input.amount;
    const dueDateChanged =
      input.dueDate !== undefined && existing.dueDate.toISOString().slice(0, 10) !== input.dueDate;

    // Changing the amount of an already reviewed cheque is a sensitive action.
    if (amountChanged && existing.reviewedAt !== null) {
      if (!user.permissions.includes('cheque.cancel')) {
        throw AppError.forbidden('Changing the amount after review requires cheque.cancel', {
          required: 'cheque.cancel',
        });
      }
      if (!input.reason) {
        throw new AppError(ApiErrorCode.VALIDATION_ERROR, 'A reason is required', {
          fieldErrors: [{ path: 'reason', message: 'validation.reason.required' }],
        });
      }
    }

    await this.assertTenantReferences(user.organizationId, {
      contactIds: [input.originalSourceId ?? null],
      bankId: input.bankId ?? null,
    });

    // The converted amount is recomputed whenever any of its three inputs
    // moves. Leaving it alone would leave a figure in the books that no longer
    // follows from the cheque it sits on.
    const conversionTouched =
      input.amount !== undefined ||
      input.currency !== undefined ||
      input.exchangeRate !== undefined;

    const conversion = conversionTouched
      ? computeConversion(
          input.amount ?? moneyToString(existing.amount),
          input.currency ?? existing.currency,
          await this.baseCurrency(user.organizationId),
          input.exchangeRate === undefined
            ? existing.exchangeRate === null
              ? null
              : rateToString(existing.exchangeRate)
            : (input.exchangeRate ?? null),
        )
      : null;

    const data: Prisma.ChequeUncheckedUpdateInput = {
      ...(input.chequeNumber !== undefined ? { chequeNumber: input.chequeNumber } : {}),
      ...(input.amount !== undefined ? { amount: toMoney(input.amount) } : {}),
      ...(input.amountInWords !== undefined ? { amountInWords: input.amountInWords } : {}),
      ...(input.currency !== undefined ? { currency: input.currency } : {}),
      ...(conversion
        ? { exchangeRate: conversion.exchangeRate, amountBase: conversion.amountBase }
        : {}),
      ...(input.issueDate !== undefined
        ? { issueDate: input.issueDate ? toDateOnly(input.issueDate) : null }
        : {}),
      ...(input.dueDate !== undefined ? { dueDate: toDateOnly(input.dueDate) } : {}),
      ...(input.receivedDate !== undefined
        ? { receivedDate: input.receivedDate ? toDateOnly(input.receivedDate) : null }
        : {}),
      ...(input.bankId !== undefined ? { bankId: input.bankId } : {}),
      ...(input.bankNameRaw !== undefined ? { bankNameRaw: input.bankNameRaw } : {}),
      ...(input.bankBranchRaw !== undefined ? { bankBranchRaw: input.bankBranchRaw } : {}),
      ...(input.accountNumber !== undefined
        ? { accountNumberEncrypted: this.encryption.encryptNullable(input.accountNumber) }
        : {}),
      ...(input.drawerName !== undefined ? { drawerName: input.drawerName } : {}),
      ...(input.originalSourceId !== undefined ? { originalSourceId: input.originalSourceId } : {}),
      ...(input.originalPayeeName !== undefined
        ? { originalPayeeName: input.originalPayeeName }
        : {}),
      ...(input.purpose !== undefined ? { purpose: input.purpose } : {}),
      ...(input.referenceNumber !== undefined ? { referenceNumber: input.referenceNumber } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      version: { increment: 1 },
    };

    const updated = await this.prisma.db.$transaction(async (tx) => {
      const result = await tx.cheque.updateMany({
        where: { id: chequeId, organizationId: user.organizationId, version: input.version },
        data,
      });
      if (result.count === 0) {
        throw AppError.versionConflict(input.version, existing.version);
      }

      if (amountChanged || dueDateChanged) {
        await tx.chequeEvent.create({
          data: {
            chequeId,
            eventType: ChequeEventType.DATA_CORRECTED,
            fromStatus: existing.status,
            toStatus: existing.status,
            performedBy: user.id,
            notes: input.reason ?? null,
          },
        });
      }

      await this.audit.recordWithin(tx, {
        organizationId: user.organizationId,
        userId: user.id,
        action: amountChanged
          ? AuditAction.CHEQUE_AMOUNT_CHANGED
          : dueDateChanged
            ? AuditAction.CHEQUE_DATE_CHANGED
            : AuditAction.CHEQUE_UPDATED,
        entityType: 'cheque',
        entityId: chequeId,
        before: {
          amount: moneyToString(existing.amount),
          dueDate: existing.dueDate.toISOString().slice(0, 10),
          chequeNumber: existing.chequeNumber,
        },
        after: { ...input, reason: input.reason ?? null },
        ipAddress: auditMeta.ipAddress ?? null,
        deviceInfo: auditMeta.deviceInfo ?? null,
      });

      return tx.cheque.findUniqueOrThrow({ where: { id: chequeId }, include: chequeDetailInclude });
    });

    return toChequeDetail(updated, user.permissions, this.encryption);
  }

  /**
   * Records that cheque data left the system.
   *
   * An export is a disclosure of the whole book, so it is audited like any
   * other sensitive action — who exported, when, and how many rows.
   */
  async recordExport(
    user: RequestUser,
    rowCount: number,
    auditMeta: Partial<AuditContext> = {},
  ): Promise<void> {
    await this.audit.record({
      organizationId: user.organizationId,
      userId: user.id,
      action: AuditAction.CHEQUE_EXPORTED,
      entityType: 'cheque',
      after: { rowCount, format: 'csv' },
      ipAddress: auditMeta.ipAddress ?? null,
      deviceInfo: auditMeta.deviceInfo ?? null,
    });
  }

  private buildWhere(user: RequestUser, query: ListChequesQuery): Prisma.ChequeWhereInput {
    const and: Prisma.ChequeWhereInput[] = [
      { organizationId: user.organizationId, deletedAt: null },
    ];

    if (query.status) and.push({ status: { in: query.status } });
    if (query.direction) and.push({ direction: query.direction });
    if (query.currency) and.push({ currency: query.currency });

    // "Overdue" must mean the same thing here as on the dashboard: past due
    // AND still outstanding. A cleared cheque with an old due date is not late.
    if (query.overdue !== undefined) {
      const past = {
        dueDate: { lt: toDateOnly(utcToday()) },
        status: { in: [...OUTSTANDING_CHEQUE_STATUSES] },
      };
      and.push(query.overdue ? past : { NOT: past });
    }

    if (query.branchId) and.push({ branchId: query.branchId });
    if (query.bankId) and.push({ bankId: query.bankId });
    if (query.sourceId) and.push({ originalSourceId: query.sourceId });
    if (query.recipientId) and.push({ currentRecipientId: query.recipientId });
    if (query.locationId) and.push({ currentLocationId: query.locationId });
    if (query.chequeNumber)
      and.push({ chequeNumber: { contains: query.chequeNumber, mode: 'insensitive' } });

    if (query.dueFrom || query.dueTo) {
      and.push({
        dueDate: {
          ...(query.dueFrom ? { gte: toDateOnly(query.dueFrom) } : {}),
          ...(query.dueTo ? { lte: toDateOnly(query.dueTo) } : {}),
        },
      });
    }

    if (query.amountMin || query.amountMax) {
      and.push({
        amount: {
          ...(query.amountMin ? { gte: toMoney(query.amountMin) } : {}),
          ...(query.amountMax ? { lte: toMoney(query.amountMax) } : {}),
        },
      });
    }

    // Free text search across the fields staff actually search by.
    if (query.search) {
      const contains = { contains: query.search, mode: 'insensitive' as const };
      and.push({
        OR: [
          { chequeNumber: contains },
          { drawerName: contains },
          { originalPayeeName: contains },
          { referenceNumber: contains },
          { bankNameRaw: contains },
          { bank: { name: contains } },
          { originalSource: { name: contains } },
          { currentRecipient: { name: contains } },
        ],
      });
    }

    return { AND: and };
  }

  /**
   * Verifies that every referenced entity belongs to the caller's
   * organization. Without this, an id from another tenant could be attached to
   * a cheque even though the cheque itself is correctly scoped.
   */
  private async assertTenantReferences(
    organizationId: string,
    refs: {
      branchId?: string | null;
      contactIds?: Array<string | null>;
      locationId?: string | null;
      bankId?: string | null;
    },
  ): Promise<void> {
    if (refs.branchId) {
      const branch = await this.prisma.db.branch.findFirst({
        where: { id: refs.branchId, organizationId },
        select: { id: true },
      });
      if (!branch) throw AppError.notFound('Branch', refs.branchId);
    }

    for (const contactId of refs.contactIds ?? []) {
      if (!contactId) continue;
      const contact = await this.prisma.db.contact.findFirst({
        where: { id: contactId, organizationId },
        select: { id: true },
      });
      if (!contact) throw AppError.notFound('Contact', contactId);
    }

    if (refs.locationId) {
      const location = await this.prisma.db.location.findFirst({
        where: { id: refs.locationId, organizationId },
        select: { id: true },
      });
      if (!location) throw AppError.notFound('Location', refs.locationId);
    }

    if (refs.bankId) {
      const bank = await this.prisma.db.bank.findUnique({
        where: { id: refs.bankId },
        select: { id: true },
      });
      if (!bank) throw AppError.notFound('Bank', refs.bankId);
    }
  }
}
