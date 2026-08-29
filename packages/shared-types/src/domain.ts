/** Serialized domain views returned by the API (money is always a string). */

import type {
  ChequeDirection,
  ChequeEventType,
  ChequeImageSide,
  ChequeStatus,
  ContactType,
  LocationType,
  OcrStatus,
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

export interface ContactView {
  id: string;
  type: ContactType;
  name: string;
  companyName: string | null;
  phone: string | null;
  email: string | null;
  taxNumber: string | null;
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
  bankName: string | null;
  originalSourceName: string | null;
  currentRecipientName: string | null;
  currentLocationName: string | null;
  branchName: string | null;
  createdAt: IsoDateTimeString;
}

export interface ChequeDetailView extends ChequeSummaryView {
  branchId: string | null;
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

export interface DashboardSummary {
  inHandCount: number;
  inHandTotal: MoneyString;
  dueTodayCount: number;
  dueTodayTotal: MoneyString;
  dueWithin7DaysCount: number;
  dueWithin7DaysTotal: MoneyString;
  bouncedCount: number;
  bouncedTotal: MoneyString;
  currency: string;
  recentEvents: ChequeEventView[];
}

export interface DuplicateChequeMatch {
  chequeId: string;
  chequeNumber: string;
  amount: MoneyString;
  dueDate: IsoDateString;
  status: ChequeStatus;
  reason: 'BUSINESS_KEY' | 'IMAGE_HASH';
}
