import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { AppConfigService } from '../../config/app-config.service';

export interface PutObjectInput {
  key: string;
  body: Buffer;
  contentType: string;
  /** Small, non-sensitive metadata only; never PII. */
  metadata?: Record<string, string>;
}

/**
 * S3-compatible object storage (MinIO locally).
 *
 * The bucket is private: images are only ever served through short-lived
 * signed URLs, never through a public object URL.
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly signedUrlTtl: number;

  constructor(private readonly config: AppConfigService) {
    const storage = config.storage;
    this.bucket = storage.bucket;
    this.signedUrlTtl = storage.signedUrlTtl;
    this.client = new S3Client({
      region: storage.region,
      endpoint: storage.endpoint,
      forcePathStyle: storage.forcePathStyle,
      credentials: {
        accessKeyId: storage.accessKeyId,
        secretAccessKey: storage.secretAccessKey,
      },
    });
  }

  async onModuleInit(): Promise<void> {
    // In development the bucket may not exist yet; create it rather than
    // failing every upload with an opaque error.
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      if (this.config.isProduction) {
        this.logger.error(`Bucket "${this.bucket}" is not reachable`);
        return;
      }
      try {
        await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
        this.logger.log(`Created development bucket "${this.bucket}"`);
      } catch (error) {
        this.logger.warn(
          `Object storage is not reachable at ${this.config.storage.endpoint}; uploads will fail until it is running`,
        );
        this.logger.debug(error instanceof Error ? error.message : String(error));
      }
    }
  }

  /** Builds the storage key for a cheque image. Keys are never guessable. */
  static buildChequeImageKey(
    organizationId: string,
    chequeId: string,
    imageId: string,
    extension: string,
  ): string {
    return `organizations/${organizationId}/cheques/${chequeId}/${imageId}.${extension}`;
  }

  async putObject(input: PutObjectInput): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: input.key,
        Body: input.body,
        ContentType: input.contentType,
        Metadata: input.metadata,
      }),
    );
  }

  /** Downloads an object's bytes. Used by OCR providers that read the image. */
  async getObject(key: string): Promise<Buffer> {
    const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    if (!result.Body) {
      throw new Error(`Object ${key} has no body`);
    }
    return Buffer.from(await result.Body.transformToByteArray());
  }

  /** Short-lived signed URL; the caller must have `cheque.view_image`. */
  async getSignedDownloadUrl(key: string, ttlSeconds?: number): Promise<string> {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn: ttlSeconds ?? this.signedUrlTtl,
    });
  }

  get signedUrlTtlSeconds(): number {
    return this.signedUrlTtl;
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
