import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { Permission } from '@cheque-flow/shared-types';
import {
  createContactSchema,
  listContactsQuerySchema,
  mergeContactsSchema,
  updateContactSchema,
  type CreateContactInput,
  type ListContactsQuery,
  type MergeContactsInput,
  type UpdateContactInput,
} from '@cheque-flow/validation';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { zodBody, zodQuery } from '../../common/pipes/zod-validation.pipe';
import type { RequestUser } from '../../common/types/request-user';
import { AuditService } from '../audit/audit.service';
import { ContactsService } from './contacts.service';

@ApiTags('contacts')
@ApiBearerAuth()
@Controller('contacts')
export class ContactsController {
  constructor(private readonly contacts: ContactsService) {}

  @Get()
  @RequirePermissions(Permission.CHEQUE_VIEW)
  @ApiOperation({ summary: 'List contacts' })
  list(
    @CurrentUser() user: RequestUser,
    @Query(zodQuery(listContactsQuerySchema)) query: ListContactsQuery,
  ) {
    return this.contacts.list(user, query);
  }

  @Post()
  @RequirePermissions(Permission.CONTACT_MANAGE)
  @ApiOperation({ summary: 'Create a contact' })
  create(
    @CurrentUser() user: RequestUser,
    @Body(zodBody(createContactSchema)) body: CreateContactInput,
    @Req() request: Request,
  ) {
    return this.contacts.create(user, body, AuditService.contextFromRequest(request));
  }

  @Post('merge')
  @RequirePermissions(Permission.CONTACT_MANAGE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Merge a duplicate contact into the one that should survive' })
  merge(
    @CurrentUser() user: RequestUser,
    @Body(zodBody(mergeContactsSchema)) body: MergeContactsInput,
    @Req() request: Request,
  ) {
    return this.contacts.merge(user, body, AuditService.contextFromRequest(request));
  }

  @Get(':id')
  @RequirePermissions(Permission.CHEQUE_VIEW)
  @ApiOperation({ summary: 'Contact details' })
  findOne(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.contacts.findById(user, id);
  }

  @Patch(':id')
  @RequirePermissions(Permission.CONTACT_MANAGE)
  @ApiOperation({ summary: 'Update a contact' })
  update(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(updateContactSchema)) body: UpdateContactInput,
    @Req() request: Request,
  ) {
    return this.contacts.update(user, id, body, AuditService.contextFromRequest(request));
  }

  @Get(':id/statement')
  @RequirePermissions(Permission.CHEQUE_VIEW)
  @ApiOperation({ summary: 'Per-currency position and cheque history for one contact' })
  statement(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.contacts.statement(user, id);
  }

  @Delete(':id')
  @RequirePermissions(Permission.CONTACT_MANAGE)
  @ApiOperation({
    summary: 'Delete a contact, or deactivate it when it appears in cheque history',
  })
  remove(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ) {
    return this.contacts.remove(user, id, AuditService.contextFromRequest(request));
  }
}
