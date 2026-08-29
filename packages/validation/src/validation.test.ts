import { describe, expect, it } from 'vitest';

import { loginSchema, passwordSchema } from './auth.js';
import { createChequeSchema, listChequesQuerySchema, updateChequeSchema } from './cheques.js';
import { createContactSchema } from './contacts.js';
import { isoDateSchema, moneySchema, paginationSchema } from './primitives.js';

describe('money schema', () => {
  it.each(['100', '100.5', '100.55', '0.01', '1234567.89'])('accepts %s', (value) => {
    expect(moneySchema.safeParse(value).success).toBe(true);
  });

  it.each(['-5', '0', '0.00', '1.234', 'abc', '1e5', ''])('rejects %s', (value) => {
    expect(moneySchema.safeParse(value).success).toBe(false);
  });

  it('never coerces through a float', () => {
    const parsed = moneySchema.parse('9007199254740993.99');
    expect(parsed).toBe('9007199254740993.99');
  });
});

describe('date schema', () => {
  it('accepts calendar dates', () => {
    expect(isoDateSchema.safeParse('2026-01-31').success).toBe(true);
  });

  it('rejects timestamps and malformed values', () => {
    expect(isoDateSchema.safeParse('2026-01-31T00:00:00Z').success).toBe(false);
    expect(isoDateSchema.safeParse('31-01-2026').success).toBe(false);
  });
});

describe('pagination', () => {
  it('applies defaults and caps the page size', () => {
    expect(paginationSchema.parse({})).toEqual({ page: 1, pageSize: 20 });
    expect(paginationSchema.safeParse({ pageSize: 1000 }).success).toBe(false);
  });
});

describe('password policy', () => {
  it('requires length and mixed characters', () => {
    expect(passwordSchema.safeParse('short1A').success).toBe(false);
    expect(passwordSchema.safeParse('alllowercase1').success).toBe(false);
    expect(passwordSchema.safeParse('ValidPassword1').success).toBe(true);
  });

  it('does not re-validate the policy at login', () => {
    expect(loginSchema.safeParse({ email: 'a@b.com', password: 'legacy' }).success).toBe(true);
  });
});

describe('login identifier', () => {
  it('accepts a short user name', () => {
    const parsed = loginSchema.parse({ email: 'admin', password: 'admin' });
    expect(parsed.email).toBe('admin');
  });

  it('still accepts a full email address', () => {
    expect(loginSchema.parse({ email: 'owner@chequeflow.local', password: 'x' }).email).toBe(
      'owner@chequeflow.local',
    );
  });

  it('normalises case and surrounding spaces', () => {
    expect(loginSchema.parse({ email: '  Admin  ', password: 'x' }).email).toBe('admin');
  });

  it.each(['ad', 'has space', 'quote"', 'semi;colon', '<script>'])('rejects %s', (identifier) => {
    expect(loginSchema.safeParse({ email: identifier, password: 'x' }).success).toBe(false);
  });
});

describe('createChequeSchema', () => {
  const base = {
    direction: 'INCOMING',
    chequeNumber: 'CHQ-001',
    amount: '1500.00',
    currency: 'usd',
    dueDate: '2026-09-30',
  };

  it('normalises the currency and fills nullable fields', () => {
    const parsed = createChequeSchema.parse(base);
    expect(parsed.currency).toBe('USD');
    expect(parsed.issueDate).toBeNull();
    expect(parsed.notes).toBeNull();
  });

  it('rejects a due date before the issue date', () => {
    const result = createChequeSchema.safeParse({
      ...base,
      issueDate: '2026-10-01',
      dueDate: '2026-09-30',
    });
    expect(result.success).toBe(false);
  });

  it('ignores an organizationId supplied by the client', () => {
    const parsed = createChequeSchema.parse({ ...base, organizationId: 'attacker-supplied' });
    expect(Object.hasOwn(parsed, 'organizationId')).toBe(false);
  });

  it('requires a version for updates (optimistic locking)', () => {
    expect(updateChequeSchema.safeParse({ amount: '10.00' }).success).toBe(false);
    expect(updateChequeSchema.safeParse({ amount: '10.00', version: 1 }).success).toBe(true);
  });
});

describe('listChequesQuerySchema', () => {
  it('accepts a single status or a list', () => {
    expect(listChequesQuerySchema.parse({ status: 'IN_HAND' }).status).toEqual(['IN_HAND']);
    expect(listChequesQuerySchema.parse({ status: ['IN_HAND', 'DEPOSITED'] }).status).toEqual([
      'IN_HAND',
      'DEPOSITED',
    ]);
  });

  it('defaults to sorting by due date ascending', () => {
    const parsed = listChequesQuerySchema.parse({});
    expect(parsed.sortBy).toBe('dueDate');
    expect(parsed.sortOrder).toBe('asc');
  });
});

describe('createContactSchema', () => {
  it('turns blank optional text into null', () => {
    const parsed = createContactSchema.parse({ type: 'CUSTOMER', name: 'عميل', companyName: '' });
    expect(parsed.companyName).toBeNull();
  });

  it('rejects an unknown contact type', () => {
    expect(createContactSchema.safeParse({ type: 'GHOST', name: 'x' }).success).toBe(false);
  });
});
