import { z } from 'zod';

import {
  ChequeDirection,
  ChequeImageSide,
  ChequeStatus,
  CHEQUE_EXTRACTED_FIELD_NAMES,
  MAX_SERIAL_CHEQUES,
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
 * Every field a cheque can be created with.
 *
 * `organizationId` is intentionally absent: it is always taken from the
 * authenticated session and never accepted from a client.
 *
 * Kept as a plain object so the batch schema below can reuse it — a
 * `.refine()`d schema cannot be `.omit()`ed, and copying twenty field
 * definitions is how the two payloads would quietly drift apart.
 */
const chequeCoreObject = z.object({
  direction: chequeDirectionSchema,
  chequeNumber: chequeNumberSchema,
  amount: moneySchema,
  /** The amount as written in letters; in a dispute it prevails over digits. */
  amountInWords: optionalText(255),
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
});

/** A single cheque, entered on its own. */
export const createChequeSchema = chequeCoreObject.refine(
  (data) => data.issueDate === null || data.dueDate >= data.issueDate,
  { message: 'validation.cheque.dueBeforeIssue', path: ['dueDate'] },
);
export type CreateChequeInput = z.infer<typeof createChequeSchema>;

/**
 * One cheque inside a serial batch — only what differs from row to row.
 *
 * Everything else (bank, drawer, currency, direction, custody) is written once
 * at the top of the batch, because a book of cheques torn from the same
 * chequebook shares all of it.
 */
export const serialChequeRowSchema = z.object({
  chequeNumber: chequeNumberSchema,
  amount: moneySchema,
  amountInWords: optionalText(255),
  dueDate: isoDateSchema,
});
export type SerialChequeRow = z.infer<typeof serialChequeRowSchema>;

/**
 * Creating a run of serial cheques in one request.
 *
 * The batch is all-or-nothing on the server. Half a cheque book recorded is
 * worse than none: the missing half is invisible, while a failed batch is
 * obvious and can simply be retried.
 */
export const createChequeBatchSchema = chequeCoreObject
  .omit({ chequeNumber: true, amount: true, amountInWords: true, dueDate: true })
  .extend({
    cheques: z.array(serialChequeRowSchema).min(1).max(MAX_SERIAL_CHEQUES),
  })
  .superRefine((data, ctx) => {
    // Two rows carrying the same number are always a typo, and the database
    // would happily store both.
    const seen = new Map<string, number>();
    data.cheques.forEach((row, index) => {
      const key = row.chequeNumber.toUpperCase();
      const first = seen.get(key);
      if (first === undefined) {
        seen.set(key, index);
        return;
      }
      ctx.addIssue({
        code: 'custom',
        message: 'validation.cheque.duplicateNumberInBatch',
        path: ['cheques', index, 'chequeNumber'],
      });
    });

    if (data.issueDate === null) return;
    data.cheques.forEach((row, index) => {
      if (row.dueDate < data.issueDate!) {
        ctx.addIssue({
          code: 'custom',
          message: 'validation.cheque.dueBeforeIssue',
          path: ['cheques', index, 'dueDate'],
        });
      }
    });
  });
export type CreateChequeBatchInput = z.infer<typeof createChequeBatchSchema>;

/**
 * Partial update of cheque data (never of `status` — status only ever changes
 * through the state machine actions below).
 */
export const updateChequeSchema = z.object({
  chequeNumber: chequeNumberSchema.optional(),
  amount: moneySchema.optional(),
  amountInWords: optionalText(255).optional(),
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
  currency: currencySchema.optional(),
  /**
   * Past due and still uncollected. Sent as a string because it arrives in a
   * query string; `false` explicitly excludes overdue cheques.
   */
  overdue: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
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
  /** Bank charge for the returned cheque, recorded against the cheque. */
  fee: moneySchema.optional(),
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
    amountInWords: optionalText(255).optional(),
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
