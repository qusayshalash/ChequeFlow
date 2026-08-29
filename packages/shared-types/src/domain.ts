/** Serialized domain views returned by the API (money is always a string). */

import type {
  ChequeDirection,
  ChequeEventType,
  ChequeImageSide,
  ChequeStatus,
  ContactType,
  LocationType,
  OcrStatus,
  UserStatus,
} from './enums.js';
import type { Permission } from './permissions.js';

/** Monetary amounts cross the wire as decimal strings, never as `number`. */
export type MoneyString = string;

/** `YYYY-MM-DD`, used for `dueDate` / `issueDate` (calendar dates, not instants). */
export type IsoDateString = string;

/** Full ISO-8601 UTC instant. */
export type IsoDateTimeString = string;

export interface AuthenticatedUser {
  id: string;
  organizationId: string;
  branchId: string | null;
  name: string;
  email: string;
  roles: string[];
  permissions: Permission[];
}

export interface UserView {
  id: string;
  name: string;
  /** Either an email address or a plain username. */
  email: string;
  phone: string | null;
  status: UserStatus;
  branchId: string | null;
  branchName: string | null;
  roles: string[];
  lastLoginAt: IsoDateTimeString | null;
  createdAt: IsoDateTimeString;
}

export interface ContactView {
  id: string;
  type: ContactType;
  name: string;
  companyName: string | null;
  phone: string | null;
  email: string | null;
  taxNumber: string | null;
  nationalId: string | null;
  address: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: IsoDateTimeString;
  updatedAt: IsoDateTimeString;
}

export interface LocationView {
  id: string;
  branchId: string | null;
  type: LocationType;
  name: string;
  description: string | null;
  isActive: boolean;
}

export interface BranchView {
  id: string;
  name: string;
  code: string;
  address: string | null;
  phone: string | null;
  isActive: boolean;
}

export interface BankView {
  id: string;
  country: string;
  name: string;
  code: string;
  logoUrl: string | null;
}

export interface ChequeImageView {
  id: string;
  side: ChequeImageSide;
  mimeType: string;
  fileSize: number;
  capturedAt: IsoDateTimeString | null;
  createdAt: IsoDateTimeString;
}

export interface ChequeSummaryView {
  id: string;
  direction: ChequeDirection;
  chequeNumber: string;
  amount: MoneyString;
  currency: string;
  dueDate: IsoDateString;
  status: ChequeStatus;
  /**
   * Past its due date and still uncollected. Computed by the API against the
   * server clock so every client agrees on what "late" means.
   */
  isOverdue: boolean;
  /** Whose cheque it is: the drawer for incoming, the payee for outgoing. */
  drawerName: string | null;
  bankName: string | null;
  originalSourceName: string | null;
  currentRecipientName: string | null;
  currentLocationName: string | null;
  branchName: string | null;
  createdAt: IsoDateTimeString;
}

export interface ChequeDetailView extends ChequeSummaryView {
  branchId: string | null;
  /** The amount written in letters, as it appears on the cheque. */
  amountInWords: string | null;
  issueDate: IsoDateString | null;
  receivedDate: IsoDateString | null;
  bankId: string | null;
  bankBranchRaw: string | null;
  /** Masked in normal responses, e.g. `****4321`. */
  accountNumberMasked: string | null;
  drawerName: string | null;
  originalSourceId: string | null;
  originalPayeeName: string | null;
  currentHolderId: string | null;
  currentRecipientId: string | null;
  currentLocationId: string | null;
  purpose: string | null;
  referenceNumber: string | null;
  notes: string | null;
  /** Set when the bank refused payment; survives a later re-presentation. */
  bounceReason: string | null;
  bounceFee: MoneyString | null;
  ocrStatus: OcrStatus;
  ocrOverallConfidence: number | null;
  createdBy: string | null;
  reviewedBy: string | null;
  reviewedAt: IsoDateTimeString | null;
  version: number;
  images: ChequeImageView[];
  /** Actions the requesting user may perform right now. */
  allowedActions: string[];
  updatedAt: IsoDateTimeString;
}

export interface ChequeEventView {
  id: string;
  /** The cheque this movement belongs to, so a feed row can open it. */
  chequeId: string;
  chequeNumber: string;
  eventType: ChequeEventType;
  fromStatus: ChequeStatus | null;
  toStatus: ChequeStatus | null;
  fromContactName: string | null;
  toContactName: string | null;
  fromUserName: string | null;
  toUserName: string | null;
  fromLocationName: string | null;
  toLocationName: string | null;
  eventDate: IsoDateTimeString;
  notes: string | null;
  performedByName: string | null;
  approvedByName: string | null;
  createdAt: IsoDateTimeString;
}

/**
 * One count/total pair. Kept as its own type because every dashboard bucket
 * has the same shape and they are always rendered together.
 */
export interface Bucket {
  count: number;
  total: MoneyString;
}

/**
 * Dashboard figures for a single currency.
 *
 * Totals are never summed across currencies: adding shekels to dollars
 * produces a number that means nothing, so each currency gets its own block.
 */
export interface DashboardCurrencyTotals {
  currency: string;
  /**
   * Recorded but not yet confirmed as received — DRAFT and PENDING_REVIEW.
   * Reported so a freshly photographed cheque is visible somewhere on the
   * dashboard instead of appearing only in the list.
   */
  draft: Bucket;
  /** Cheques physically held by the company right now. */
  inHand: Bucket;
  dueToday: Bucket;
  dueWithin7Days: Bucket;
  dueWithin30Days: Bucket;
  /** Past due and still uncollected. */
  overdue: Bucket;
  /** Handed to the bank and waiting to clear. */
  deposited: Bucket;
  /** Money actually collected. */
  cleared: Bucket;
  bounced: Bucket;
  returned: Bucket;
  /** Everything still outstanding, split by direction. */
  incoming: Bucket;
  outgoing: Bucket;
}

export interface DashboardSummary {
  /** The organization's reporting currency, listed first in `currencies`. */
  defaultCurrency: string;
  /** One entry per currency that actually has cheques. */
  currencies: DashboardCurrencyTotals[];
  recentEvents: ChequeEventView[];
}

/** Per-currency position of one contact, for their account statement. */
export interface ContactStatementCurrency {
  currency: string;
  /** Cheques received from this contact that we still expect to collect. */
  pending: Bucket;
  collected: Bucket;
  bounced: Bucket;
  returned: Bucket;
}

export interface ContactStatementView {
  contact: ContactView;
  currencies: ContactStatementCurrency[];
  /** Most recent cheques involving this contact, newest first. */
  cheques: ChequeSummaryView[];
}

export interface DuplicateChequeMatch {
  chequeId: string;
  chequeNumber: string;
  amount: MoneyString;
  dueDate: IsoDateString;
  status: ChequeStatus;
  reason: 'BUSINESS_KEY' | 'IMAGE_HASH';
}
