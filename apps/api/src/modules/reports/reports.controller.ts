import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';

import { Permission } from '@cheque-flow/shared-types';
import {
  auditLogQuerySchema,
  cashFlowReportQuerySchema,
  custodyReportQuerySchema,
  depositSlipQuerySchema,
  dashboardQuerySchema,
  dueReportQuerySchema,
  type AuditLogQuery,
  type CashFlowReportQuery,
  type CustodyReportQuery,
  type DepositSlipQuery,
  type DashboardQuery,
  type DueReportQuery,
} from '@cheque-flow/validation';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { zodQuery } from '../../common/pipes/zod-validation.pipe';
import type { RequestUser } from '../../common/types/request-user';
import { ReportsService } from './reports.service';

@ApiTags('reports')
@ApiBearerAuth()
@Controller()
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('dashboard')
  @RequirePermissions(Permission.CHEQUE_VIEW)
  @ApiOperation({ summary: 'Dashboard totals and the latest activity' })
  @ApiQuery({ name: 'dueFrom', required: false, example: '2026-01-01' })
  @ApiQuery({ name: 'dueTo', required: false, example: '2026-12-31' })
  dashboard(
    @CurrentUser() user: RequestUser,
    @Query(zodQuery(dashboardQuerySchema)) query: DashboardQuery,
  ) {
    return this.reports.dashboard(user, query);
  }

  @Get('reports/due')
  @RequirePermissions(Permission.REPORT_VIEW)
  @ApiOperation({ summary: 'Cheques due in a window, including overdue ones' })
  due(
    @CurrentUser() user: RequestUser,
    @Query(zodQuery(dueReportQuerySchema)) query: DueReportQuery,
  ) {
    return this.reports.due(user, query);
  }

  @Get('reports/cash-flow')
  @RequirePermissions(Permission.REPORT_VIEW)
  @ApiOperation({ summary: 'Expected cash flow bucketed by day, week or month' })
  cashFlow(
    @CurrentUser() user: RequestUser,
    @Query(zodQuery(cashFlowReportQuerySchema)) query: CashFlowReportQuery,
  ) {
    return this.reports.cashFlow(user, query);
  }

  @Get('reports/deposit-slip')
  @RequirePermissions(Permission.REPORT_VIEW)
  @ApiOperation({
    summary: "The day's deposit run: cheques in hand and due, grouped by bank",
  })
  @ApiQuery({ name: 'on', required: false, example: '2026-09-30' })
  depositSlip(
    @CurrentUser() user: RequestUser,
    @Query(zodQuery(depositSlipQuerySchema)) query: DepositSlipQuery,
  ) {
    return this.reports.depositSlip(user, query);
  }

  @Get('reports/custody')
  @RequirePermissions(Permission.REPORT_VIEW)
  @ApiOperation({ summary: 'Which safe or employee currently holds each cheque' })
  custody(
    @CurrentUser() user: RequestUser,
    @Query(zodQuery(custodyReportQuerySchema)) query: CustodyReportQuery,
  ) {
    return this.reports.custody(user, query);
  }

  @Get('audit-logs')
  @RequirePermissions(Permission.AUDIT_VIEW)
  @ApiOperation({ summary: 'Audit trail (append-only)' })
  auditLogs(
    @CurrentUser() user: RequestUser,
    @Query(zodQuery(auditLogQuerySchema)) query: AuditLogQuery,
  ) {
    return this.reports.auditLogs(user, query);
  }
}
