import { parseChequeText } from './cheque-text-parser';

/**
 * A real cheque, as Google Vision actually read it.
 *
 * Every synthetic fixture before this one was clean printed text laid out the
 * way the parser expected. This is a photograph of an Arab Bank cheque taken
 * at an angle, and it broke three heuristics at once — including reading the
 * account holder's national ID number as the amount, which would have booked
 * a cheque for 850,504,325 instead of 3,500.
 *
 * The lines are Vision's output verbatim, in its order, including the noise:
 * the mangled Arabic on the written-amount line, the stray glyph where the
 * signature is, and the letter that OCR hallucinated into the MICR band.
 */
const REAL_CHEQUE = [
  'البنك العربي',
  'ARAB BANK',
  'الا رسال',
  'AL-IRSAL',
  'pay to the order of',
  'the amount of',
  'السيد/ محمد عصام عبد الله حيدريه',
  'الارسال',
  'MR. MOHAMMED ISSAM ABDALLAH HAIDARYEH',
  '9340-149604-2/510',
  'RAMALLAH-AL MASAYEF-MAIN ST',
  'Id. 850504325',
  'ادفعوا لأمر |',
  'مبلغ وقدره الكراته الآن وعمان دوله',
  'Signature',
  '我',
  'date',
  '7/9/2026',
  '#20313509 +49/87543A 1496042510–',
  'تاریخ',
  'Tel. 0599122043',
  'ARAB BANK',
  'USD £3500*',
  'البطلة المريجي',
  'ARAB BANK',
  'COD',
  'ARAB BANK',
  '20313509',
].join('\n');

describe('a photographed Arab Bank cheque', () => {
  const fields = parseChequeText({ text: REAL_CHEQUE, engineConfidence: 1 });

  it('reads the amount from the figure box, not the holder\'s ID number', () => {
    // `Id. 850504325` is the largest number on the cheque. "Largest wins" is a
    // rule about digits, not about money.
    expect(fields.numericAmount.value).toBe('3500');
  });

  it('takes the cheque number from the MICR band', () => {
    // `9340-149604-2/510` is the branch and account line printed under the
    // holder's address. It is digits and dashes, which is not the same thing
    // as a MICR band.
    expect(fields.chequeNumber.value).toBe('20313509');
  });

  it('reads the account holder as the drawer', () => {
    // A real cheque prints the holder's name; it does not label it "Drawer:".
    expect(fields.drawerName.value).toMatch(/MOHAMMED ISSAM ABDALLAH HAIDARYEH|محمد عصام/);
  });

  it('leaves an unfilled payee empty instead of copying the next printed label', () => {
    // Nothing was written after "pay to the order of". The line below it is
    // the pre-printed "the amount of", which is not a payee.
    expect(fields.payeeName.value).toBeNull();
  });

  it('never falls back to an ID number when the figure box is unreadable', () => {
    // The currency ranking is what rescues the cheque above; this is the case
    // it does not cover. Strip the figure box — a smudged or overexposed
    // amount, which is common — and the last resort is "any number on the
    // page". Without the identity guard that is the holder's ID, and a 3,500
    // cheque comes back as 850,504,325 with nothing to say otherwise.
    const smudged = REAL_CHEQUE.split('\n')
      .filter((line) => !line.includes('3500'))
      .join('\n');

    const fields = parseChequeText({ text: smudged, engineConfidence: 1 });
    expect(fields.numericAmount.value).not.toBe('850504325');
  });

  it('still gets the things it already got right', () => {
    expect(fields.currency.value).toBe('USD');
    expect(fields.dueDate.value).toBe('2026-09-07');
    expect(fields.bankName.value).toMatch(/العربي|ARAB BANK/);
  });
});
