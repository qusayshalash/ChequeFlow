import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';

import { Permission } from '@cheque-flow/shared-types';
import { restoreBackupSchema, type RestoreBackupInput } from '@cheque-flow/validation';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { zodBody } from '../../common/pipes/zod-validation.pipe';
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

  /**
   * Puts an archive back.
   *
   * Refuses unless the organization is empty — there is no merge, because the
   * append-only ledger cannot be cleared to make room for one. `confirm` must
   * be sent explicitly: this is not an action a stray click should reach.
   */
  @Post('restore')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Restore a JSON archive into an empty organization' })
  @ApiResponse({ status: 200, description: 'What was restored, and what could not be' })
  @ApiResponse({ status: 409, description: 'The organization already holds records' })
  restore(
    @CurrentUser() user: RequestUser,
    @Body(zodBody(restoreBackupSchema)) body: RestoreBackupInput,
    @Req() request: Request,
  ) {
    return this.backup.restore(user, body, AuditService.contextFromRequest(request));
  }
}
