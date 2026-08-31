import type {
  ChequeDetailView,
  ChequeEventView,
  ChequeSummaryView,
  Permission,
} from '@cheque-flow/shared-types';
import { allowedActionsForUser, isChequeOverdue, utcToday } from '@cheque-flow/shared-types';
import { moneyToString, rateToString, type Prisma } from '@cheque-flow/database';

import { type FieldEncryptionService } from '../../common/crypto/field-encryption.service';

/** Prisma selection used for cheque list rows. */
export const chequeSummarySelect = {
  id: true,
  direction: true,
  chequeNumber: true,
  amount: true,
  currency: true,
  exchangeRate: true,
  amountBase: true,
  dueDate: true,
  status: true,
  drawerName: true,
  originalPayeeName: true,
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
  // Both directions of the replacement chain: the cheque this one was written
  // to replace, and any later cheque written to replace this one.
  replaces: {
    select: { id: true, chequeNumber: true, status: true, amount: true, currency: true },
  },
  replacedBy: {
    select: { id: true, chequeNumber: true, status: true, amount: true, currency: true },
    orderBy: { createdAt: 'asc' },
  },
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

/**
 * `today` is a required parameter, not a default, for two reasons: every row in
 * one list must be judged against the same day (a list must not straddle
 * midnight halfway through), and a required `string` makes the tempting
 * `rows.map(toChequeSummary)` a compile error rather than a bug that silently
 * passes the array index as the date.
 */
export function toChequeSummary(row: ChequeSummaryRow, today: string): ChequeSummaryView {
  const dueDate = toIsoDate(row.dueDate) ?? '';
  return {
    id: row.id,
    direction: row.direction,
    chequeNumber: row.chequeNumber,
    amount: moneyToString(row.amount),
    currency: row.currency,
    exchangeRate: row.exchangeRate ? rateToString(row.exchangeRate) : null,
    amountBase: row.amountBase ? moneyToString(row.amountBase) : null,
    dueDate,
    status: row.status,
    isOverdue: isChequeOverdue(row.status, dueDate, today),
    // Incoming cheques are identified by who wrote them, outgoing ones by who
    // they were written to; the card shows whichever applies.
    drawerName: row.direction === 'OUTGOING' ? row.originalPayeeName : row.drawerName,
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
    ...toChequeSummary(row, utcToday()),
    branchId: row.branchId,
    amountInWords: row.amountInWords,
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
    bounceReason: row.bounceReason,
    bounceFee: row.bounceFee === null ? null : moneyToString(row.bounceFee),
    exchangeRate: row.exchangeRate ? rateToString(row.exchangeRate) : null,
    amountBase: row.amountBase ? moneyToString(row.amountBase) : null,
    replaces: row.replaces
      ? {
          id: row.replaces.id,
          chequeNumber: row.replaces.chequeNumber,
          status: row.replaces.status,
          amount: moneyToString(row.replaces.amount),
          currency: row.replaces.currency,
        }
      : null,
    replacedBy: row.replacedBy.map((entry) => ({
      id: entry.id,
      chequeNumber: entry.chequeNumber,
      status: entry.status,
      amount: moneyToString(entry.amount),
      currency: entry.currency,
    })),
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
  // The activity feed needs to name and open the cheque each event belongs to.
  cheque: { select: { chequeNumber: true } },
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
    chequeId: row.chequeId,
    chequeNumber: row.cheque.chequeNumber,
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
