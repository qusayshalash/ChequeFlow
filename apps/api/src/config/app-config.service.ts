import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from './env.schema';

/**
 * Typed accessor over the validated environment. Modules depend on this rather
 * than reading `process.env`, which keeps configuration mockable in tests.
 */
@Injectable()
export class AppConfigService {
  constructor(private readonly config: ConfigService<Env, true>) {}

  private get<K extends keyof Env>(key: K): Env[K] {
    return this.config.get(key, { infer: true });
  }

  get nodeEnv(): Env['NODE_ENV'] {
    return this.get('NODE_ENV');
  }

  get isProduction(): boolean {
    return this.nodeEnv === 'production';
  }

  get port(): number {
    return this.get('API_PORT');
  }

  get globalPrefix(): string {
    return this.get('API_GLOBAL_PREFIX');
  }

  get corsOrigins(): string[] {
    return this.get('CORS_ORIGINS');
  }

  get trustProxy(): boolean {
    return this.get('TRUST_PROXY');
  }

  get databaseUrl(): string {
    return this.get('DATABASE_URL');
  }

  get redisUrl(): string {
    return this.get('REDIS_URL');
  }

  get jwt() {
    return {
      accessSecret: this.get('JWT_ACCESS_SECRET'),
      refreshSecret: this.get('JWT_REFRESH_SECRET'),
      accessTtl: this.get('JWT_ACCESS_TTL'),
      refreshTtl: this.get('JWT_REFRESH_TTL'),
      issuer: this.get('JWT_ISSUER'),
      audience: this.get('JWT_AUDIENCE'),
    };
  }

  get fieldEncryptionKey(): Buffer {
    return Buffer.from(this.get('FIELD_ENCRYPTION_KEY'), 'base64');
  }

  get rateLimits() {
    return {
      auth: this.get('RATE_LIMIT_AUTH_PER_MINUTE'),
      upload: this.get('RATE_LIMIT_UPLOAD_PER_MINUTE'),
      ocr: this.get('RATE_LIMIT_OCR_PER_MINUTE'),
      default: this.get('RATE_LIMIT_DEFAULT_PER_MINUTE'),
    };
  }

  get storage() {
    return {
      endpoint: this.get('S3_ENDPOINT'),
      region: this.get('S3_REGION'),
      bucket: this.get('S3_BUCKET'),
      accessKeyId: this.get('S3_ACCESS_KEY_ID'),
      secretAccessKey: this.get('S3_SECRET_ACCESS_KEY'),
      forcePathStyle: this.get('S3_FORCE_PATH_STYLE'),
      signedUrlTtl: this.get('S3_SIGNED_URL_TTL'),
      maxUploadBytes: this.get('MAX_UPLOAD_SIZE_BYTES'),
    };
  }

  get ocr() {
    return {
      provider: this.get('OCR_PROVIDER'),
      mockLatencyMs: this.get('OCR_MOCK_LATENCY_MS'),
      mockSeed: this.get('OCR_MOCK_SEED'),
      anthropicApiKey: this.get('ANTHROPIC_API_KEY'),
      claudeModel: this.get('OCR_CLAUDE_MODEL'),
      claudeMaxTokens: this.get('OCR_CLAUDE_MAX_TOKENS'),
      googleKeyFile: this.get('GOOGLE_VISION_KEY_FILE'),
      googleApplicationCredentials: this.get('GOOGLE_APPLICATION_CREDENTIALS'),
    };
  }

  get reminders() {
    return {
      offsetDays: this.get('REMINDER_OFFSET_DAYS'),
      overdueDays: this.get('REMINDER_OVERDUE_DAYS'),
    };
  }
}
