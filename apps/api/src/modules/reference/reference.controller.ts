import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';

import { Permission } from '@cheque-flow/shared-types';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import type { RequestUser } from '../../common/types/request-user';
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
  banks(@Query('country') country?: string) {
    return this.reference.listBanks(country);
  }

  @Get('locations')
  @RequirePermissions(Permission.CHEQUE_VIEW)
  @ApiQuery({ name: 'branchId', required: false })
  @ApiOperation({ summary: 'Storage locations (safes, drawers, banks)' })
  locations(@CurrentUser() user: RequestUser, @Query('branchId') branchId?: string) {
    return this.reference.listLocations(user, branchId);
  }
}
