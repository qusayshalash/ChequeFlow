/** Permission catalogue and default role mapping (RBAC source of truth). */

import { SystemRole } from './enums.js';

export const Permission = {
  CHEQUE_CREATE: 'cheque.create',
  CHEQUE_VIEW: 'cheque.view',
  CHEQUE_UPDATE: 'cheque.update',
  CHEQUE_REVIEW: 'cheque.review',
  CHEQUE_HANDOVER: 'cheque.handover',
  CHEQUE_DEPOSIT: 'cheque.deposit',
  CHEQUE_CLEAR: 'cheque.clear',
  CHEQUE_BOUNCE: 'cheque.bounce',
  CHEQUE_CANCEL: 'cheque.cancel',
  CHEQUE_VIEW_IMAGE: 'cheque.view_image',
  CHEQUE_EXPORT: 'cheque.export',
  CONTACT_MANAGE: 'contact.manage',
  REPORT_VIEW: 'report.view',
  AUDIT_VIEW: 'audit.view',
  USER_MANAGE: 'user.manage',
  SETTINGS_MANAGE: 'settings.manage',
} as const;
export type Permission = (typeof Permission)[keyof typeof Permission];

export const ALL_PERMISSIONS: readonly Permission[] = Object.values(Permission);

/**
 * Human readable descriptions, keyed by permission. Used for the roles screen
 * and for seeding the `permissions` table.
 */
export const PERMISSION_DESCRIPTIONS: Readonly<Record<Permission, string>> = {
  [Permission.CHEQUE_CREATE]: 'Create cheques',
  [Permission.CHEQUE_VIEW]: 'View cheques',
  [Permission.CHEQUE_UPDATE]: 'Update cheque data',
  [Permission.CHEQUE_REVIEW]: 'Review extracted cheque data',
  [Permission.CHEQUE_HANDOVER]: 'Hand a cheque over to another party',
  [Permission.CHEQUE_DEPOSIT]: 'Deposit a cheque into a bank account',
  [Permission.CHEQUE_CLEAR]: 'Mark a cheque as cleared',
  [Permission.CHEQUE_BOUNCE]: 'Mark a cheque as bounced or returned',
  [Permission.CHEQUE_CANCEL]: 'Cancel a cheque or change a reviewed amount',
  [Permission.CHEQUE_VIEW_IMAGE]: 'View or download cheque images',
  [Permission.CHEQUE_EXPORT]: 'Export cheque data',
  [Permission.CONTACT_MANAGE]: 'Manage contacts',
  [Permission.REPORT_VIEW]: 'View reports',
  [Permission.AUDIT_VIEW]: 'View audit logs',
  [Permission.USER_MANAGE]: 'Manage users and roles',
  [Permission.SETTINGS_MANAGE]: 'Manage organization settings',
};

const READ_ONLY: readonly Permission[] = [Permission.CHEQUE_VIEW, Permission.REPORT_VIEW];

/** Default permission set granted to each built-in role when seeding. */
export const DEFAULT_ROLE_PERMISSIONS: Readonly<Record<SystemRole, readonly Permission[]>> = {
  [SystemRole.OWNER]: ALL_PERMISSIONS,
  [SystemRole.ADMIN]: ALL_PERMISSIONS.filter((p) => p !== Permission.SETTINGS_MANAGE),
  [SystemRole.ACCOUNTANT]: [
    Permission.CHEQUE_CREATE,
    Permission.CHEQUE_VIEW,
    Permission.CHEQUE_UPDATE,
    Permission.CHEQUE_REVIEW,
    Permission.CHEQUE_HANDOVER,
    Permission.CHEQUE_DEPOSIT,
    Permission.CHEQUE_CLEAR,
    Permission.CHEQUE_BOUNCE,
    Permission.CHEQUE_VIEW_IMAGE,
    Permission.CHEQUE_EXPORT,
    Permission.CONTACT_MANAGE,
    Permission.REPORT_VIEW,
  ],
  [SystemRole.CASHIER]: [
    Permission.CHEQUE_CREATE,
    Permission.CHEQUE_VIEW,
    Permission.CHEQUE_HANDOVER,
    Permission.CHEQUE_DEPOSIT,
    Permission.CHEQUE_VIEW_IMAGE,
    Permission.CONTACT_MANAGE,
  ],
  [SystemRole.DATA_ENTRY]: [
    Permission.CHEQUE_CREATE,
    Permission.CHEQUE_VIEW,
    Permission.CHEQUE_UPDATE,
    Permission.CONTACT_MANAGE,
  ],
  [SystemRole.AUDITOR]: [
    Permission.CHEQUE_VIEW,
    Permission.CHEQUE_VIEW_IMAGE,
    Permission.REPORT_VIEW,
    Permission.AUDIT_VIEW,
    Permission.CHEQUE_EXPORT,
  ],
  [SystemRole.VIEWER]: READ_ONLY,
};

/**
 * Sensitive actions that the architecture supports requiring a second
 * approver for. Enforcement is configured per organization
 * (`settings.dualApproval`), the catalogue itself is static.
 */
export const DUAL_APPROVAL_ACTIONS = ['cheque.cancel', 'cheque.amount_change'] as const;
export type DualApprovalAction = (typeof DUAL_APPROVAL_ACTIONS)[number];
