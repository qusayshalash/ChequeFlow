import { Injectable, Logger } from '@nestjs/common';

import type { DevicePlatform } from '@cheque-flow/shared-types';

import { AppConfigService } from '../../config/app-config.service';
import { PrismaService } from '../../prisma/prisma.service';
import type { RequestUser } from '../../common/types/request-user';

/**
 * The phones that have asked to be told about cheques.
 *
 * Keyed by the push token rather than by the person, because the token is what
 * the device owns. A phone handed to a colleague signs in as somebody else and
 * has to start delivering to them; registering by token and reassigning its
 * owner is what makes that happen, instead of the device quietly notifying
 * whoever first set it up.
 */
@Injectable()
export class DevicesService {
  private readonly logger = new Logger(DevicesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  /**
   * Records a device, or moves an existing one to this user.
   *
   * Also stamps `lastSeenAt`, which is the only evidence the app is still
   * installed: the app registers on every sign-in and every cold start, so a
   * token that has gone quiet for months belongs to a phone that is gone.
   */
  async register(user: RequestUser, token: string, platform: DevicePlatform): Promise<void> {
    await this.prisma.db.deviceToken.upsert({
      where: { token },
      create: {
        token,
        platform,
        userId: user.id,
        organizationId: user.organizationId,
      },
      update: {
        platform,
        userId: user.id,
        organizationId: user.organizationId,
        lastSeenAt: new Date(),
      },
    });
  }

  /**
   * Forgets a device.
   *
   * Scoped to the caller: signing out must not let one account silence another
   * account's phone by guessing its token.
   */
  async forget(user: RequestUser, token: string): Promise<boolean> {
    const removed = await this.prisma.db.deviceToken.deleteMany({
      where: { token, userId: user.id },
    });
    return removed.count > 0;
  }

  /** Every live token for these people, for one sweep to deliver to. */
  async tokensFor(userIds: readonly string[]): Promise<Map<string, string[]>> {
    if (userIds.length === 0) return new Map();

    const cutoff = new Date(Date.now() - this.config.push.tokenTtlDays * 24 * 60 * 60 * 1000);
    const rows = await this.prisma.db.deviceToken.findMany({
      where: { userId: { in: [...userIds] }, lastSeenAt: { gte: cutoff } },
      select: { userId: true, token: true },
    });

    const byUser = new Map<string, string[]>();
    for (const row of rows) {
      const existing = byUser.get(row.userId);
      if (existing) existing.push(row.token);
      else byUser.set(row.userId, [row.token]);
    }
    return byUser;
  }

  /**
   * Drops tokens the push service has declared dead.
   *
   * Without this a wiped phone keeps its row forever and every sweep pays to
   * tell it nothing.
   */
  async dropDead(tokens: readonly string[]): Promise<void> {
    if (tokens.length === 0) return;
    const removed = await this.prisma.db.deviceToken.deleteMany({
      where: { token: { in: [...tokens] } },
    });
    if (removed.count > 0) {
      this.logger.log(`Dropped ${removed.count} device token(s) the push service rejected`);
    }
  }
}
