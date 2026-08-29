import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
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
}
