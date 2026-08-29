import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';

import { snoozeReminderSchema, type SnoozeReminderInput } from '@cheque-flow/validation';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AppError } from '../../common/errors/app-error';
import { zodBody } from '../../common/pipes/zod-validation.pipe';
import type { RequestUser } from '../../common/types/request-user';
import { RemindersService, type ReminderView } from './reminders.service';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class RemindersController {
  constructor(private readonly reminders: RemindersService) {}

  @Get()
  @ApiQuery({ name: 'limit', required: false, example: 50 })
  @ApiOperation({ summary: 'In-app reminders for the current user' })
  async list(
    @CurrentUser() user: RequestUser,
    @Query('limit') limit?: string,
  ): Promise<{ data: ReminderView[] }> {
    const parsed = Number.parseInt(limit ?? '50', 10);
    const take = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 100) : 50;
    return { data: await this.reminders.listForUser(user.id, take) };
  }

  @Post(':id/snooze')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Push a reminder into the future' })
  async snooze(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(snoozeReminderSchema)) body: SnoozeReminderInput,
  ): Promise<ReminderView> {
    const view = await this.reminders.snooze(user.id, id, body.minutes);
    // A reminder that belongs to someone else is indistinguishable from one
    // that does not exist, on purpose.
    if (!view) throw AppError.notFound('Reminder', id);
    return view;
  }

  @Post(':id/acknowledge')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark a reminder as dealt with' })
  async acknowledge(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ acknowledged: boolean }> {
    const done = await this.reminders.acknowledge(user.id, id);
    if (!done) throw AppError.notFound('Reminder', id);
    return { acknowledged: true };
  }
}
