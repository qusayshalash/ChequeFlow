import { Inject, Injectable, Logger } from '@nestjs/common';

import {
  ApiErrorCode,
  CHEQUE_EXTRACTED_FIELD_NAMES,
  computeOverallConfidence,
  ChequeAction,
  ChequeEventType,
  ChequeStatus,
  LOW_CONFIDENCE_THRESHOLD,
  OcrStatus,
  isLowConfidence,
  type ChequeExtractedFieldName,
  type ChequeExtractedFields,
  type ChequeExtractionResult,
  type OcrProvider,
} from '@cheque-flow/shared-types';
import { Prisma, moneyToString, toMoney } from '@cheque-flow/database';
import type { ReviewChequeInput } from '@cheque-flow/validation';

import { AppError } from '../../common/errors/app-error';
import { FieldEncryptionService } from '../../common/crypto/field-encryption.service';
import type { RequestUser } from '../../common/types/request-user';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditAction, AuditService, type AuditContext } from '../audit/audit.service';
import { ChequeActionsService } from '../cheques/cheque-actions.service';
import { DuplicateDetectorService } from '../cheques/duplicate-detector.service';
import { StorageService } from '../storage/storage.service';
import { toDateOnly } from '../cheques/cheque.service';
import { chequeDetailInclude, toIsoDate } from '../cheques/cheque.mapper';
import { OCR_PROVIDER } from './ocr.tokens';

export interface OcrSuggestion {
  extractionId: string;
  provider: string;
  status: OcrStatus;
  overallConfidence: number;
  fields: ChequeExtractedFields;
  /** Field names the reviewer must look at before confirming. */
  lowConfidenceFields: ChequeExtractedFieldName[];
  threshold: number;
}

/**
 * Runs OCR and stores the result as a *suggestion*.
 *
 * Nothing extracted here is written to the cheque itself. The values only
 * become cheque data once a human confirms them through {@link review}.
 */
@Injectable()
export class OcrService {
  private readonly logger = new Logger(OcrService.name);

  constructor(
    @Inject(OCR_PROVIDER) private readonly provider: OcrProvider,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly encryption: FieldEncryptionService,
    private readonly actions: ChequeActionsService,
    private readonly duplicates: DuplicateDetectorService,
    private readonly storage: StorageService,
  ) {}

  async process(user: RequestUser, chequeId: string): Promise<OcrSuggestion> {
    const cheque = await this.prisma.db.cheque.findFirst({
      where: { id: chequeId, organizationId: user.organizationId, deletedAt: null },
      include: { images: { select: { side: true, storageKey: true, mimeType: true } } },
    });
    if (!cheque) throw AppError.notFound('Cheque', chequeId);

    const usableImages = cheque.images.filter(
      (image): image is typeof image & { side: 'FRONT' | 'BACK' } =>
        image.side === 'FRONT' || image.side === 'BACK',
    );
    if (usableImages.length === 0) {
      throw new AppError(
        ApiErrorCode.VALIDATION_ERROR,
        'Upload a cheque image before running OCR',
        {
          fieldErrors: [{ path: 'images', message: 'validation.ocr.imageRequired' }],
        },
      );
    }

    await this.prisma.db.cheque.update({
      where: { id: chequeId },
      data: { ocrStatus: OcrStatus.PROCESSING },
    });

    // Only download the pixels for providers that actually read them.
    const images = await Promise.all(
      usableImages.map(async (image) => ({
        side: image.side,
        storageKey: image.storageKey,
        mimeType: image.mimeType,
        ...(this.provider.needsImageBytes === true
          ? { bytes: new Uint8Array(await this.storage.getObject(image.storageKey)) }
          : {}),
      })),
    );

    // Text-only providers match the scanned text against banks the
    // organization already deals with instead of guessing.
    const banks = await this.prisma.db.bank.findMany({ select: { name: true } });

    let result: ChequeExtractionResult;
    try {
      result = await this.provider.processCheque({
        chequeId: cheque.id,
        organizationId: cheque.organizationId,
        images,
        languageHints: ['ar', 'en'],
        expectedCurrency: cheque.currency,
        knownBankNames: banks.map((bank) => bank.name),
      });
    } catch (error) {
      this.logger.error(
        `OCR failed for cheque ${chequeId} with provider ${this.provider.name}`,
        error instanceof Error ? error.stack : undefined,
      );
      await this.prisma.db.$transaction([
        this.prisma.db.ocrExtraction.create({
          data: {
            chequeId,
            provider: this.provider.name,
            rawResultJson: Prisma.JsonNull,
            extractedFieldsJson: Prisma.JsonNull,
            confidenceJson: Prisma.JsonNull,
            processingStatus: OcrStatus.FAILED,
            // The provider error text may contain payload details; keep it short.
            errorMessage: 'OCR provider request failed',
            processedAt: new Date(),
          },
        }),
        this.prisma.db.cheque.update({
          where: { id: chequeId },
          data: { ocrStatus: OcrStatus.FAILED },
        }),
      ]);
      // Not an internal error: the request reached the provider and the
      // provider refused it. Reported as INTERNAL_ERROR, the screen said "an
      // unexpected error occurred" for a cause that was neither unexpected nor
      // ours — the first real run failed on `PERMISSION_DENIED: this API
      // method requires billing to be enabled`, which is a five-minute fix
      // nobody could see from the message.
      //
      // The provider's own text stays in the log rather than the response: it
      // carries project identifiers and request details that a signed-in user
      // has no reason to receive.
      throw new AppError(ApiErrorCode.SERVICE_UNAVAILABLE, 'OCR provider failed', {
        cause: error,
      });
    }

    const confidence: Record<string, number> = Object.fromEntries(
      CHEQUE_EXTRACTED_FIELD_NAMES.map((name) => [name, result.fields[name].confidence]),
    );

    const extraction = await this.prisma.db.$transaction(async (tx) => {
      const created = await tx.ocrExtraction.create({
        data: {
          chequeId,
          provider: result.provider,
          providerRequestId: result.providerRequestId,
          rawResultJson: result.raw as Prisma.InputJsonValue,
          extractedFieldsJson: result.fields as unknown as Prisma.InputJsonValue,
          confidenceJson: confidence,
          processingStatus: OcrStatus.COMPLETED,
          processedAt: new Date(),
        },
      });

      await tx.cheque.update({
        where: { id: chequeId },
        data: {
          ocrStatus: OcrStatus.COMPLETED,
          ocrOverallConfidence: new Prisma.Decimal(result.overallConfidence),
          // The cheque now waits for a human to confirm the suggestion.
          ...(cheque.status === ChequeStatus.DRAFT ? { status: ChequeStatus.PENDING_REVIEW } : {}),
        },
      });

      if (cheque.status === ChequeStatus.DRAFT) {
        await tx.chequeEvent.create({
          data: {
            chequeId,
            eventType: ChequeEventType.CREATED,
            fromStatus: ChequeStatus.DRAFT,
            toStatus: ChequeStatus.PENDING_REVIEW,
            performedBy: user.id,
            notes: null,
          },
        });
      }

      return created;
    });

    return {
      extractionId: extraction.id,
      provider: result.provider,
      status: OcrStatus.COMPLETED,
      overallConfidence: result.overallConfidence,
      fields: result.fields,
      lowConfidenceFields: (Object.keys(result.fields) as ChequeExtractedFieldName[]).filter(
        (name) => isLowConfidence(result.fields[name]),
      ),
      threshold: LOW_CONFIDENCE_THRESHOLD,
    };
  }

  /** Returns the latest suggestion for the review screen. */
  async latestSuggestion(user: RequestUser, chequeId: string): Promise<OcrSuggestion | null> {
    const cheque = await this.prisma.db.cheque.findFirst({
      where: { id: chequeId, organizationId: user.organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!cheque) throw AppError.notFound('Cheque', chequeId);

    const extraction = await this.prisma.db.ocrExtraction.findFirst({
      where: { chequeId, processingStatus: OcrStatus.COMPLETED },
      orderBy: { createdAt: 'desc' },
    });
    if (!extraction) return null;

    const fields = extraction.extractedFieldsJson as unknown as ChequeExtractedFields;
    return {
      extractionId: extraction.id,
      provider: extraction.provider,
      status: extraction.processingStatus,
      overallConfidence: computeOverallConfidence(fields),
      fields,
      lowConfidenceFields: (Object.keys(fields) as ChequeExtractedFieldName[]).filter((name) =>
        isLowConfidence(fields[name]),
      ),
      threshold: LOW_CONFIDENCE_THRESHOLD,
    };
  }

  /**
   * Applies the reviewer's confirmed values to the cheque and moves it out of
   * PENDING_REVIEW through the state machine.
   */
  async review(
    user: RequestUser,
    chequeId: string,
    input: ReviewChequeInput,
    auditMeta: Partial<AuditContext> = {},
    options: { allowDuplicate?: boolean } = {},
  ) {
    const cheque = await this.prisma.db.cheque.findFirst({
      where: { id: chequeId, organizationId: user.organizationId, deletedAt: null },
    });
    if (!cheque) throw AppError.notFound('Cheque', chequeId);
    if (cheque.version !== input.version) {
      throw AppError.versionConflict(input.version, cheque.version);
    }

    const confirmed = input.confirmed;

    // This is where a photographed cheque is first comparable with the rest.
    //
    // The capture screen creates the record before anything has been read: a
    // placeholder amount of 1.00 under a `TMP-` number, deliberately exempt
    // from duplicate detection, because a photograph of a cheque already on
    // file is a re-photograph and not a second cheque. The check was meant to
    // run here instead, on the values the reviewer confirms — and did not.
    //
    // So photographing a recorded cheque a second time filed it again in
    // silence. It happened: cheque 20000013 was photographed twice within two
    // hours and stored twice, identical in number, amount and due date, with
    // nothing shown to the person confirming the second one.
    const key = {
      chequeNumber: confirmed.chequeNumber ?? cheque.chequeNumber,
      amount: confirmed.amount ?? moneyToString(cheque.amount),
      dueDate: confirmed.dueDate ?? (toIsoDate(cheque.dueDate) ?? ''),
      bankId: confirmed.bankId === undefined ? cheque.bankId : confirmed.bankId,
    };
    const duplicates = await this.duplicates.findByBusinessKey({
      organizationId: user.organizationId,
      bankId: key.bankId,
      chequeNumber: key.chequeNumber,
      amount: key.amount,
      dueDate: key.dueDate,
      // Its own row is not a match for itself.
      excludeChequeId: chequeId,
    });
    DuplicateDetectorService.assertNoDuplicates(duplicates, options.allowDuplicate === true);

    // One transaction for both halves.
    //
    // The confirmed values used to be written here and the status change run
    // afterwards, on its own. So a transition the state machine refused — a
    // cheque no longer in PENDING_REVIEW, a stale version, a caller without
    // the permission — left the cheque carrying values it had never been
    // reviewed into, flagged `ocrStatus: REVIEWED`, still in its old status.
    // Measured on a real record: the confirmed number and 9500.00 were stored
    // while the request answered 409 and the cheque stayed DRAFT. A review
    // either happens or it does not.
    const updated = await this.prisma.db.$transaction(async (tx) => {
      await tx.cheque.update({
        where: { id: chequeId },
        data: {
          ...(confirmed.chequeNumber !== undefined ? { chequeNumber: confirmed.chequeNumber } : {}),
          ...(confirmed.amount !== undefined ? { amount: toMoney(confirmed.amount) } : {}),
          ...(confirmed.amountInWords !== undefined
            ? { amountInWords: confirmed.amountInWords }
            : {}),
          ...(confirmed.currency !== undefined ? { currency: confirmed.currency } : {}),
          ...(confirmed.issueDate !== undefined
            ? { issueDate: confirmed.issueDate ? toDateOnly(confirmed.issueDate) : null }
            : {}),
          ...(confirmed.dueDate !== undefined ? { dueDate: toDateOnly(confirmed.dueDate) } : {}),
          ...(confirmed.bankId !== undefined ? { bankId: confirmed.bankId } : {}),
          ...(confirmed.bankNameRaw !== undefined ? { bankNameRaw: confirmed.bankNameRaw } : {}),
          ...(confirmed.bankBranchRaw !== undefined
            ? { bankBranchRaw: confirmed.bankBranchRaw }
            : {}),
          ...(confirmed.accountNumber !== undefined
            ? { accountNumberEncrypted: this.encryption.encryptNullable(confirmed.accountNumber) }
            : {}),
          ...(confirmed.drawerName !== undefined ? { drawerName: confirmed.drawerName } : {}),
          ...(confirmed.originalPayeeName !== undefined
            ? { originalPayeeName: confirmed.originalPayeeName }
            : {}),
          ocrStatus: OcrStatus.REVIEWED,
        },
      });

      if (input.extractionId) {
        await tx.ocrExtraction.updateMany({
          where: { id: input.extractionId, chequeId },
          data: { processingStatus: OcrStatus.REVIEWED },
        });
      }

      await this.audit.recordWithin(tx, {
        organizationId: user.organizationId,
        userId: user.id,
        action: AuditAction.CHEQUE_REVIEWED,
        entityType: 'cheque',
        entityId: chequeId,
        before: { ocrStatus: cheque.ocrStatus },
        after: { confirmed, rejectedFields: input.rejectedFields },
        ipAddress: auditMeta.ipAddress ?? null,
        deviceInfo: auditMeta.deviceInfo ?? null,
      });

      // The status change goes through the state machine like any other — and
      // through this same transaction, so a refusal takes the confirmed values
      // down with it instead of leaving them behind.
      await this.actions.executeWithin(
        tx,
        user,
        chequeId,
        ChequeAction.REVIEW,
        { notes: input.notes },
        auditMeta,
      );

      return tx.cheque.findUniqueOrThrow({
        where: { id: chequeId },
        include: chequeDetailInclude,
      });
    });

    return this.actions.settle(updated, user);
  }
}
