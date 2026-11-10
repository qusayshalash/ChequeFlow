import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { Permission, type RoleView } from '@cheque-flow/shared-types';
import {
  updateRolePermissionsSchema,
  type UpdateRolePermissionsInput,
} from '@cheque-flow/validation';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { zodBody } from '../../common/pipes/zod-validation.pipe';
import type { RequestUser } from '../../common/types/request-user';
import { AuditService } from '../audit/audit.service';
import { RolesService } from './roles.service';

@ApiTags('roles')
@ApiBearerAuth()
@Controller('roles')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get()
  @RequirePermissions(Permission.USER_MANAGE)
  @ApiOperation({ summary: 'Each role and the permissions it grants here' })
  list(@CurrentUser() user: RequestUser): Promise<RoleView[]> {
    return this.roles.list(user);
  }

  @Patch(':id/permissions')
  @RequirePermissions(Permission.USER_MANAGE)
  @ApiOperation({ summary: 'Replace what a role grants (owner only; not the owner role)' })
  updatePermissions(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(updateRolePermissionsSchema)) body: UpdateRolePermissionsInput,
    @Req() request: Request,
  ): Promise<RoleView> {
    return this.roles.updatePermissions(user, id, body, AuditService.contextFromRequest(request));
  }
}
