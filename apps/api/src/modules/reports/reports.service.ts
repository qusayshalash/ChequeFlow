import { Injectable } from '@nestjs/common';

import { ChequeStatus, type DashboardSummary, type Paginated } from '@cheque-flow/shared-types';
import { Prisma, moneyToString, sumMoney } from '@cheque-flow/database';
import type {
  AuditLogQuery,
  CashFlowReportQuery,
  CustodyReportQuery,
  DueReportQuery,
} from '@cheque-flow/validation';

import type { RequestUser } from '../../common/types/request-user';
import { PrismaService } from '../../prisma/prisma.service';
import { chequeEventInclude, toChequeEventView } from '../cheques/cheque.mapper';
import { chequeSummarySelect, toChequeSummary } from '../cheques/cheque.mapper';

/** Statuses that represent money the company still expects to collect. */
const OUTSTANDING: readonly ChequeStatus[] = [
  ChequeStatus.IN_HAND,
  ChequeStatus.RESERVED,
  ChequeStatus.DEPOSITED,
  ChequeStatus.TRANSFERRED,
  ChequeStatus.POSTPONED,
];

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

  /** Numbers shown on the dashboard home screen. */
  async dashboard(user: RequestUser): Promise<DashboardSummary> {
    const today = todayUtc();
    const in7Days = addDays(today, 7);
    const base = { organizationId: user.organizationId, deletedAt: null };

    const [inHand, dueToday, dueWithin7, bounced, organization, recentEvents] = await Promise.all([
      this.prisma.db.cheque.findMany({
        where: { ...base, status: { in: [ChequeStatus.IN_HAND, ChequeStatus.RESERVED] } },
        select: { amount: true },
      }),
      this.prisma.db.cheque.findMany({
        where: { ...base, status: { in: [...OUTSTANDING] }, dueDate: today },
        select: { amount: true },
      }),
      this.prisma.db.cheque.findMany({
        where: { ...base, status: { in: [...OUTSTANDING] }, dueDate: { gte: today, lte: in7Days } },
        select: { amount: true },
      }),
      this.prisma.db.cheque.findMany({
        where: { ...base, status: ChequeStatus.BOUNCED },
        select: { amount: true },
      }),
      this.prisma.db.organization.findUniqueOrThrow({
        where: { id: user.organizationId },
        select: { defaultCurrency: true },
      }),
      this.prisma.db.chequeEvent.findMany({
        where: { cheque: { organizationId: user.organizationId } },
        include: chequeEventInclude,
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);

    const total = (rows: Array<{ amount: Prisma.Decimal }>): string =>
      moneyToString(sumMoney(rows.map((row) => row.amount)));

    return {
      inHandCount: inHand.length,
      inHandTotal: total(inHand),
      dueTodayCount: dueToday.length,
      dueTodayTotal: total(dueToday),
      dueWithin7DaysCount: dueWithin7.length,
      dueWithin7DaysTotal: total(dueWithin7),
      bouncedCount: bounced.length,
      bouncedTotal: total(bounced),
      currency: organization.defaultCurrency,
      recentEvents: recentEvents.map(toChequeEventView),
    };
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

    const cheques = rows.map(toChequeSummary);
    const overdue = cheques.filter((cheque) => toDateOnly(cheque.dueDate) < today);

    return {
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
      count: cheques.length,
      total: moneyToString(sumMoney(cheques.map((cheque) => cheque.amount))),
      overdueCount: overdue.length,
      overdueTotal: moneyToString(sumMoney(overdue.map((cheque) => cheque.amount))),
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
      select: { amount: true, dueDate: true, direction: true },
      orderBy: { dueDate: 'asc' },
    });

    const buckets = new Map<string, { inflow: Prisma.Decimal[]; outflow: Prisma.Decimal[] }>();
    for (const row of rows) {
      const key = ReportsService.bucketKey(row.dueDate, query.granularity);
      const bucket = buckets.get(key) ?? { inflow: [], outflow: [] };
      if (row.direction === 'OUTGOING') bucket.outflow.push(row.amount);
      else bucket.inflow.push(row.amount);
      buckets.set(key, bucket);
    }

    const periods = [...buckets.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, bucket]) => {
        const inflow = sumMoney(bucket.inflow);
        const outflow = sumMoney(bucket.outflow);
        return {
          period,
          inflow: moneyToString(inflow),
          outflow: moneyToString(outflow),
          net: moneyToString(inflow.minus(outflow)),
        };
      });

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
        currentLocation: { select: { id: true, name: true, type: true } },
        currentHolder: { select: { id: true, name: true } },
      },
    });

    const groups = new Map<
      string,
      { locationName: string | null; holderName: string | null; amounts: Prisma.Decimal[] }
    >();

    for (const row of rows) {
      const key = `${row.currentLocation?.id ?? 'none'}:${row.currentHolder?.id ?? 'none'}`;
      const group = groups.get(key) ?? {
        locationName: row.currentLocation?.name ?? null,
        holderName: row.currentHolder?.name ?? null,
        amounts: [],
      };
      group.amounts.push(row.amount);
      groups.set(key, group);
    }

    return {
      entries: [...groups.values()].map((group) => ({
        locationName: group.locationName,
        holderName: group.holderName,
        count: group.amounts.length,
        total: moneyToString(sumMoney(group.amounts)),
      })),
      count: rows.length,
      total: moneyToString(sumMoney(rows.map((row) => row.amount))),
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
