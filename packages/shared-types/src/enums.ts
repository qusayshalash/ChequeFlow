/**
 * Domain enumerations shared by every application in the monorepo.
 *
 * These are declared as `const` objects (not TS `enum`) so they can be used as
 * runtime values, erased safely under `isolatedModules`, and compared against
 * the Prisma-generated enums in `enums.parity.test.ts`.
 */

export const ChequeDirection = {
  /** A cheque the organization received from a customer. */
  INCOMING: 'INCOMING',
  /** A cheque the organization itself issued. */
  OUTGOING: 'OUTGOING',
  /** An incoming cheque later handed over to a supplier or third party. */
  TRANSFERRED: 'TRANSFERRED',
} as const;
export type ChequeDirection = (typeof ChequeDirection)[keyof typeof ChequeDirection];

export const ChequeStatus = {
  DRAFT: 'DRAFT',
  PENDING_REVIEW: 'PENDING_REVIEW',
  IN_HAND: 'IN_HAND',
  RESERVED: 'RESERVED',
  DEPOSITED: 'DEPOSITED',
  TRANSFERRED: 'TRANSFERRED',
  CLEARED: 'CLEARED',
  BOUNCED: 'BOUNCED',
  RETURNED: 'RETURNED',
  POSTPONED: 'POSTPONED',
  CANCELLED: 'CANCELLED',
  LOST: 'LOST',
} as const;
export type ChequeStatus = (typeof ChequeStatus)[keyof typeof ChequeStatus];

/** Statuses from which no further transition is possible. */
export const TERMINAL_CHEQUE_STATUSES: readonly ChequeStatus[] = [
  ChequeStatus.CLEARED,
  ChequeStatus.CANCELLED,
] as const;

export const ChequeEventType = {
  CREATED: 'CREATED',
  RECEIVED: 'RECEIVED',
  VERIFIED: 'VERIFIED',
  MOVED: 'MOVED',
  HANDED_OVER: 'HANDED_OVER',
  DEPOSITED: 'DEPOSITED',
  CLEARED: 'CLEARED',
  BOUNCED: 'BOUNCED',
  RETURNED: 'RETURNED',
  POSTPONED: 'POSTPONED',
  CANCELLED: 'CANCELLED',
  MARKED_LOST: 'MARKED_LOST',
  NOTE_ADDED: 'NOTE_ADDED',
  IMAGE_ADDED: 'IMAGE_ADDED',
  DATA_CORRECTED: 'DATA_CORRECTED',
} as const;
export type ChequeEventType = (typeof ChequeEventType)[keyof typeof ChequeEventType];

export const ContactType = {
  CUSTOMER: 'CUSTOMER',
  SUPPLIER: 'SUPPLIER',
  PERSON: 'PERSON',
  OTHER: 'OTHER',
} as const;
export type ContactType = (typeof ContactType)[keyof typeof ContactType];

export const LocationType = {
  SAFE: 'SAFE',
  DRAWER: 'DRAWER',
  BANK: 'BANK',
  EMPLOYEE: 'EMPLOYEE',
  EXTERNAL: 'EXTERNAL',
} as const;
export type LocationType = (typeof LocationType)[keyof typeof LocationType];

export const ChequeImageSide = {
  FRONT: 'FRONT',
  BACK: 'BACK',
  ATTACHMENT: 'ATTACHMENT',
} as const;
export type ChequeImageSide = (typeof ChequeImageSide)[keyof typeof ChequeImageSide];

export const OcrStatus = {
  NOT_STARTED: 'NOT_STARTED',
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  REVIEWED: 'REVIEWED',
} as const;
export type OcrStatus = (typeof OcrStatus)[keyof typeof OcrStatus];

export const UserStatus = {
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  INVITED: 'INVITED',
  DISABLED: 'DISABLED',
} as const;
export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

export const ReminderType = {
  BEFORE_DUE: 'BEFORE_DUE',
  ON_DUE: 'ON_DUE',
  OVERDUE: 'OVERDUE',
} as const;
export type ReminderType = (typeof ReminderType)[keyof typeof ReminderType];

export const ReminderChannel = {
  IN_APP: 'IN_APP',
  PUSH: 'PUSH',
  EMAIL: 'EMAIL',
  WHATSAPP: 'WHATSAPP',
} as const;
export type ReminderChannel = (typeof ReminderChannel)[keyof typeof ReminderChannel];

export const ReminderStatus = {
  SCHEDULED: 'SCHEDULED',
  SENT: 'SENT',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
  READ: 'READ',
} as const;
export type ReminderStatus = (typeof ReminderStatus)[keyof typeof ReminderStatus];

export const SystemRole = {
  OWNER: 'OWNER',
  ADMIN: 'ADMIN',
  ACCOUNTANT: 'ACCOUNTANT',
  CASHIER: 'CASHIER',
  DATA_ENTRY: 'DATA_ENTRY',
  AUDITOR: 'AUDITOR',
  VIEWER: 'VIEWER',
} as const;
export type SystemRole = (typeof SystemRole)[keyof typeof SystemRole];
