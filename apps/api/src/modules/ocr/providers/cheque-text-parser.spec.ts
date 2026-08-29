import { findMicrLine, normalizeDigits, parseChequeText, parseDate } from './cheque-text-parser';

/** A realistic Arabic cheque as a text engine would return it. */
const ARABIC_CHEQUE = [
  'مصرف الراجحي',
  'Al Rajhi Bank',
  'رقم الشيك: 0012345',
  'التاريخ 28/10/2026',
  'ادفعوا لأمر: شركة الأفق المحدودة',
  'مبلغ وقدره 1,500.50',
  'فقط ألف وخمسمائة ريال وخمسون هللة لا غير',
  'ريال سعودي',
  'الساحب: مؤسسة النخبة للتجارة',
  '⑈0012345⑈ ⑆123456789012⑆',
].join('\n');

describe('normalizeDigits', () => {
  it('converts Arabic-Indic digits to ASCII', () => {
    expect(normalizeDigits('١٢٣٤٥٦٧٨٩٠')).toBe('1234567890');
  });

  it('converts Arabic decimal and thousands separators', () => {
    expect(normalizeDigits('١٬٥٠٠٫٥٠')).toBe('1,500.50');
  });

  it('leaves ASCII text untouched', () => {
    expect(normalizeDigits('1500.50')).toBe('1500.50');
  });
});

describe('parseDate', () => {
  it('reads day-first dates', () => {
    expect(parseDate('28/10/2026')).toBe('2026-10-28');
    expect(parseDate('01-03-2026')).toBe('2026-03-01');
  });

  it('reads ISO dates', () => {
    expect(parseDate('2026-10-28')).toBe('2026-10-28');
  });

  it('expands a two digit year', () => {
    expect(parseDate('28/10/26')).toBe('2026-10-28');
  });

  it('reads Arabic-Indic dates', () => {
    expect(parseDate('٢٨/١٠/٢٠٢٦')).toBe('2026-10-28');
  });

  it('rejects an impossible calendar day', () => {
    expect(parseDate('31/02/2026')).toBeNull();
  });

  it('rejects an out of range month', () => {
    expect(parseDate('28/13/2026')).toBeNull();
  });

  it('rejects a Hijri year rather than producing a wrong date', () => {
    expect(parseDate('15/03/1448')).toBeNull();
  });

  it('returns null when there is no date', () => {
    expect(parseDate('لا يوجد تاريخ هنا')).toBeNull();
  });
});

describe('findMicrLine', () => {
  it('finds the magnetic line', () => {
    expect(findMicrLine(['مصرف الراجحي', '⑈0012345⑈ ⑆123456789012⑆'])).toContain('123456789012');
  });

  it('ignores short digit runs', () => {
    expect(findMicrLine(['التاريخ 28/10/2026', 'رقم 123'])).toBeNull();
  });

  it('returns null when there is no MICR line', () => {
    expect(findMicrLine(['مصرف الراجحي', 'ادفعوا لأمر'])).toBeNull();
  });
});

describe('parseChequeText — Arabic cheque', () => {
  const fields = parseChequeText({
    text: ARABIC_CHEQUE,
    knownBankNames: ['مصرف الراجحي', 'بنك الرياض'],
    expectedCurrency: 'SAR',
  });

  it('reads the cheque number from its label', () => {
    expect(fields.chequeNumber.value).toBe('0012345');
    expect(fields.chequeNumber.confidence).toBeGreaterThan(0.5);
  });

  it('reads the amount with its decimals and strips separators', () => {
    expect(fields.numericAmount.value).toBe('1500.50');
  });

  it('reads the written amount line', () => {
    expect(fields.writtenAmount.value).toContain('ألف وخمسمائة');
  });

  it('reads the currency', () => {
    expect(fields.currency.value).toBe('SAR');
  });

  it('reads the due date', () => {
    expect(fields.dueDate.value).toBe('2026-10-28');
  });

  it('reads the payee after its label', () => {
    expect(fields.payeeName.value).toBe('شركة الأفق المحدودة');
  });

  it('reads the drawer after its label', () => {
    expect(fields.drawerName.value).toBe('مؤسسة النخبة للتجارة');
  });

  it('matches a bank the organization already has on file', () => {
    expect(fields.bankName.value).toBe('مصرف الراجحي');
    expect(fields.bankName.confidence).toBeGreaterThan(0.8);
  });

  it('reads the account number from the MICR line', () => {
    expect(fields.accountNumber.value).toBe('123456789012');
  });

  it('never claims to have seen a signature', () => {
    expect(fields.signatureDetected.value).toBeNull();
    expect(fields.signatureDetected.confidence).toBe(0);
  });
});

describe('parseChequeText — honesty about what it cannot read', () => {
  it('returns empty fields for text that is not a cheque', () => {
    const fields = parseChequeText({ text: 'صورة غير واضحة' });
    expect(fields.chequeNumber.value).toBeNull();
    expect(fields.numericAmount.value).toBeNull();
    expect(fields.dueDate.value).toBeNull();
    expect(fields.payeeName.value).toBeNull();
  });

  it('gives an unlabelled name no value at all', () => {
    const fields = parseChequeText({ text: 'مصرف الراجحي\n1,500.50\n28/10/2026' });
    expect(fields.payeeName.value).toBeNull();
    expect(fields.drawerName.value).toBeNull();
  });

  it('rejects a "name" that is mostly digits', () => {
    const fields = parseChequeText({ text: 'ادفعوا لأمر: 123456789' });
    expect(fields.payeeName.value).toBeNull();
  });

  it('scores an amount without decimals below the review threshold', () => {
    const fields = parseChequeText({ text: 'مبلغ 4500' });
    expect(fields.numericAmount.value).toBe('4500');
    expect(fields.numericAmount.confidence).toBeLessThan(0.75);
  });

  it('flags a currency it only assumed from the organization default', () => {
    const fields = parseChequeText({ text: 'شيك بدون عملة', expectedCurrency: 'SAR' });
    expect(fields.currency.value).toBe('SAR');
    expect(fields.currency.confidence).toBeLessThan(0.5);
  });

  it('does not invent a bank when none is recognisable', () => {
    const fields = parseChequeText({ text: '1,500.50', knownBankNames: ['مصرف الراجحي'] });
    expect(fields.bankName.value).toBeNull();
  });
});

describe('parseChequeText — dates', () => {
  it('separates a labelled issue date from a labelled due date', () => {
    const fields = parseChequeText({
      text: 'تاريخ التحرير 01/09/2026\nتاريخ الاستحقاق 28/10/2026',
    });
    expect(fields.issueDate.value).toBe('2026-09-01');
    expect(fields.dueDate.value).toBe('2026-10-28');
  });

  it('treats a single unlabelled date as the due date', () => {
    const fields = parseChequeText({ text: 'التاريخ 28/10/2026' });
    expect(fields.dueDate.value).toBe('2026-10-28');
    expect(fields.issueDate.value).toBeNull();
  });

  it('orders two unlabelled dates as issue then due', () => {
    const fields = parseChequeText({ text: '01/09/2026\n28/10/2026' });
    expect(fields.issueDate.value).toBe('2026-09-01');
    expect(fields.dueDate.value).toBe('2026-10-28');
  });
});

describe('parseChequeText — English cheque', () => {
  const fields = parseChequeText({
    text: [
      'Riyad Bank',
      'Cheque No. 887766',
      'Date 15/12/2026',
      'Pay to the order of Modern Supply Company',
      '2,750.00',
      'SAR',
    ].join('\n'),
  });

  it('reads the labelled cheque number', () => {
    expect(fields.chequeNumber.value).toBe('887766');
  });

  it('reads the payee', () => {
    expect(fields.payeeName.value).toBe('Modern Supply Company');
  });

  it('reads the amount and the ISO currency code', () => {
    expect(fields.numericAmount.value).toBe('2750.00');
    expect(fields.currency.value).toBe('SAR');
    expect(fields.currency.confidence).toBeGreaterThan(0.8);
  });

  it('falls back to a line containing "bank" when none is on file', () => {
    expect(fields.bankName.value).toBe('Riyad Bank');
  });
});

describe('parseChequeText — engine confidence', () => {
  it('scales every populated field by the engine confidence', () => {
    const sharp = parseChequeText({ text: ARABIC_CHEQUE, knownBankNames: ['مصرف الراجحي'] });
    const blurry = parseChequeText({
      text: ARABIC_CHEQUE,
      knownBankNames: ['مصرف الراجحي'],
      engineConfidence: 0.5,
    });

    expect(blurry.chequeNumber.confidence).toBeCloseTo(sharp.chequeNumber.confidence * 0.5, 3);
    expect(blurry.bankName.confidence).toBeLessThan(sharp.bankName.confidence);
  });

  it('leaves unread fields at zero', () => {
    const blurry = parseChequeText({ text: 'لا شيء', engineConfidence: 0.5 });
    expect(blurry.payeeName.confidence).toBe(0);
  });
});
