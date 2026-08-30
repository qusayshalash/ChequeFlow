import { Controller, Get, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';

import { Permission } from '@cheque-flow/shared-types';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import type { RequestUser } from '../../common/types/request-user';
import { AuditService } from '../audit/audit.service';
import { BackupService } from './backup.service';

@ApiTags('backup')
@ApiBearerAuth()
@Controller('backup')
export class BackupController {
  constructor(private readonly backup: BackupService) {}

  @Get('export')
  // A backup is every record the organization has, so it sits behind the
  // highest permission rather than the export one used for a CSV of cheques.
  @RequirePermissions(Permission.SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Download a complete JSON archive of this organization' })
  async export(
    @CurrentUser() user: RequestUser,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const archive = await this.backup.export(user, AuditService.contextFromRequest(request));

    const filename = `chequeflow-backup-${new Date().toISOString().slice(0, 10)}.json`;
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    // Indented on purpose: the point of a JSON backup over a database dump is
    // that a person can open it and read it.
    response.send(JSON.stringify(archive, null, 2));
  }
}
