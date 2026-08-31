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
  /**
   * Ceiling of uncollected cheques the business will hold from this contact,
   * and the currency it is measured in. `null` means nobody has decided yet —
   * it never means unlimited.
   */
  creditLimit: MoneyString | null;
  creditLimitCurrency: string | null;
  isActive: boolean;
  createdAt: IsoDateTimeString;
  updatedAt: IsoDateTimeString;
}

/**
 * How much of a contact's credit limit their uncollected cheques use up.
 *
 * Only cheques in the limit's own currency count towards it. Converting the
 * rest at today's rate would make the headroom move on days when nothing
 * happened, so they are listed separately and left out of the arithmetic.
 */
export interface ContactCreditStatus {
  limit: MoneyString;
  currency: string;
  used: MoneyString;
  /** Negative when the limit is exceeded — "over by 900" is the useful number. */
  headroom: MoneyString;
  exceeded: boolean;
  /** Uncollected cheques in currencies the limit says nothing about. */
  otherCurrencies: Array<{ currency: string } & Bucket>;
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
  /**
   * Rate converting `currency` into the organization's base currency, as it
   * stood when the cheque was recorded — a decimal string, never a number.
   * `null` means no rate was recorded; it never means 1.
   */
  exchangeRate: string | null;
  /** `amount` converted at `exchangeRate`. `null` whenever the rate is. */
  amountBase: MoneyString | null;
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

/** One end of a replacement chain, as shown on a cheque's own page. */
export interface ChequeLinkView {
  id: string;
  chequeNumber: string;
  status: ChequeStatus;
  amount: MoneyString;
  /** Carried because a replacement is not always in the same currency. */
  currency: string;
}

export interface ChequeDetailView extends ChequeSummaryView {
  branchId: string | null;
  /**
   * The bounced or returned cheque this one was written to replace, and any
   * later cheque written to replace this one.
   *
   * Without the link, three replacements for one debt read as three unrelated
   * cheques and the customer's history looks cleaner than it was.
   */
  replaces: ChequeLinkView | null;
  replacedBy: ChequeLinkView[];
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

/**
 * Everything outstanding, expressed in the one currency the books are kept in.
 *
 * This sits *beside* the per-currency blocks, never instead of them. Each
 * cheque was converted at the rate recorded the day it arrived, so the figure
 * is traceable to a document rather than to today's rate — and
 * `unconvertedCount` says how many cheques carry no rate and are therefore
 * missing from it. A converted total that quietly leaves cheques out is worse
 * than no converted total.
 */
export interface DashboardBaseTotal {
  currency: string;
  count: number;
  total: MoneyString;
  unconvertedCount: number;
}

export interface DashboardSummary {
  /** The currency new cheques default to, listed first in `currencies`. */
  defaultCurrency: string;
  /** The currency the books are kept in — what `baseTotal` is expressed in. */
  baseCurrency: string;
  baseTotal: DashboardBaseTotal;
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
  /** `null` when no limit is set for this contact. */
  creditLimit: ContactCreditStatus | null;
  /** Most recent cheques involving this contact, newest first. */
  cheques: ChequeSummaryView[];
  /**
   * How many cheques this contact has in total.
   *
   * `cheques` is capped, so without this the reader cannot tell a contact with
   * exactly 50 cheques from one with 500 — and the per-currency totals above,
   * which cover everything, would look inconsistent with the list below them.
   */
  totalCheques: number;
}

export interface DuplicateChequeMatch {
  chequeId: string;
  chequeNumber: string;
  amount: MoneyString;
  dueDate: IsoDateString;
  status: ChequeStatus;
  reason: 'BUSINESS_KEY' | 'IMAGE_HASH';
}
