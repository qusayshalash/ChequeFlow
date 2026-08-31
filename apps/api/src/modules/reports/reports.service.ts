import { Injectable } from '@nestjs/common';

import {
  ChequeStatus,
  OUTSTANDING_CHEQUE_STATUSES,
  type Bucket,
  type DashboardCurrencyTotals,
  type DashboardSummary,
  type Paginated,
} from '@cheque-flow/shared-types';
import { Prisma, moneyToString, sumMoney, toMoney } from '@cheque-flow/database';
import type {
  AuditLogQuery,
  CashFlowReportQuery,
  CustodyReportQuery,
  DashboardQuery,
  DueReportQuery,
} from '@cheque-flow/validation';

import type { RequestUser } from '../../common/types/request-user';
import { PrismaService } from '../../prisma/prisma.service';
import { chequeEventInclude, toChequeEventView } from '../cheques/cheque.mapper';
import { chequeSummarySelect, toChequeSummary } from '../cheques/cheque.mapper';

/**
 * Statuses that represent money the company still expects to collect.
 * Defined once in `@cheque-flow/shared-types` so the dashboard, the reports
 * and the mobile filters can never drift apart.
 */
const OUTSTANDING = OUTSTANDING_CHEQUE_STATUSES;

const EMPTY_BUCKET: Bucket = { count: 0, total: '0.00' };

/** A count and total that belong to one currency. */
export interface CurrencyBucket extends Bucket {
  currency: string;
}

/**
 * Groups amounts by currency.
 *
 * Every report figure goes through this. Summing across currencies produces a
 * number that means nothing, and labelling that number with one currency —
 * which these reports used to do — is worse, because it looks correct.
 */
function bucketByCurrency(
  rows: ReadonlyArray<{ currency: string; amount: Prisma.Decimal }>,
): CurrencyBucket[] {
  const groups = new Map<string, Prisma.Decimal[]>();
  for (const row of rows) {
    const amounts = groups.get(row.currency) ?? [];
    amounts.push(row.amount);
    groups.set(row.currency, amounts);
  }

  return [...groups.entries()]
    .map(([currency, amounts]) => ({
      currency,
      count: amounts.length,
      total: moneyToString(sumMoney(amounts)),
    }))
    .sort((a, b) => a.currency.localeCompare(b.currency));
}

function todayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

function toDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/** One row of the audit trail, as returned by the API. */
export interface AuditLogView {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  userName: string | null;
  userEmail: string | null;
  ipAddress: string | null;
  deviceInfo: string | null;
  before: unknown;
  after: unknown;
  createdAt: string;
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Numbers shown on the dashboard home screen, split by currency.
   *
   * Totals are never added across currencies — a single figure mixing shekels
   * and dollars would be meaningless — so each currency is aggregated in the
   * database and returned as its own block.
   */
  async dashboard(user: RequestUser, query: DashboardQuery = {}): Promise<DashboardSummary> {
    const today = todayUtc();
    const in7Days = addDays(today, 7);
    const in30Days = addDays(today, 30);

    /*
     * The optional window goes in `AND`, not alongside `dueDate`.
     *
     * Several buckets set `dueDate` themselves — due today, due within 7 days,
     * overdue — and an object spread would silently drop whichever came first,
     * so the window would appear to work while quietly doing nothing to those
     * three. Under `AND` both constraints apply.
     */
    const window: Prisma.ChequeWhereInput[] = [];
    if (query.dueFrom) window.push({ dueDate: { gte: toDateOnly(query.dueFrom) } });
    if (query.dueTo) window.push({ dueDate: { lte: toDateOnly(query.dueTo) } });

    const base: Prisma.ChequeWhereInput = {
      organizationId: user.organizationId,
      deletedAt: null,
      ...(window.length > 0 ? { AND: window } : {}),
    };
    const outstanding = { ...base, status: { in: [...OUTSTANDING] } };

    const [
      draft,
      inHand,
      dueToday,
      dueWithin7,
      dueWithin30,
      overdue,
      deposited,
      cleared,
      bounced,
      returned,
      incoming,
      outgoing,
      allCurrencies,
      organization,
      converted,
      unconverted,
      recentEvents,
    ] = await Promise.all([
      this.totalsByCurrency({
        ...base,
        status: { in: [ChequeStatus.DRAFT, ChequeStatus.PENDING_REVIEW] },
      }),
      this.totalsByCurrency({
        ...base,
        status: { in: [ChequeStatus.IN_HAND, ChequeStatus.RESERVED] },
      }),
      this.totalsByCurrency({ ...outstanding, dueDate: today }),
      this.totalsByCurrency({ ...outstanding, dueDate: { gte: today, lte: in7Days } }),
      this.totalsByCurrency({ ...outstanding, dueDate: { gte: today, lte: in30Days } }),
      this.totalsByCurrency({ ...outstanding, dueDate: { lt: today } }),
      this.totalsByCurrency({ ...base, status: ChequeStatus.DEPOSITED }),
      this.totalsByCurrency({ ...base, status: ChequeStatus.CLEARED }),
      this.totalsByCurrency({ ...base, status: ChequeStatus.BOUNCED }),
      this.totalsByCurrency({ ...base, status: ChequeStatus.RETURNED }),
      this.totalsByCurrency({ ...outstanding, direction: 'INCOMING' }),
      this.totalsByCurrency({ ...outstanding, direction: 'OUTGOING' }),
      // Every currency the organization actually holds cheques in, whatever
      // their status. Deriving the list from the buckets instead would hide a
      // currency whose cheques are all cancelled or lost, and the dashboard
      // would silently show nothing for money that exists.
      this.prisma.db.cheque.groupBy({ by: ['currency'], where: base }),
      this.prisma.db.organization.findUniqueOrThrow({
        where: { id: user.organizationId },
        select: { defaultCurrency: true, baseCurrency: true },
      }),
      // Outstanding money expressed in the books' currency. Summed over the
      // stored `amount_base`, which was converted at the rate recorded the day
      // each cheque arrived — never at today's rate.
      this.prisma.db.cheque.aggregate({
        where: { ...outstanding, amountBase: { not: null } },
        _sum: { amountBase: true },
        _count: true,
      }),
      // Cheques that carry no rate, and so are missing from the figure above.
      // A converted total that quietly omits them is worse than no total.
      this.prisma.db.cheque.count({ where: { ...outstanding, amountBase: null } }),
      this.prisma.db.chequeEvent.findMany({
        where: { cheque: { organizationId: user.organizationId } },
        include: chequeEventInclude,
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);

    // Report every currency that has cheques, plus the organization's own
    // currency, which is listed first so it reads as the headline figure.
    const seen = new Set<string>(allCurrencies.map((row) => row.currency));
    seen.add(organization.defaultCurrency);

    const currencies = [...seen].sort((a, b) => {
      if (a === organization.defaultCurrency) return -1;
      if (b === organization.defaultCurrency) return 1;
      return a.localeCompare(b);
    });

    return {
      defaultCurrency: organization.defaultCurrency,
      baseCurrency: organization.baseCurrency,
      baseTotal: {
        currency: organization.baseCurrency,
        count: converted._count,
        total: moneyToString(converted._sum.amountBase ?? 0),
        unconvertedCount: unconverted,
      },
      currencies: currencies.map((currency): DashboardCurrencyTotals => ({
        currency,
        draft: draft.get(currency) ?? EMPTY_BUCKET,
        inHand: inHand.get(currency) ?? EMPTY_BUCKET,
        dueToday: dueToday.get(currency) ?? EMPTY_BUCKET,
        dueWithin7Days: dueWithin7.get(currency) ?? EMPTY_BUCKET,
        dueWithin30Days: dueWithin30.get(currency) ?? EMPTY_BUCKET,
        overdue: overdue.get(currency) ?? EMPTY_BUCKET,
        deposited: deposited.get(currency) ?? EMPTY_BUCKET,
        cleared: cleared.get(currency) ?? EMPTY_BUCKET,
        bounced: bounced.get(currency) ?? EMPTY_BUCKET,
        returned: returned.get(currency) ?? EMPTY_BUCKET,
        incoming: incoming.get(currency) ?? EMPTY_BUCKET,
        outgoing: outgoing.get(currency) ?? EMPTY_BUCKET,
      })),
      recentEvents: recentEvents.map(toChequeEventView),
    };
  }

  /**
   * Counts and sums cheques matching `where`, grouped by currency.
   * The summation happens in PostgreSQL against the NUMERIC column, so no
   * amount ever passes through a JavaScript float.
   */
  private async totalsByCurrency(where: Prisma.ChequeWhereInput): Promise<Map<string, Bucket>> {
    const rows = await this.prisma.db.cheque.groupBy({
      by: ['currency'],
      where,
      _count: { _all: true },
      _sum: { amount: true },
    });

    return new Map(
      rows.map((row) => [
        row.currency,
        {
          count: row._count._all,
          total: row._sum.amount === null ? '0.00' : moneyToString(row._sum.amount),
        },
      ]),
    );
  }

  /** Cheques due in a window, optionally including everything overdue. */
  async due(user: RequestUser, query: DueReportQuery) {
    const today = todayUtc();
    const from = query.from ? toDateOnly(query.from) : today;
    const to = query.to ? toDateOnly(query.to) : addDays(today, query.withinDays ?? 7);

    const rows = await this.prisma.db.cheque.findMany({
      where: {
        organizationId: user.organizationId,
        deletedAt: null,
        status: { in: [...OUTSTANDING] },
        ...(query.branchId ? { branchId: query.branchId } : {}),
        OR: [
          { dueDate: { gte: from, lte: to } },
          ...(query.includeOverdue ? [{ dueDate: { lt: today } }] : []),
        ],
      },
      select: chequeSummarySelect,
      orderBy: { dueDate: 'asc' },
    });

    const todayIso = today.toISOString().slice(0, 10);
    const cheques = rows.map((row) => toChequeSummary(row, todayIso));
    const overdue = cheques.filter((cheque) => cheque.isOverdue);

    // Counts are safe to add across currencies — a cheque is a cheque. Money
    // is not, so only the totals are split.
    return {
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
      count: cheques.length,
      overdueCount: overdue.length,
      byCurrency: bucketByCurrency(
        cheques.map((cheque) => ({ currency: cheque.currency, amount: toMoney(cheque.amount) })),
      ),
      overdueByCurrency: bucketByCurrency(
        overdue.map((cheque) => ({ currency: cheque.currency, amount: toMoney(cheque.amount) })),
      ),
      cheques,
    };
  }

  /**
   * Expected cash flow, bucketed by day, week or month.
   *
   * Incoming cheques add to the expected inflow, outgoing ones to the
   * outflow; a transferred cheque no longer produces cash for us.
   */
  async cashFlow(user: RequestUser, query: CashFlowReportQuery) {
    const rows = await this.prisma.db.cheque.findMany({
      where: {
        organizationId: user.organizationId,
        deletedAt: null,
        status: { in: [...OUTSTANDING] },
        dueDate: { gte: toDateOnly(query.from), lte: toDateOnly(query.to) },
        ...(query.branchId ? { branchId: query.branchId } : {}),
      },
      select: { amount: true, currency: true, dueDate: true, direction: true },
      orderBy: { dueDate: 'asc' },
    });

    // Bucketed by period *and* currency: a month holding shekel and dollar
    // cheques has two lines, not one meaningless sum.
    type Flow = { inflow: Prisma.Decimal[]; outflow: Prisma.Decimal[] };
    const buckets = new Map<string, Map<string, Flow>>();

    for (const row of rows) {
      const period = ReportsService.bucketKey(row.dueDate, query.granularity);
      const byCurrency = buckets.get(period) ?? new Map<string, Flow>();
      const bucket = byCurrency.get(row.currency) ?? { inflow: [], outflow: [] };
      if (row.direction === 'OUTGOING') bucket.outflow.push(row.amount);
      else bucket.inflow.push(row.amount);
      byCurrency.set(row.currency, bucket);
      buckets.set(period, byCurrency);
    }

    const periods = [...buckets.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, byCurrency]) => ({
        period,
        byCurrency: [...byCurrency.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([currency, bucket]) => {
            const inflow = sumMoney(bucket.inflow);
            const outflow = sumMoney(bucket.outflow);
            return {
              currency,
              inflow: moneyToString(inflow),
              outflow: moneyToString(outflow),
              net: moneyToString(inflow.minus(outflow)),
            };
          }),
      }));

    return { from: query.from, to: query.to, granularity: query.granularity, periods };
  }

  static bucketKey(date: Date, granularity: 'day' | 'week' | 'month'): string {
    const iso = date.toISOString().slice(0, 10);
    if (granularity === 'day') return iso;
    if (granularity === 'month') return iso.slice(0, 7);
    // Week buckets start on Monday.
    const weekday = (date.getUTCDay() + 6) % 7;
    return new Date(date.getTime() - weekday * 86_400_000).toISOString().slice(0, 10);
  }

  /** Who or what currently holds the company's cheques. */
  async custody(user: RequestUser, query: CustodyReportQuery) {
    const rows = await this.prisma.db.cheque.findMany({
      where: {
        organizationId: user.organizationId,
        deletedAt: null,
        status: { in: [ChequeStatus.IN_HAND, ChequeStatus.RESERVED] },
        ...(query.branchId ? { branchId: query.branchId } : {}),
        ...(query.locationId ? { currentLocationId: query.locationId } : {}),
        ...(query.holderId ? { currentHolderId: query.holderId } : {}),
      },
      select: {
        amount: true,
        currency: true,
        currentLocation: { select: { id: true, name: true, type: true } },
        currentHolder: { select: { id: true, name: true } },
      },
    });

    const groups = new Map<
      string,
      {
        locationName: string | null;
        holderName: string | null;
        rows: Array<{ currency: string; amount: Prisma.Decimal }>;
      }
    >();

    for (const row of rows) {
      const key = `${row.currentLocation?.id ?? 'none'}:${row.currentHolder?.id ?? 'none'}`;
      const group = groups.get(key) ?? {
        locationName: row.currentLocation?.name ?? null,
        holderName: row.currentHolder?.name ?? null,
        rows: [],
      };
      group.rows.push({ currency: row.currency, amount: row.amount });
      groups.set(key, group);
    }

    return {
      entries: [...groups.values()].map((group) => ({
        locationName: group.locationName,
        holderName: group.holderName,
        count: group.rows.length,
        byCurrency: bucketByCurrency(group.rows),
      })),
      count: rows.length,
      byCurrency: bucketByCurrency(rows),
    };
  }

  async auditLogs(user: RequestUser, query: AuditLogQuery): Promise<Paginated<AuditLogView>> {
    const where: Prisma.AuditLogWhereInput = {
      organizationId: user.organizationId,
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.entityId ? { entityId: query.entityId } : {}),
      ...(query.action ? { action: { contains: query.action } } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: toDateOnly(query.from) } : {}),
              ...(query.to ? { lte: addDays(toDateOnly(query.to), 1) } : {}),
            },
          }
        : {}),
    };

    const skip = (query.page - 1) * query.pageSize;
    const [rows, total] = await this.prisma.db.$transaction([
      this.prisma.db.auditLog.findMany({
        where,
        include: { user: { select: { name: true, email: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: query.pageSize,
      }),
      this.prisma.db.auditLog.count({ where }),
    ]);

    return {
      data: rows.map((row) => ({
        id: row.id,
        action: row.action,
        entityType: row.entityType,
        entityId: row.entityId,
        userName: row.user?.name ?? null,
        userEmail: row.user?.email ?? null,
        ipAddress: row.ipAddress,
        deviceInfo: row.deviceInfo,
        before: row.beforeJson,
        after: row.afterJson,
        createdAt: row.createdAt.toISOString(),
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
}
