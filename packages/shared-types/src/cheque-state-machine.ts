/**
 * Central cheque state machine.
 *
 * Every status change in the system MUST go through {@link assertTransition}.
 * Controllers never write `status` directly; the API service layer resolves an
 * action to a transition, validates it here, and then writes the new status and
 * the matching `cheque_events` row inside a single database transaction.
 */

import {
  type ChequeDirection,
  ChequeEventType,
  ChequeStatus,
  TERMINAL_CHEQUE_STATUSES,
} from './enums.js';
import { Permission } from './permissions.js';

/** Named business actions that can move a cheque between statuses. */
export const ChequeAction = {
  SUBMIT_FOR_REVIEW: 'SUBMIT_FOR_REVIEW',
  REVIEW: 'REVIEW',
  RECEIVE: 'RECEIVE',
  RESERVE: 'RESERVE',
  RELEASE_RESERVATION: 'RELEASE_RESERVATION',
  HANDOVER: 'HANDOVER',
  DEPOSIT: 'DEPOSIT',
  CLEAR: 'CLEAR',
  BOUNCE: 'BOUNCE',
  RETURN: 'RETURN',
  POSTPONE: 'POSTPONE',
  RESUME: 'RESUME',
  CANCEL: 'CANCEL',
  MARK_LOST: 'MARK_LOST',
  RECOVER: 'RECOVER',
} as const;
export type ChequeAction = (typeof ChequeAction)[keyof typeof ChequeAction];

export interface TransitionDefinition {
  readonly action: ChequeAction;
  readonly from: readonly ChequeStatus[];
  readonly to: ChequeStatus;
  readonly eventType: ChequeEventType;
  readonly permission: Permission;
  /** Directions this action is valid for; `undefined` means all directions. */
  readonly directions?: readonly ChequeDirection[];
  /** Whether the action requires a counterparty (contact/user/location). */
  readonly requiresCounterparty?: boolean;
}

/**
 * The complete transition table. Anything not listed here is forbidden.
 */
export const CHEQUE_TRANSITIONS: readonly TransitionDefinition[] = [
  {
    action: ChequeAction.SUBMIT_FOR_REVIEW,
    from: [ChequeStatus.DRAFT],
    to: ChequeStatus.PENDING_REVIEW,
    eventType: ChequeEventType.CREATED,
    permission: Permission.CHEQUE_CREATE,
  },
  {
    action: ChequeAction.REVIEW,
    from: [ChequeStatus.PENDING_REVIEW],
    to: ChequeStatus.IN_HAND,
    eventType: ChequeEventType.VERIFIED,
    permission: Permission.CHEQUE_REVIEW,
  },
  {
    action: ChequeAction.RECEIVE,
    from: [ChequeStatus.DRAFT, ChequeStatus.PENDING_REVIEW, ChequeStatus.RETURNED],
    to: ChequeStatus.IN_HAND,
    eventType: ChequeEventType.RECEIVED,
    permission: Permission.CHEQUE_CREATE,
    requiresCounterparty: true,
  },
  {
    action: ChequeAction.RESERVE,
    from: [ChequeStatus.IN_HAND],
    to: ChequeStatus.RESERVED,
    eventType: ChequeEventType.MOVED,
    permission: Permission.CHEQUE_UPDATE,
  },
  {
    action: ChequeAction.RELEASE_RESERVATION,
    from: [ChequeStatus.RESERVED],
    to: ChequeStatus.IN_HAND,
    eventType: ChequeEventType.MOVED,
    permission: Permission.CHEQUE_UPDATE,
  },
  {
    action: ChequeAction.HANDOVER,
    from: [ChequeStatus.IN_HAND, ChequeStatus.RESERVED],
    to: ChequeStatus.TRANSFERRED,
    eventType: ChequeEventType.HANDED_OVER,
    permission: Permission.CHEQUE_HANDOVER,
    requiresCounterparty: true,
  },
  {
    action: ChequeAction.DEPOSIT,
    from: [ChequeStatus.IN_HAND, ChequeStatus.RESERVED],
    to: ChequeStatus.DEPOSITED,
    eventType: ChequeEventType.DEPOSITED,
    permission: Permission.CHEQUE_DEPOSIT,
    requiresCounterparty: true,
  },
  {
    action: ChequeAction.CLEAR,
    from: [ChequeStatus.DEPOSITED, ChequeStatus.TRANSFERRED],
    to: ChequeStatus.CLEARED,
    eventType: ChequeEventType.CLEARED,
    permission: Permission.CHEQUE_CLEAR,
  },
  {
    action: ChequeAction.BOUNCE,
    from: [ChequeStatus.DEPOSITED],
    to: ChequeStatus.BOUNCED,
    eventType: ChequeEventType.BOUNCED,
    permission: Permission.CHEQUE_BOUNCE,
  },
  {
    action: ChequeAction.RETURN,
    from: [ChequeStatus.TRANSFERRED, ChequeStatus.BOUNCED],
    to: ChequeStatus.RETURNED,
    eventType: ChequeEventType.RETURNED,
    permission: Permission.CHEQUE_BOUNCE,
  },
  {
    action: ChequeAction.POSTPONE,
    from: [ChequeStatus.IN_HAND, ChequeStatus.RESERVED, ChequeStatus.BOUNCED],
    to: ChequeStatus.POSTPONED,
    eventType: ChequeEventType.POSTPONED,
    permission: Permission.CHEQUE_UPDATE,
  },
  {
    action: ChequeAction.RESUME,
    from: [ChequeStatus.POSTPONED],
    to: ChequeStatus.IN_HAND,
    eventType: ChequeEventType.MOVED,
    permission: Permission.CHEQUE_UPDATE,
  },
  {
    action: ChequeAction.CANCEL,
    from: [
      ChequeStatus.DRAFT,
      ChequeStatus.PENDING_REVIEW,
      ChequeStatus.IN_HAND,
      ChequeStatus.RESERVED,
      ChequeStatus.POSTPONED,
      ChequeStatus.RETURNED,
      ChequeStatus.LOST,
    ],
    to: ChequeStatus.CANCELLED,
    eventType: ChequeEventType.CANCELLED,
    permission: Permission.CHEQUE_CANCEL,
  },
  {
    action: ChequeAction.MARK_LOST,
    from: [
      ChequeStatus.IN_HAND,
      ChequeStatus.RESERVED,
      ChequeStatus.TRANSFERRED,
      ChequeStatus.POSTPONED,
      ChequeStatus.RETURNED,
    ],
    to: ChequeStatus.LOST,
    eventType: ChequeEventType.MARKED_LOST,
    permission: Permission.CHEQUE_UPDATE,
  },
  {
    action: ChequeAction.RECOVER,
    from: [ChequeStatus.LOST],
    to: ChequeStatus.IN_HAND,
    eventType: ChequeEventType.MOVED,
    permission: Permission.CHEQUE_UPDATE,
    requiresCounterparty: true,
  },
];

const TRANSITIONS_BY_ACTION = new Map<ChequeAction, TransitionDefinition>(
  CHEQUE_TRANSITIONS.map((t) => [t.action, t]),
);

export class ChequeTransitionError extends Error {
  public readonly code = 'INVALID_STATE_TRANSITION';

  constructor(
    public readonly from: ChequeStatus,
    public readonly action: ChequeAction,
    public readonly reason: string,
  ) {
    super(`Cannot apply "${action}" to a cheque in status "${from}": ${reason}`);
    this.name = 'ChequeTransitionError';
  }
}

export function getTransition(action: ChequeAction): TransitionDefinition {
  const transition = TRANSITIONS_BY_ACTION.get(action);
  if (!transition) {
    throw new Error(`Unknown cheque action: ${String(action)}`);
  }
  return transition;
}

export function isTerminalStatus(status: ChequeStatus): boolean {
  return TERMINAL_CHEQUE_STATUSES.includes(status);
}

export function canTransition(
  from: ChequeStatus,
  action: ChequeAction,
  direction?: ChequeDirection,
): boolean {
  const transition = TRANSITIONS_BY_ACTION.get(action);
  if (!transition) return false;
  if (!transition.from.includes(from)) return false;
  if (direction && transition.directions && !transition.directions.includes(direction)) {
    return false;
  }
  return true;
}

/**
 * Validates a transition and returns its definition. Throws
 * {@link ChequeTransitionError} when the transition is not allowed.
 */
export function assertTransition(
  from: ChequeStatus,
  action: ChequeAction,
  direction?: ChequeDirection,
): TransitionDefinition {
  const transition = getTransition(action);
  if (isTerminalStatus(from)) {
    throw new ChequeTransitionError(from, action, 'the cheque is in a terminal status');
  }
  if (!transition.from.includes(from)) {
    throw new ChequeTransitionError(
      from,
      action,
      `allowed source statuses are ${transition.from.join(', ')}`,
    );
  }
  if (direction && transition.directions && !transition.directions.includes(direction)) {
    throw new ChequeTransitionError(from, action, `not allowed for direction ${direction}`);
  }
  return transition;
}

/** All actions currently available from a status (before permission checks). */
export function availableActions(
  from: ChequeStatus,
  direction?: ChequeDirection,
): readonly ChequeAction[] {
  return CHEQUE_TRANSITIONS.filter((t) => canTransition(from, t.action, direction)).map(
    (t) => t.action,
  );
}

/** Actions available to a user, after intersecting with their permissions. */
export function allowedActionsForUser(
  from: ChequeStatus,
  permissions: readonly Permission[],
  direction?: ChequeDirection,
): readonly ChequeAction[] {
  const granted = new Set<Permission>(permissions);
  return CHEQUE_TRANSITIONS.filter(
    (t) => canTransition(from, t.action, direction) && granted.has(t.permission),
  ).map((t) => t.action);
}
