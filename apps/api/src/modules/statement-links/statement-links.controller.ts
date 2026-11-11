import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { Permission } from '@cheque-flow/shared-types';
import { createStatementLinkSchema, type CreateStatementLinkInput } from '@cheque-flow/validation';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { zodBody } from '../../common/pipes/zod-validation.pipe';
import type { RequestUser } from '../../common/types/request-user';
import { AuditService } from '../audit/audit.service';
import { StatementLinksService } from './statement-links.service';

/** Creating, listing and revoking a contact's share links. */
@ApiTags('statement-links')
@ApiBearerAuth()
@Controller('contacts/:contactId/statement-links')
export class StatementLinksController {
  constructor(private readonly links: StatementLinksService) {}

  @Post()
  @RequirePermissions(Permission.CONTACT_MANAGE)
  @ApiOperation({ summary: 'Make a link that shows this contact its statement (token shown once)' })
  create(
    @CurrentUser() user: RequestUser,
    @Param('contactId', ParseUUIDPipe) contactId: string,
    @Body(zodBody(createStatementLinkSchema)) body: CreateStatementLinkInput,
    @Req() request: Request,
  ) {
    return this.links.create(user, contactId, body, AuditService.contextFromRequest(request));
  }

  @Get()
  @RequirePermissions(Permission.CONTACT_MANAGE)
  @ApiOperation({ summary: "This contact's share links, newest first" })
  list(@CurrentUser() user: RequestUser, @Param('contactId', ParseUUIDPipe) contactId: string) {
    return this.links.list(user, contactId);
  }

  @Delete(':linkId')
  @RequirePermissions(Permission.CONTACT_MANAGE)
  @ApiOperation({ summary: 'Revoke a share link' })
  revoke(
    @CurrentUser() user: RequestUser,
    @Param('contactId', ParseUUIDPipe) contactId: string,
    @Param('linkId', ParseUUIDPipe) linkId: string,
    @Req() request: Request,
  ) {
    return this.links.revoke(user, contactId, linkId, AuditService.contextFromRequest(request));
  }
}
