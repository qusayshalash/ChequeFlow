import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';

import { Permission } from '@cheque-flow/shared-types';
import {
  createBankSchema,
  updateBankSchema,
  type CreateBankInput,
  type UpdateBankInput,
} from '@cheque-flow/validation';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { zodBody } from '../../common/pipes/zod-validation.pipe';
import type { RequestUser } from '../../common/types/request-user';
import { AuditService } from '../audit/audit.service';
import { ReferenceService } from './reference.service';

@ApiTags('reference')
@ApiBearerAuth()
@Controller()
export class ReferenceController {
  constructor(private readonly reference: ReferenceService) {}

  @Get('branches')
  @RequirePermissions(Permission.CHEQUE_VIEW)
  @ApiOperation({ summary: 'Branches of the current organization' })
  branches(@CurrentUser() user: RequestUser) {
    return this.reference.listBranches(user);
  }

  @Get('banks')
  @RequirePermissions(Permission.CHEQUE_VIEW)
  @ApiQuery({ name: 'country', required: false, example: 'SA' })
  @ApiOperation({ summary: 'Bank reference data' })
  banks(@CurrentUser() user: RequestUser, @Query('country') country?: string) {
    return this.reference.listBanks(user, country);
  }

  @Get('banks/manage')
  @RequirePermissions(Permission.SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Every bank this organization sees, hidden ones included' })
  banksForSettings(@CurrentUser() user: RequestUser) {
    return this.reference.listBanksForSettings(user);
  }

  @Post('banks')
  @RequirePermissions(Permission.SETTINGS_MANAGE)
  @ApiOperation({ summary: "Add a bank of this organization's own" })
  createBank(
    @CurrentUser() user: RequestUser,
    @Body(zodBody(createBankSchema)) body: CreateBankInput,
    @Req() request: Request,
  ) {
    return this.reference.createBank(user, body, AuditService.contextFromRequest(request));
  }

  @Patch('banks/:id')
  @RequirePermissions(Permission.SETTINGS_MANAGE)
  @ApiOperation({ summary: "Rename or hide one of this organization's own banks" })
  updateBank(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(updateBankSchema)) body: UpdateBankInput,
    @Req() request: Request,
  ) {
    return this.reference.updateBank(user, id, body, AuditService.contextFromRequest(request));
  }

  @Get('locations')
  @RequirePermissions(Permission.CHEQUE_VIEW)
  @ApiQuery({ name: 'branchId', required: false })
  @ApiOperation({ summary: 'Storage locations (safes, drawers, banks)' })
  locations(@CurrentUser() user: RequestUser, @Query('branchId') branchId?: string) {
    return this.reference.listLocations(user, branchId);
  }
}
