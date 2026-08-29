import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Permission } from '@cheque-flow/shared-types';
import {
  auditLogQuerySchema,
  cashFlowReportQuerySchema,
  custodyReportQuerySchema,
  dueReportQuerySchema,
  type AuditLogQuery,
  type CashFlowReportQuery,
  type CustodyReportQuery,
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
  dashboard(@CurrentUser() user: RequestUser) {
    return this.reports.dashboard(user);
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
