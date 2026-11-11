/** Actions recorded in the audit trail. */
export const AuditAction = {
  LOGIN_SUCCESS: 'auth.login.success',
  LOGIN_FAILED: 'auth.login.failed',
  ACCOUNT_LOCKED: 'auth.account.locked',
  LOGOUT: 'auth.logout',
  PASSWORD_CHANGED: 'auth.password.changed',
  PASSWORD_CHANGE_FAILED: 'auth.password.change_failed',
  TOKEN_REFRESH: 'auth.token.refresh',
  TOKEN_REUSE_DETECTED: 'auth.token.reuse_detected',
  CHEQUE_CREATED: 'cheque.created',
  CHEQUE_UPDATED: 'cheque.updated',
  CHEQUE_AMOUNT_CHANGED: 'cheque.amount_changed',
  CHEQUE_DATE_CHANGED: 'cheque.date_changed',
  CHEQUE_ACTION: 'cheque.action',
  CHEQUE_REVIEWED: 'cheque.reviewed',
  CHEQUE_IMAGE_UPLOADED: 'cheque.image.uploaded',
  CHEQUE_IMAGE_VIEWED: 'cheque.image.viewed',
  CHEQUE_EXPORTED: 'cheque.exported',
  BACKUP_EXPORTED: 'backup.exported',
  BACKUP_RESTORED: 'backup.restored',
  CONTACT_CREATED: 'contact.created',
  CONTACT_UPDATED: 'contact.updated',
  CONTACT_DELETED: 'contact.deleted',
  CONTACT_MERGED: 'contact.merged',
  USER_CREATED: 'user.created',
  USER_UPDATED: 'user.updated',
  USER_STATUS_CHANGED: 'user.status.changed',
  USER_PASSWORD_RESET: 'user.password_reset',
  ROLE_CHANGED: 'user.role.changed',
  SETTINGS_CHANGED: 'settings.changed',
  BANK_CREATED: 'bank.created',
  BANK_UPDATED: 'bank.updated',
  BANK_DELETED: 'bank.deleted',
  ROLE_PERMISSIONS_CHANGED: 'role.permissions.changed',
  STATEMENT_LINK_CREATED: 'statement_link.created',
  STATEMENT_LINK_REVOKED: 'statement_link.revoked',
} as const;
export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];

/** Every action, for filters and for checking each has a name in both languages. */
export const AUDIT_ACTIONS: readonly AuditAction[] = Object.values(AuditAction);

/**
 * The translation key that names an action.
 *
 * Actions are dotted (`auth.login.success`) and translation keys are paths, so
 * the dots are folded to underscores or the lookup would walk into branches.
 */
export function auditActionKey(action: string): string {
  return `auditAction.${action.replace(/\./g, '_')}`;
}

/** Record kinds the trail refers to. */
export const AUDIT_ENTITY_TYPES = [
  'bank',
  'cheque',
  'cheque_image',
  'contact',
  'organization',
  'role',
  'session',
  'statement_link',
  'user',
] as const;
