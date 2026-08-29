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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { Permission, SystemRole, type Paginated, type UserView } from '@cheque-flow/shared-types';
import {
  createUserSchema,
  listUsersQuerySchema,
  updateUserSchema,
  type CreateUserInput,
  type ListUsersQuery,
  type UpdateUserInput,
} from '@cheque-flow/validation';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { zodBody, zodQuery } from '../../common/pipes/zod-validation.pipe';
import type { RequestUser } from '../../common/types/request-user';
import { AuditService } from '../audit/audit.service';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @RequirePermissions(Permission.USER_MANAGE)
  @ApiOperation({ summary: 'List the organization members' })
  list(
    @CurrentUser() user: RequestUser,
    @Query(zodQuery(listUsersQuerySchema)) query: ListUsersQuery,
  ): Promise<Paginated<UserView>> {
    return this.users.list(user, query);
  }

  @Get('roles')
  @RequirePermissions(Permission.USER_MANAGE)
  @ApiOperation({ summary: 'Role names that can be assigned' })
  roles(): { data: string[] } {
    return { data: Object.values(SystemRole) };
  }

  @Post()
  @RequirePermissions(Permission.USER_MANAGE)
  @ApiOperation({ summary: 'Add a member to the organization' })
  create(
    @CurrentUser() user: RequestUser,
    @Body(zodBody(createUserSchema)) body: CreateUserInput,
    @Req() request: Request,
  ): Promise<UserView> {
    return this.users.create(user, body, AuditService.contextFromRequest(request));
  }

  @Patch(':id')
  @RequirePermissions(Permission.USER_MANAGE)
  @ApiOperation({ summary: 'Update a member, their roles, status or password' })
  update(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(updateUserSchema)) body: UpdateUserInput,
    @Req() request: Request,
  ): Promise<UserView> {
    return this.users.update(user, id, body, AuditService.contextFromRequest(request));
  }
}
