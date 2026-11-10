/**
 * The WhatsApp reminder's wording. A bounced cheque must not be described
 * as "due", and several cheques must go as one message, one line each.
 */
import { describe, expect, it } from 'vitest';

import { createTranslator } from '@cheque-flow/localization';

import { reminderMessage } from './reminder-message';

const t = createTranslator('ar');
const base = { amount: '1500.00', currency: 'ILS', dueDate: '2026-12-01' };

describe('reminderMessage', () => {
  it('reminds of a single due cheque by its due date', () => {
    const text = reminderMessage(
      t,
      'ar',
      'محلات الأمل',
      [{ ...base, chequeNumber: '1001', status: 'IN_HAND' }],
      '2026-11-10',
    );
    expect(text).toContain('محلات الأمل');
    expect(text).toContain('1001');
    expect(text).toContain('مستحق');
    expect(text).not.toContain('أُعيد');
  });

  it('says a bounced cheque was returned, not that it is due', () => {
    const text = reminderMessage(
      t,
      'ar',
      null,
      [{ ...base, chequeNumber: '2002', status: 'BOUNCED' }],
      '2026-11-10',
    );
    expect(text).toContain('أُعيد من البنك');
    expect(text).not.toContain('مستحق بتاريخ');
  });

  it('lists several cheques in one message, each with its own state', () => {
    const text = reminderMessage(
      t,
      'ar',
      'محلات الأمل',
      [
        { ...base, chequeNumber: 'A1', status: 'IN_HAND', dueDate: '2026-11-01' },
        { ...base, chequeNumber: 'A2', status: 'IN_HAND', dueDate: '2026-11-15' },
        { ...base, chequeNumber: 'A3', status: 'RETURNED' },
      ],
      '2026-11-10',
    );
    const lines = text.split('\n').filter((line) => line.startsWith('•'));
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain('متأخر');
    expect(lines[1]).toContain('مستحق');
    expect(lines[2]).toContain('أُعيد');
  });
});
