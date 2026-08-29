import { describe, expect, it } from 'vitest';

import { ChequeStatus } from './enums.js';
import { Permission } from './permissions.js';
import {
  ChequeAction,
  ChequeTransitionError,
  allowedActionsForUser,
  assertTransition,
  availableActions,
  canTransition,
  isTerminalStatus,
} from './cheque-state-machine.js';

describe('cheque state machine', () => {
  it('allows the documented happy path transitions', () => {
    expect(canTransition(ChequeStatus.DRAFT, ChequeAction.SUBMIT_FOR_REVIEW)).toBe(true);
    expect(canTransition(ChequeStatus.PENDING_REVIEW, ChequeAction.REVIEW)).toBe(true);
    expect(canTransition(ChequeStatus.IN_HAND, ChequeAction.DEPOSIT)).toBe(true);
    expect(canTransition(ChequeStatus.IN_HAND, ChequeAction.HANDOVER)).toBe(true);
    expect(canTransition(ChequeStatus.DEPOSITED, ChequeAction.CLEAR)).toBe(true);
    expect(canTransition(ChequeStatus.DEPOSITED, ChequeAction.BOUNCE)).toBe(true);
    expect(canTransition(ChequeStatus.TRANSFERRED, ChequeAction.CLEAR)).toBe(true);
    expect(canTransition(ChequeStatus.TRANSFERRED, ChequeAction.RETURN)).toBe(true);
    expect(canTransition(ChequeStatus.BOUNCED, ChequeAction.RETURN)).toBe(true);
  });

  it('rejects transitions that are not in the table', () => {
    expect(canTransition(ChequeStatus.DRAFT, ChequeAction.CLEAR)).toBe(false);
    expect(canTransition(ChequeStatus.CLEARED, ChequeAction.DEPOSIT)).toBe(false);
    expect(canTransition(ChequeStatus.IN_HAND, ChequeAction.CLEAR)).toBe(false);
  });

  it('throws a typed error with the source status and action', () => {
    expect(() => assertTransition(ChequeStatus.DRAFT, ChequeAction.DEPOSIT)).toThrow(
      ChequeTransitionError,
    );
    try {
      assertTransition(ChequeStatus.DRAFT, ChequeAction.DEPOSIT);
    } catch (error) {
      const typed = error as ChequeTransitionError;
      expect(typed.code).toBe('INVALID_STATE_TRANSITION');
      expect(typed.from).toBe(ChequeStatus.DRAFT);
      expect(typed.action).toBe(ChequeAction.DEPOSIT);
    }
  });

  it('treats CLEARED and CANCELLED as terminal', () => {
    expect(isTerminalStatus(ChequeStatus.CLEARED)).toBe(true);
    expect(isTerminalStatus(ChequeStatus.CANCELLED)).toBe(true);
    expect(isTerminalStatus(ChequeStatus.IN_HAND)).toBe(false);
    expect(availableActions(ChequeStatus.CLEARED)).toHaveLength(0);
  });

  it('filters available actions by permission', () => {
    const actions = allowedActionsForUser(ChequeStatus.IN_HAND, [Permission.CHEQUE_DEPOSIT]);
    expect(actions).toContain(ChequeAction.DEPOSIT);
    expect(actions).not.toContain(ChequeAction.HANDOVER);
    expect(actions).not.toContain(ChequeAction.CANCEL);
  });

  it('never allows leaving a terminal status even for a listed action', () => {
    expect(() => assertTransition(ChequeStatus.CANCELLED, ChequeAction.RECEIVE)).toThrow(
      /terminal status/,
    );
  });
});
