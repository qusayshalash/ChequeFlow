import { describe, expect, it } from 'vitest';

import { contactRiskLevel } from './contact-risk';

describe('contactRiskLevel', () => {
  it('is high while a returned cheque is open', () => {
    expect(contactRiskLevel({ decided: 10, bounced: 1, openBounced: 1 })).toBe('high');
  });

  it('is high when three in ten come back, once there is enough history', () => {
    expect(contactRiskLevel({ decided: 3, bounced: 1, openBounced: 0 })).toBe('high');
    // Two cheques are too few to call a pattern.
    expect(contactRiskLevel({ decided: 2, bounced: 1, openBounced: 0 })).toBe('medium');
  });

  it('is medium after any bounce, and low on a clean record', () => {
    expect(contactRiskLevel({ decided: 10, bounced: 1, openBounced: 0 })).toBe('medium');
    expect(contactRiskLevel({ decided: 10, bounced: 0, openBounced: 0 })).toBe('low');
    expect(contactRiskLevel({ decided: 0, bounced: 0, openBounced: 0 })).toBe('low');
  });
});
