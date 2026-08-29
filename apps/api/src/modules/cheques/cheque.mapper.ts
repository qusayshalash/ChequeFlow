import type {
  ChequeDetailView,
  ChequeEventView,
  ChequeSummaryView,
  Permission,
} from '@cheque-flow/shared-types';
import { allowedActionsForUser } from '@cheque-flow/shared-types';
import { moneyToString, type Prisma } from '@cheque-flow/database';

import { type FieldEncryptionService } from '../../common/crypto/field-encryption.service';

/** Prisma selection used for cheque list rows. */
export const chequeSummarySelect = {
  id: true,
  direction: true,
  chequeNumber: true,
  amount: true,
  currency: true,
  dueDate: true,
  status: true,
  bankNameRaw: true,
  createdAt: true,
  bank: { select: { name: true } },
  originalSource: { select: { name: true } },
  currentRecipient: { select: { name: true } },
  currentLocation: { select: { name: true } },
  branch: { select: { name: true } },
} satisfies Prisma.ChequeSelect;

export const chequeDetailInclude = {
  bank: { select: { name: true } },
  originalSource: { select: { name: true } },
  currentRecipient: { select: { name: true } },
  currentLocation: { select: { name: true } },
  branch: { select: { name: true } },
  images: {
    select: {
      id: true,
      side: true,
      mimeType: true,
      fileSize: true,
      capturedAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  },
} satisfies Prisma.ChequeInclude;

type ChequeSummaryRow = Prisma.ChequeGetPayload<{ select: typeof chequeSummarySelect }>;
type ChequeDetailRow = Prisma.ChequeGetPayload<{ include: typeof chequeDetailInclude }>;

/** `Date` from a DATE column back to the `YYYY-MM-DD` string clients expect. */
export function toIsoDate(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

export function toChequeSummary(row: ChequeSummaryRow): ChequeSummaryView {
  return {
    id: row.id,
    direction: row.direction,
    chequeNumber: row.chequeNumber,
    amount: moneyToString(row.amount),
    currency: row.currency,
    dueDate: toIsoDate(row.dueDate) ?? '',
    status: row.status,
    bankName: row.bank?.name ?? row.bankNameRaw,
    originalSourceName: row.originalSource?.name ?? null,
    currentRecipientName: row.currentRecipient?.name ?? null,
    currentLocationName: row.currentLocation?.name ?? null,
    branchName: row.branch?.name ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Maps a cheque to its detail view.
 *
 * The account number is always masked here; the raw value never leaves the
 * server, and the allowed actions are intersected with the caller's
 * permissions so the UI only offers what the user may actually do.
 */
export function toChequeDetail(
  row: ChequeDetailRow,
  permissions: readonly Permission[],
  encryption: FieldEncryptionService,
): ChequeDetailView {
  return {
    ...toChequeSummary(row),
    branchId: row.branchId,
    issueDate: toIsoDate(row.issueDate),
    receivedDate: toIsoDate(row.receivedDate),
    bankId: row.bankId,
    bankBranchRaw: row.bankBranchRaw,
    accountNumberMasked: encryption.decryptAndMask(row.accountNumberEncrypted),
    drawerName: row.drawerName,
    originalSourceId: row.originalSourceId,
    originalPayeeName: row.originalPayeeName,
    currentHolderId: row.currentHolderId,
    currentRecipientId: row.currentRecipientId,
    currentLocationId: row.currentLocationId,
    purpose: row.purpose,
    referenceNumber: row.referenceNumber,
    notes: row.notes,
    ocrStatus: row.ocrStatus,
    ocrOverallConfidence:
      row.ocrOverallConfidence === null ? null : Number(row.ocrOverallConfidence),
    createdBy: row.createdBy,
    reviewedBy: row.reviewedBy,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    version: row.version,
    images: row.images.map((image) => ({
      id: image.id,
      side: image.side,
      mimeType: image.mimeType,
      fileSize: image.fileSize,
      capturedAt: image.capturedAt?.toISOString() ?? null,
      createdAt: image.createdAt.toISOString(),
    })),
    allowedActions: [...allowedActionsForUser(row.status, permissions, row.direction)],
    updatedAt: row.updatedAt.toISOString(),
  };
}

export const chequeEventInclude = {
  fromContact: { select: { name: true } },
  toContact: { select: { name: true } },
  fromUser: { select: { name: true } },
  toUser: { select: { name: true } },
  fromLocation: { select: { name: true } },
  toLocation: { select: { name: true } },
  performer: { select: { name: true } },
  approver: { select: { name: true } },
} satisfies Prisma.ChequeEventInclude;

type ChequeEventRow = Prisma.ChequeEventGetPayload<{ include: typeof chequeEventInclude }>;

export function toChequeEventView(row: ChequeEventRow): ChequeEventView {
  return {
    id: row.id,
    eventType: row.eventType,
    fromStatus: row.fromStatus,
    toStatus: row.toStatus,
    fromContactName: row.fromContact?.name ?? null,
    toContactName: row.toContact?.name ?? null,
    fromUserName: row.fromUser?.name ?? null,
    toUserName: row.toUser?.name ?? null,
    fromLocationName: row.fromLocation?.name ?? null,
    toLocationName: row.toLocation?.name ?? null,
    eventDate: row.eventDate.toISOString(),
    notes: row.notes,
    performedByName: row.performer?.name ?? null,
    approvedByName: row.approver?.name ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
