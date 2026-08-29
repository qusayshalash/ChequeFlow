import { z } from 'zod';

import {
  ChequeDirection,
  ChequeImageSide,
  ChequeStatus,
  CHEQUE_EXTRACTED_FIELD_NAMES,
} from '@cheque-flow/shared-types';

import {
  chequeNumberSchema,
  currencySchema,
  isoDateSchema,
  isoDateTimeSchema,
  longTextSchema,
  moneySchema,
  optionalText,
  paginationSchema,
  shortTextSchema,
  uuidSchema,
} from './primitives.js';

export const chequeDirectionSchema = z.enum(
  Object.values(ChequeDirection) as [ChequeDirection, ...ChequeDirection[]],
);
export const chequeStatusSchema = z.enum(
  Object.values(ChequeStatus) as [ChequeStatus, ...ChequeStatus[]],
);
export const chequeImageSideSchema = z.enum(
  Object.values(ChequeImageSide) as [ChequeImageSide, ...ChequeImageSide[]],
);

/**
 * Cheque creation payload.
 *
 * `organizationId` is intentionally absent: it is always taken from the
 * authenticated session and never accepted from a client.
 */
export const createChequeSchema = z
  .object({
    direction: chequeDirectionSchema,
    chequeNumber: chequeNumberSchema,
    amount: moneySchema,
    currency: currencySchema,
    issueDate: isoDateSchema.nullish().transform((v) => v ?? null),
    dueDate: isoDateSchema,
    receivedDate: isoDateSchema.nullish().transform((v) => v ?? null),
    branchId: uuidSchema.nullish().transform((v) => v ?? null),
    bankId: uuidSchema.nullish().transform((v) => v ?? null),
    bankNameRaw: optionalText(255),
    bankBranchRaw: optionalText(255),
    /** Plain account number; encrypted at rest by the API before persisting. */
    accountNumber: optionalText(64),
    drawerName: optionalText(255),
    /** The party the cheque was originally received from. */
    originalSourceId: uuidSchema.nullish().transform((v) => v ?? null),
    originalPayeeName: optionalText(255),
    currentLocationId: uuidSchema.nullish().transform((v) => v ?? null),
    purpose: optionalText(255),
    referenceNumber: optionalText(64),
    notes: optionalText(2000),
  })
  .refine((data) => data.issueDate === null || data.dueDate >= data.issueDate, {
    message: 'validation.cheque.dueBeforeIssue',
    path: ['dueDate'],
  });
export type CreateChequeInput = z.infer<typeof createChequeSchema>;

/**
 * Partial update of cheque data (never of `status` — status only ever changes
 * through the state machine actions below).
 */
export const updateChequeSchema = z.object({
  chequeNumber: chequeNumberSchema.optional(),
  amount: moneySchema.optional(),
  currency: currencySchema.optional(),
  issueDate: isoDateSchema.nullish(),
  dueDate: isoDateSchema.optional(),
  receivedDate: isoDateSchema.nullish(),
  bankId: uuidSchema.nullish(),
  bankNameRaw: optionalText(255).optional(),
  bankBranchRaw: optionalText(255).optional(),
  accountNumber: optionalText(64).optional(),
  drawerName: optionalText(255).optional(),
  originalSourceId: uuidSchema.nullish(),
  originalPayeeName: optionalText(255).optional(),
  purpose: optionalText(255).optional(),
  referenceNumber: optionalText(64).optional(),
  notes: optionalText(2000).optional(),
  /** Optimistic locking: must match the version the client last read. */
  version: z.coerce.number().int().min(1),
  /** Required when correcting data after review — recorded in the audit log. */
  reason: longTextSchema.optional(),
});
export type UpdateChequeInput = z.infer<typeof updateChequeSchema>;

export const listChequesQuerySchema = paginationSchema.extend({
  search: z.string().trim().max(120).optional(),
  chequeNumber: z.string().trim().max(32).optional(),
  status: z
    .union([chequeStatusSchema, z.array(chequeStatusSchema)])
    .optional()
    .transform((value) =>
      value === undefined ? undefined : Array.isArray(value) ? value : [value],
    ),
  direction: chequeDirectionSchema.optional(),
  branchId: uuidSchema.optional(),
  bankId: uuidSchema.optional(),
  sourceId: uuidSchema.optional(),
  recipientId: uuidSchema.optional(),
  locationId: uuidSchema.optional(),
  dueFrom: isoDateSchema.optional(),
  dueTo: isoDateSchema.optional(),
  amountMin: moneySchema.optional(),
  amountMax: moneySchema.optional(),
  sortBy: z.enum(['dueDate', 'amount', 'createdAt', 'chequeNumber', 'status']).default('dueDate'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});
export type ListChequesQuery = z.infer<typeof listChequesQuerySchema>;

/** Fields shared by every state machine action endpoint. */
const actionBaseSchema = z.object({
  notes: longTextSchema.optional(),
  eventDate: isoDateTimeSchema.optional(),
  /** Second approver, for organizations that require dual approval. */
  approvedBy: uuidSchema.optional(),
  version: z.coerce.number().int().min(1).optional(),
});

export const receiveChequeSchema = actionBaseSchema.extend({
  /** Contact the cheque was received from. */
  fromContactId: uuidSchema,
  /** Where the cheque is now stored. */
  toLocationId: uuidSchema,
  /** Employee who physically holds it, defaults to the acting user. */
  toUserId: uuidSchema.optional(),
  receivedDate: isoDateSchema.optional(),
});
export type ReceiveChequeInput = z.infer<typeof receiveChequeSchema>;

export const handoverChequeSchema = actionBaseSchema.extend({
  /** Supplier or third party the cheque is handed to. */
  toContactId: uuidSchema,
  toLocationId: uuidSchema.optional(),
  proofAttachmentId: uuidSchema.optional(),
});
export type HandoverChequeInput = z.infer<typeof handoverChequeSchema>;

export const depositChequeSchema = actionBaseSchema.extend({
  bankAccountId: uuidSchema.optional(),
  toLocationId: uuidSchema,
  depositDate: isoDateSchema.optional(),
});
export type DepositChequeInput = z.infer<typeof depositChequeSchema>;

export const clearChequeSchema = actionBaseSchema.extend({
  clearedDate: isoDateSchema.optional(),
});
export type ClearChequeInput = z.infer<typeof clearChequeSchema>;

export const bounceChequeSchema = actionBaseSchema.extend({
  reason: shortTextSchema,
  bouncedDate: isoDateSchema.optional(),
});
export type BounceChequeInput = z.infer<typeof bounceChequeSchema>;

export const returnChequeSchema = actionBaseSchema.extend({
  toContactId: uuidSchema.optional(),
  reason: shortTextSchema,
});
export type ReturnChequeInput = z.infer<typeof returnChequeSchema>;

export const postponeChequeSchema = actionBaseSchema.extend({
  newDueDate: isoDateSchema,
  reason: shortTextSchema,
});
export type PostponeChequeInput = z.infer<typeof postponeChequeSchema>;

export const cancelChequeSchema = actionBaseSchema.extend({
  reason: shortTextSchema,
});
export type CancelChequeInput = z.infer<typeof cancelChequeSchema>;

export const markLostChequeSchema = actionBaseSchema.extend({
  reason: shortTextSchema,
});
export type MarkLostChequeInput = z.infer<typeof markLostChequeSchema>;

export const uploadImageMetadataSchema = z.object({
  side: chequeImageSideSchema,
  capturedAt: isoDateTimeSchema.optional(),
});
export type UploadImageMetadataInput = z.infer<typeof uploadImageMetadataSchema>;

/**
 * Reviewer decision on OCR output: the confirmed value for each field the
 * reviewer accepted or corrected. Nothing extracted by OCR is trusted until it
 * arrives here.
 */
export const reviewChequeSchema = z.object({
  extractionId: uuidSchema.optional(),
  confirmed: z.object({
    chequeNumber: chequeNumberSchema.optional(),
    amount: moneySchema.optional(),
    currency: currencySchema.optional(),
    issueDate: isoDateSchema.nullish(),
    dueDate: isoDateSchema.optional(),
    bankId: uuidSchema.nullish(),
    bankNameRaw: optionalText(255).optional(),
    bankBranchRaw: optionalText(255).optional(),
    accountNumber: optionalText(64).optional(),
    drawerName: optionalText(255).optional(),
    originalPayeeName: optionalText(255).optional(),
  }),
  /** Fields the reviewer explicitly rejected, for OCR quality metrics. */
  rejectedFields: z.array(z.enum(CHEQUE_EXTRACTED_FIELD_NAMES)).default([]),
  notes: longTextSchema.optional(),
  version: z.coerce.number().int().min(1),
});
export type ReviewChequeInput = z.infer<typeof reviewChequeSchema>;
