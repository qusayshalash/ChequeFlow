import { randomUUID } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';

import {
  ApiErrorCode,
  ChequeEventType,
  type ChequeImageSide,
  type ChequeImageView,
  type DuplicateChequeMatch,
} from '@cheque-flow/shared-types';

import { AppError } from '../../common/errors/app-error';
import { FieldEncryptionService } from '../../common/crypto/field-encryption.service';
import type { RequestUser } from '../../common/types/request-user';
import { AppConfigService } from '../../config/app-config.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditAction, AuditService, type AuditContext } from '../audit/audit.service';
import { DuplicateDetectorService } from '../cheques/duplicate-detector.service';
import { StorageService } from '../storage/storage.service';
import { detectMimeType, extensionFor, isAllowedUploadType } from '../storage/file-signature';

export interface UploadChequeImageInput {
  side: ChequeImageSide;
  capturedAt?: string | undefined;
  buffer: Buffer;
  /** Client-declared type; used only for logging, never trusted. */
  declaredMimeType: string;
  originalName: string;
}

export interface UploadChequeImageResult {
  image: ChequeImageView;
  duplicates: DuplicateChequeMatch[];
}

@Injectable()
export class ChequeImagesService {
  private readonly logger = new Logger(ChequeImagesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly config: AppConfigService,
    private readonly duplicates: DuplicateDetectorService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Validates, hashes, stores and registers a cheque image.
   *
   * The file type is taken from the magic bytes, the hash is used for
   * duplicate detection, and the object is written to a private bucket.
   */
  async upload(
    user: RequestUser,
    chequeId: string,
    input: UploadChequeImageInput,
    options: { allowDuplicate?: boolean } = {},
    auditMeta: Partial<AuditContext> = {},
  ): Promise<UploadChequeImageResult> {
    const cheque = await this.prisma.db.cheque.findFirst({
      where: { id: chequeId, organizationId: user.organizationId, deletedAt: null },
      select: { id: true, organizationId: true },
    });
    if (!cheque) throw AppError.notFound('Cheque', chequeId);

    const maxBytes = this.config.storage.maxUploadBytes;
    if (input.buffer.byteLength === 0) {
      throw new AppError(ApiErrorCode.VALIDATION_ERROR, 'Empty upload');
    }
    if (input.buffer.byteLength > maxBytes) {
      throw new AppError(ApiErrorCode.PAYLOAD_TOO_LARGE, 'Uploaded file exceeds the size limit', {
        details: { maxBytes },
      });
    }

    const detected = detectMimeType(input.buffer);
    if (!isAllowedUploadType(detected)) {
      this.logger.warn(
        `Rejected upload for cheque ${chequeId}: declared ${input.declaredMimeType}, detected ${detected ?? 'unknown'}`,
      );
      throw new AppError(ApiErrorCode.UNSUPPORTED_MEDIA_TYPE, 'Unsupported file type', {
        details: { detected: detected ?? 'unknown' },
      });
    }

    const imageHash = FieldEncryptionService.sha256(input.buffer);
    const duplicates = await this.duplicates.findByImageHash(
      user.organizationId,
      imageHash,
      chequeId,
    );
    DuplicateDetectorService.assertNoDuplicates(duplicates, options.allowDuplicate === true);

    // Re-uploading the identical image for the same side is a no-op rather
    // than an error: mobile clients retry uploads.
    const existing = await this.prisma.db.chequeImage.findFirst({
      where: { chequeId, side: input.side, imageHash },
    });
    if (existing) {
      return { image: ChequeImagesService.toView(existing), duplicates };
    }

    const imageId = randomUUID();
    const key = StorageService.buildChequeImageKey(
      user.organizationId,
      chequeId,
      imageId,
      extensionFor(detected),
    );

    await this.storage.putObject({
      key,
      body: input.buffer,
      contentType: detected,
      metadata: { chequeId, side: input.side },
    });

    const image = await this.prisma.db.$transaction(async (tx) => {
      const created = await tx.chequeImage.create({
        data: {
          id: imageId,
          chequeId,
          side: input.side,
          storageKey: key,
          mimeType: detected,
          fileSize: input.buffer.byteLength,
          imageHash,
          capturedAt: input.capturedAt ? new Date(input.capturedAt) : null,
          uploadedBy: user.id,
        },
      });

      await tx.chequeEvent.create({
        data: {
          chequeId,
          eventType: ChequeEventType.IMAGE_ADDED,
          performedBy: user.id,
          // The event type is rendered translated by the clients; a hard-coded
          // English note would leak into an Arabic timeline.
          notes: null,
        },
      });

      await this.audit.recordWithin(tx, {
        organizationId: user.organizationId,
        userId: user.id,
        action: AuditAction.CHEQUE_IMAGE_UPLOADED,
        entityType: 'cheque_image',
        entityId: created.id,
        after: { chequeId, side: input.side, fileSize: created.fileSize, mimeType: detected },
        ipAddress: auditMeta.ipAddress ?? null,
        deviceInfo: auditMeta.deviceInfo ?? null,
      });

      return created;
    });

    return { image: ChequeImagesService.toView(image), duplicates };
  }

  /** Issues a short-lived signed URL and audits the access. */
  async getSignedUrl(
    user: RequestUser,
    chequeId: string,
    imageId: string,
    auditMeta: Partial<AuditContext> = {},
  ): Promise<{ url: string; expiresIn: number }> {
    const image = await this.prisma.db.chequeImage.findFirst({
      where: { id: imageId, chequeId, cheque: { organizationId: user.organizationId } },
      select: { id: true, storageKey: true },
    });
    if (!image) throw AppError.notFound('Cheque image', imageId);

    const url = await this.storage.getSignedDownloadUrl(image.storageKey);

    // Viewing a cheque image is a sensitive, audited action.
    await this.audit.record({
      organizationId: user.organizationId,
      userId: user.id,
      action: AuditAction.CHEQUE_IMAGE_VIEWED,
      entityType: 'cheque_image',
      entityId: image.id,
      after: { chequeId },
      ipAddress: auditMeta.ipAddress ?? null,
      deviceInfo: auditMeta.deviceInfo ?? null,
    });

    return { url, expiresIn: this.storage.signedUrlTtlSeconds };
  }

  async list(user: RequestUser, chequeId: string): Promise<ChequeImageView[]> {
    const images = await this.prisma.db.chequeImage.findMany({
      where: { chequeId, cheque: { organizationId: user.organizationId, deletedAt: null } },
      orderBy: { createdAt: 'asc' },
    });
    return images.map(ChequeImagesService.toView);
  }

  private static toView(image: {
    id: string;
    side: ChequeImageSide;
    mimeType: string;
    fileSize: number;
    capturedAt: Date | null;
    createdAt: Date;
  }): ChequeImageView {
    return {
      id: image.id,
      side: image.side,
      mimeType: image.mimeType,
      fileSize: image.fileSize,
      capturedAt: image.capturedAt?.toISOString() ?? null,
      createdAt: image.createdAt.toISOString(),
    };
  }
}
