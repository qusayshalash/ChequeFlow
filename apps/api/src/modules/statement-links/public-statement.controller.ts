import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { Public } from '../../common/decorators/public.decorator';
import { StatementLinksService } from './statement-links.service';

/**
 * The one read a link's holder can make, without an account.
 *
 * Rate-limited per address on the `auth` budget, the same as sign-in: a token
 * is a password-length secret, and guessing one is the attack.
 */
@ApiTags('statement-links')
@Controller('public/statements')
export class PublicStatementController {
  constructor(private readonly links: StatementLinksService) {}

  @Get(':token')
  @Public()
  @Throttle({ auth: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: "A contact's statement, by its share link" })
  read(@Param('token') token: string) {
    return this.links.read(token);
  }
}
