import { AuditService } from './audit.service';

describe('AuditService.sanitize', () => {
  it('redacts secrets at any depth', () => {
    const sanitized = AuditService.sanitize({
      email: 'a@b.com',
      passwordHash: '$argon2id$secret',
      nested: { accountNumber: '1234567890', keep: 'value' },
    }) as Record<string, unknown>;

    expect(sanitized.passwordHash).toBe('[redacted]');
    expect((sanitized.nested as Record<string, unknown>).accountNumber).toBe('[redacted]');
    expect((sanitized.nested as Record<string, unknown>).keep).toBe('value');
    expect(sanitized.email).toBe('a@b.com');
  });

  it('serializes dates and decimals losslessly', () => {
    const decimalLike = { toFixed: () => '10.00', toString: () => '10.00' };
    const sanitized = AuditService.sanitize({
      at: new Date('2026-01-01T00:00:00.000Z'),
      amount: decimalLike,
    }) as Record<string, unknown>;

    expect(sanitized.at).toBe('2026-01-01T00:00:00.000Z');
    expect(sanitized.amount).toBe('10.00');
  });

  it('redacts values inside arrays of objects', () => {
    const sanitized = AuditService.sanitize([{ tokenHash: 'abc' }]) as Array<
      Record<string, unknown>
    >;
    expect(sanitized[0]?.tokenHash).toBe('[redacted]');
  });
});
