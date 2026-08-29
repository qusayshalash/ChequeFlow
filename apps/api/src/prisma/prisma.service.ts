import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';

import { createPrismaClient, PrismaClient } from '@cheque-flow/database';

import { AppConfigService } from '../config/app-config.service';

/**
 * Nest-managed PrismaClient.
 *
 * Query logging is disabled outside development because query parameters can
 * contain cheque amounts, names and account numbers.
 */
@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private readonly client: PrismaClient;

  constructor(config: AppConfigService) {
    this.client = createPrismaClient({
      databaseUrl: config.databaseUrl,
      logQueries: false,
    });
  }

  /** The PrismaClient instance; `PrismaService` delegates rather than extends. */
  get db(): PrismaClient {
    return this.client;
  }

  async onModuleInit(): Promise<void> {
    await this.client.$connect();
    this.logger.log('Database connection established');
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }
}
