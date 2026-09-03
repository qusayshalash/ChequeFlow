import { Injectable } from '@nestjs/common';

import {
  ChequeStatus,
  OUTSTANDING_CHEQUE_STATUSES,
  utcToday,
  ApiErrorCode,
  type ContactCreditStatus,
  type ContactStatementCurrency,
  type ContactStatementView,
  type ContactBalance,
  type ContactListItemView,
  type ContactView,
  type Paginated,
} from '@cheque-flow/shared-types';
import { moneyToString, Prisma, toMoney } from '@cheque-flow/database';
import type {
  CreateContactInput,
  ListContactsQuery,
  MergeContactsInput,
  UpdateContactInput,
} from '@cheque-flow/validation';

import { AppError } from '../../common/errors/app-error';
import type { RequestUser } from '../../common/types/request-user';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditAction, AuditService, type AuditContext } from '../audit/audit.service';
import { chequeSummarySelect, toChequeSummary } from '../cheques/cheque.mapper';

type ContactRow = Prisma.ContactGetPayload<Record<string, never>>;

function toView(contact: ContactRow): ContactView {
  return {
    id: contact.id,
    type: contact.type,
    name: contact.name,
    companyName: contact.companyName,
    phone: contact.phone,
    email: contact.email,
    taxNumber: contact.taxNumber,
    nationalId: contact.nationalId,
    address: contact.address,
    notes: contact.notes,
    creditLimit: contact.creditLimit === null ? null : moneyToString(contact.creditLimit),
    creditLimitCurrency: contact.creditLimitCurrency,
    isActive: contact.isActive,
    createdAt: contact.createdAt.toISOString(),
    updatedAt: contact.updatedAt.toISOString(),
  };
}

@Injectable()
export class ContactsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(user: RequestUser, query: ListContactsQuery): Promise<Paginated<ContactListItemView>> {
    const where: Prisma.ContactWhereInput = {
      organizationId: user.organizationId,
      ...(query.type ? { type: query.type } : {}),
      ...(query.isActive === undefined ? {} : { isActive: query.isActive }),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { companyName: { contains: query.search, mode: 'insensitive' } },
              { phone: { contains: query.search } },
              { email: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const skip = (query.page - 1) * query.pageSize;
    const [rows, total] = await this.prisma.db.$transaction([
      this.prisma.db.contact.findMany({
        where,
        orderBy: [{ [query.sortBy]: query.sortOrder }, { id: 'asc' }],
        skip,
        take: query.pageSize,
      }),
      this.prisma.db.contact.count({ where }),
    ]);

    // Only the page's own contacts, so the cost of this is bounded by the page
    // size rather than by how many contacts the organisation has.
    const stats = await this.chequeStats(
      user.organizationId,
      rows.map((row) => row.id),
    );

    return {
      data: rows.map((row) => ({
        ...toView(row),
        chequeCount: stats.get(row.id)?.chequeCount ?? 0,
        balances: stats.get(row.id)?.balances ?? [],
      })),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
        hasNextPage: skip + rows.length < total,
      },
    };
  }

  async findById(user: RequestUser, id: string): Promise<ContactView> {
    const contact = await this.prisma.db.contact.findFirst({
      where: { id, organizationId: user.organizationId },
    });
    if (!contact) throw AppError.notFound('Contact', id);
    return toView(contact);
  }

  async create(
    user: RequestUser,
    input: CreateContactInput,
    auditMeta: Partial<AuditContext> = {},
  ): Promise<ContactView> {
    const contact = await this.prisma.db.contact.create({
      data: { ...input, organizationId: user.organizationId },
    });

    await this.audit.record({
      organizationId: user.organizationId,
      userId: user.id,
      action: AuditAction.CONTACT_CREATED,
      entityType: 'contact',
      entityId: contact.id,
      after: { name: contact.name, type: contact.type },
      ipAddress: auditMeta.ipAddress ?? null,
      deviceInfo: auditMeta.deviceInfo ?? null,
    });

    return toView(contact);
  }

  async update(
    user: RequestUser,
    id: string,
    input: UpdateContactInput,
    auditMeta: Partial<AuditContext> = {},
  ): Promise<ContactView> {
    const existing = await this.prisma.db.contact.findFirst({
      where: { id, organizationId: user.organizationId },
    });
    if (!existing) throw AppError.notFound('Contact', id);

    const contact = await this.prisma.db.contact.update({ where: { id }, data: input });

    await this.audit.record({
      organizationId: user.organizationId,
      userId: user.id,
      action: AuditAction.CONTACT_UPDATED,
      entityType: 'contact',
      entityId: id,
      before: { name: existing.name, isActive: existing.isActive },
      after: { name: contact.name, isActive: contact.isActive },
      ipAddress: auditMeta.ipAddress ?? null,
      deviceInfo: auditMeta.deviceInfo ?? null,
    });

    return toView(contact);
  }

  /**
   * Deactivates or deletes a contact.
   *
   * A contact that appears anywhere in cheque history is never removed from
   * the database: deleting it would blank out the "received from" / "handed to"
   * columns on cheques and events, silently rewriting the custody trail. Such a
   * contact is deactivated instead, which hides it from pickers while keeping
   * every past record intact. Only a contact with no history at all is deleted.
   */
  async remove(
    user: RequestUser,
    id: string,
    auditMeta: Partial<AuditContext> = {},
  ): Promise<{ deleted: boolean; contact: ContactView | null }> {
    const existing = await this.prisma.db.contact.findFirst({
      where: { id, organizationId: user.organizationId },
    });
    if (!existing) throw AppError.notFound('Contact', id);

    const references = await this.countReferences(id);

    if (references > 0) {
      const contact = await this.prisma.db.contact.update({
        where: { id },
        data: { isActive: false },
      });
      await this.audit.record({
        organizationId: user.organizationId,
        userId: user.id,
        action: AuditAction.CONTACT_UPDATED,
        entityType: 'contact',
        entityId: id,
        before: { isActive: existing.isActive },
        after: { isActive: false, deactivatedBecauseReferenced: references },
        ipAddress: auditMeta.ipAddress ?? null,
        deviceInfo: auditMeta.deviceInfo ?? null,
      });
      return { deleted: false, contact: toView(contact) };
    }

    await this.prisma.db.contact.delete({ where: { id } });
    await this.audit.record({
      organizationId: user.organizationId,
      userId: user.id,
      action: AuditAction.CONTACT_DELETED,
      entityType: 'contact',
      entityId: id,
      before: { name: existing.name, type: existing.type },
      ipAddress: auditMeta.ipAddress ?? null,
      deviceInfo: auditMeta.deviceInfo ?? null,
    });
    return { deleted: true, contact: null };
  }

  /**
   * Merges a duplicate contact into the one that should survive.
   *
   * The cheques that point at the duplicate are repointed at the target inside
   * one transaction. The event ledger is left untouched on purpose (see below).
   * The duplicate is deactivated rather than deleted, which keeps the merge
   * reversible by hand and keeps old ledger rows resolvable to a name.
   */
  async merge(
    user: RequestUser,
    input: MergeContactsInput,
    auditMeta: Partial<AuditContext> = {},
  ): Promise<ContactView> {
    if (input.sourceId === input.targetId) {
      throw new AppError(ApiErrorCode.VALIDATION_ERROR, 'A contact cannot be merged into itself', {
        fieldErrors: [{ path: 'sourceId', message: 'validation.contact.mergeSelf' }],
      });
    }

    const [source, target] = await Promise.all([
      this.prisma.db.contact.findFirst({
        where: { id: input.sourceId, organizationId: user.organizationId },
      }),
      this.prisma.db.contact.findFirst({
        where: { id: input.targetId, organizationId: user.organizationId },
      }),
    ]);
    if (!source) throw AppError.notFound('Contact', input.sourceId);
    if (!target) throw AppError.notFound('Contact', input.targetId);

    const merged = await this.prisma.db.$transaction(async (tx) => {
      await tx.cheque.updateMany({
        where: { originalSourceId: source.id },
        data: { originalSourceId: target.id },
      });
      await tx.cheque.updateMany({
        where: { currentRecipientId: source.id },
        data: { currentRecipientId: target.id },
      });
      // `cheque_events` is deliberately NOT rewritten. The ledger is
      // append-only — a database trigger rejects UPDATE on it — and rewriting
      // it would be wrong even if it were allowed: those rows record who the
      // cheque actually came from at the time, which a later bookkeeping merge
      // does not change. The duplicate row is kept (deactivated, not deleted)
      // precisely so those historical events still resolve to a name.

      // Fill in details the surviving record is missing rather than
      // overwriting what it already has.
      const filled = await tx.contact.update({
        where: { id: target.id },
        data: {
          phone: target.phone ?? source.phone,
          email: target.email ?? source.email,
          taxNumber: target.taxNumber ?? source.taxNumber,
          nationalId: target.nationalId ?? source.nationalId,
          address: target.address ?? source.address,
          companyName: target.companyName ?? source.companyName,
        },
      });

      await tx.contact.update({
        where: { id: source.id },
        data: { isActive: false, notes: `Merged into ${target.name} (${target.id})` },
      });

      await this.audit.recordWithin(tx, {
        organizationId: user.organizationId,
        userId: user.id,
        action: AuditAction.CONTACT_MERGED,
        entityType: 'contact',
        entityId: target.id,
        before: { source: { id: source.id, name: source.name } },
        after: { target: { id: target.id, name: target.name } },
        ipAddress: auditMeta.ipAddress ?? null,
        deviceInfo: auditMeta.deviceInfo ?? null,
      });

      return filled;
    });

    return toView(merged);
  }

  /**
   * Account statement for one contact: what they still owe us, what they
   * actually paid, and what came back — each per currency, never summed
   * across currencies.
   */
  /**
   * How much of a contact's credit limit their uncollected cheques use up.
   *
   * Only cheques in the limit's own currency count. Converting other currencies
   * at today's rate to squeeze them in would make the headroom figure move on
   * days when nothing happened, and a limit that drifts is one nobody trusts.
   * Cheques in another currency are reported separately instead.
   *
   * `null` when no limit is set. That is not "unlimited" — nobody has decided
   * yet, and the screens say so.
   */
  private static creditStatus(
    contact: ContactView,
    currencies: readonly ContactStatementCurrency[],
  ): ContactCreditStatus | null {
    if (contact.creditLimit === null || contact.creditLimitCurrency === null) return null;

    const inCurrency = currencies.find((entry) => entry.currency === contact.creditLimitCurrency);
    const used = toMoney(inCurrency?.pending.total ?? '0');
    const limit = toMoney(contact.creditLimit);
    const headroom = limit.minus(used);

    return {
      limit: moneyToString(limit),
      currency: contact.creditLimitCurrency,
      used: moneyToString(used),
      // Negative headroom is reported rather than clamped: "over by 900" is the
      // number the person chasing the debt actually needs.
      headroom: moneyToString(headroom),
      exceeded: headroom.lessThan(0),
      // Uncollected cheques the limit says nothing about.
      otherCurrencies: currencies
        .filter(
          (entry) => entry.currency !== contact.creditLimitCurrency && entry.pending.count > 0,
        )
        .map((entry) => ({ currency: entry.currency, ...entry.pending })),
    };
  }

  /**
   * How many cheques each of these contacts is on, and what they still owe
   * (or are owed) in each currency.
   *
   * Raw SQL because a contact sits in one of two columns — the party a cheque
   * came from, or the party it was handed to — and Prisma's `groupBy` can only
   * group by one of them at a time. Running it twice and adding the results
   * would double-count a cheque that went back to the same contact it came
   * from. The lateral unpivot plus `DISTINCT` counts each such cheque once.
   */
  private async chequeStats(
    organizationId: string,
    ids: readonly string[],
  ): Promise<Map<string, { chequeCount: number; balances: ContactBalance[] }>> {
    const result = new Map<string, { chequeCount: number; balances: ContactBalance[] }>();
    if (ids.length === 0) return result;

    const rows = await this.prisma.db.$queryRaw<
      { contact_id: string; currency: string; cheque_count: bigint; net: Prisma.Decimal | null }[]
    >`
      SELECT contact_id,
             currency,
             COUNT(*)::bigint AS cheque_count,
             -- Incoming counts towards us, outgoing against us, and only while
             -- the cheque is still open: a cleared cheque is not a balance.
             COALESCE(
               SUM(
                 CASE WHEN status = ANY(${OUTSTANDING_CHEQUE_STATUSES}::"ChequeStatus"[])
                      THEN CASE WHEN direction = 'INCOMING' THEN amount ELSE -amount END
                      ELSE 0 END
               ),
               0
             ) AS net
      FROM (
        SELECT DISTINCT c.id, party.contact_id, c.currency, c.status, c.direction, c.amount
        FROM cheques c
        CROSS JOIN LATERAL (
          VALUES (c.original_source_id), (c.current_recipient_id)
        ) AS party(contact_id)
        WHERE c.organization_id = ${organizationId}::uuid
          AND c.deleted_at IS NULL
          AND party.contact_id = ANY(${ids}::uuid[])
      ) involved
      GROUP BY contact_id, currency
      ORDER BY contact_id, currency
    `;

    for (const row of rows) {
      const entry = result.get(row.contact_id) ?? { chequeCount: 0, balances: [] };
      entry.chequeCount += Number(row.cheque_count);

      const net = toMoney(row.net ?? 0);
      // A currency where everything has settled nets to zero; listing it would
      // be a row that says nothing.
      if (!net.isZero()) {
        entry.balances.push({ currency: row.currency, net: moneyToString(net) });
      }

      result.set(row.contact_id, entry);
    }

    return result;
  }

  async statement(user: RequestUser, id: string, limit = 50): Promise<ContactStatementView> {
    const contact = await this.findById(user, id);

    // A contact can be on either side of a cheque: the party it came from, or
    // the party it was handed to. The statement covers both.
    const involved: Prisma.ChequeWhereInput = {
      organizationId: user.organizationId,
      deletedAt: null,
      OR: [{ originalSourceId: id }, { currentRecipientId: id }],
    };

    const [grouped, rows, totalCheques] = await Promise.all([
      this.prisma.db.cheque.groupBy({
        by: ['currency', 'status'],
        where: involved,
        _count: { _all: true },
        _sum: { amount: true },
      }),
      this.prisma.db.cheque.findMany({
        where: involved,
        select: chequeSummarySelect,
        orderBy: { dueDate: 'desc' },
        take: limit,
      }),
      // The per-currency figures cover every cheque, but the list is capped.
      // Reporting the true count lets the client say so instead of implying
      // the contact has only as many cheques as happen to fit.
      this.prisma.db.cheque.count({ where: involved }),
    ]);

    const byCurrency = new Map<string, ContactStatementCurrency>();
    const blank = (currency: string): ContactStatementCurrency => ({
      currency,
      pending: { count: 0, total: '0.00' },
      collected: { count: 0, total: '0.00' },
      bounced: { count: 0, total: '0.00' },
      returned: { count: 0, total: '0.00' },
    });

    for (const row of grouped) {
      const bucketName = ContactsService.bucketFor(row.status);
      if (!bucketName) continue;

      const entry = byCurrency.get(row.currency) ?? blank(row.currency);
      const current = entry[bucketName];
      entry[bucketName] = {
        count: current.count + row._count._all,
        // Sums come from PostgreSQL as decimals; adding the two group sums as
        // strings would be wrong, so re-add them as decimals.
        total: moneyToString(toMoney(current.total).plus(row._sum.amount ?? toMoney('0'))),
      };
      byCurrency.set(row.currency, entry);
    }

    const today = utcToday();
    const currencies = [...byCurrency.values()].sort((a, b) =>
      a.currency.localeCompare(b.currency),
    );

    return {
      contact,
      currencies,
      creditLimit: ContactsService.creditStatus(contact, currencies),
      cheques: rows.map((row) => toChequeSummary(row, today)),
      totalCheques,
    };
  }

  /** Which statement bucket a status belongs to, or null if it belongs to none. */
  private static bucketFor(
    status: ChequeStatus,
  ): 'pending' | 'collected' | 'bounced' | 'returned' | null {
    if (OUTSTANDING_CHEQUE_STATUSES.includes(status)) return 'pending';
    if (status === ChequeStatus.CLEARED) return 'collected';
    if (status === ChequeStatus.BOUNCED) return 'bounced';
    if (status === ChequeStatus.RETURNED) return 'returned';
    // DRAFT, PENDING_REVIEW, CANCELLED and LOST are deliberately excluded:
    // none of them represents money owed, collected or returned.
    return null;
  }

  /** How many cheques and events still point at this contact. */
  private async countReferences(id: string): Promise<number> {
    const [asSource, asRecipient, asEventFrom, asEventTo] = await Promise.all([
      this.prisma.db.cheque.count({ where: { originalSourceId: id } }),
      this.prisma.db.cheque.count({ where: { currentRecipientId: id } }),
      this.prisma.db.chequeEvent.count({ where: { fromContactId: id } }),
      this.prisma.db.chequeEvent.count({ where: { toContactId: id } }),
    ]);
    return asSource + asRecipient + asEventFrom + asEventTo;
  }
}
