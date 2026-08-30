import { Injectable } from '@nestjs/common';

import { AppConfigService } from '../../config/app-config.service';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { resolveOcrProvider } from '../ocr/ocr-provider.factory';

export interface ComponentStatus {
  /** `ok` — working. `degraded` — running on a fallback. `down` — unusable. */
  state: 'ok' | 'degraded' | 'down';
  /** A message key the clients translate, never a raw English string. */
  messageKey: string;
  /** Extra context for an operator; never contains a secret. */
  detail?: string;
}

export interface Diagnostics {
  ocr: ComponentStatus & { requested: string; effective: string };
  database: ComponentStatus;
  storage: ComponentStatus;
}

/**
 * Did the object store reply at all?
 *
 * Any HTTP status means it did — including 404 and 403, which say the service
 * is up and simply refused this particular request. Only a transport failure,
 * which carries no status, means it is unreachable.
 */
const BackupProbe = {
  answered(error: unknown): boolean {
    if (typeof error !== 'object' || error === null) return false;
    const metadata = (error as { $metadata?: { httpStatusCode?: number } }).$metadata;
    return typeof metadata?.httpStatusCode === 'number';
  },
};

/**
 * Whether the moving parts are actually working.
 *
 * Exists because the most common failure in this system is silent: OCR falling
 * back to synthetic data reads as "the scanner is bad at Arabic" rather than
 * "no credentials are configured". The startup log says so loudly, but nobody
 * reads a server log from a phone.
 */
@Injectable()
export class DiagnosticsService {
  constructor(
    private readonly config: AppConfigService,
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async collect(): Promise<Diagnostics> {
    const [database, storage] = await Promise.all([this.checkDatabase(), this.checkStorage()]);
    return { ocr: this.checkOcr(), database, storage };
  }

  private checkOcr(): Diagnostics['ocr'] {
    const resolution = resolveOcrProvider({
      ...this.config.ocr,
      isProduction: this.config.isProduction,
    });

    if (resolution.effective === 'mock' && resolution.requested !== 'mock') {
      return {
        state: 'degraded',
        requested: resolution.requested,
        effective: 'mock',
        messageKey: 'diagnostics.ocrFallback',
        // The reason names which variable is missing, not its value.
        ...(resolution.reason ? { detail: resolution.reason } : {}),
      };
    }

    if (resolution.effective === 'mock') {
      return {
        state: 'degraded',
        requested: 'mock',
        effective: 'mock',
        messageKey: 'diagnostics.ocrMock',
      };
    }

    return {
      state: 'ok',
      requested: resolution.requested,
      effective: resolution.effective,
      messageKey: 'diagnostics.ocrReady',
    };
  }

  private async checkDatabase(): Promise<ComponentStatus> {
    try {
      await this.prisma.db.$queryRaw`SELECT 1`;
      return { state: 'ok', messageKey: 'diagnostics.databaseOk' };
    } catch {
      return { state: 'down', messageKey: 'diagnostics.databaseDown' };
    }
  }

  /**
   * Storage is probed by reading a key that does not exist: a missing object
   * proves the store answered, while a connection error does not.
   *
   * The verdict comes from the HTTP status the SDK attaches, not from the error
   * message. The first version matched on the message and reported a healthy
   * store as down, because the AWS SDK sets `message` to "UnknownError" for a
   * bare 404 and puts the useful part in `name` and `$metadata`. A status panel
   * that cries wolf is worse than no status panel.
   */
  private async checkStorage(): Promise<ComponentStatus> {
    try {
      await this.storage.getObject('diagnostics/__probe__');
      return { state: 'ok', messageKey: 'diagnostics.storageOk' };
    } catch (error) {
      return BackupProbe.answered(error)
        ? { state: 'ok', messageKey: 'diagnostics.storageOk' }
        : { state: 'down', messageKey: 'diagnostics.storageDown' };
    }
  }
}
