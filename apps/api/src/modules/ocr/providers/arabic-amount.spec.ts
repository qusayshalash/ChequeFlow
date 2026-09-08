import { parseArabicAmountWords, repairArabicAmountWords } from './arabic-amount';

describe('repairing the amount in words', () => {
  it('mends the misreadings seen on real cheques', () => {
    // What Vision returned for a cheque written `تسعة آلاف دولار لا غير`.
    expect(repairArabicAmountWords('تسعة الان دولار لاغير')).toBe('تسعة آلاف دولار لا غير');
    expect(repairArabicAmountWords('نسمة الان دولار لاغير')).toBe('تسعة آلاف دولار لا غير');
  });

  it('leaves a line it does not recognise exactly as it was', () => {
    // A line this does not understand must reach the reviewer untouched,
    // rather than half-repaired into something that reads as certain.
    for (const text of ['مائة ريال فقط لا غير', 'خمسمائة وسبعون شيكل', 'اثنان وعشرون دينار']) {
      expect(repairArabicAmountWords(text)).toBe(text);
    }
  });
});

describe('reading the words back as a number', () => {
  it('reads what a cheque is actually written for', () => {
    expect(parseArabicAmountWords('تسعة آلاف دولار لا غير')).toBe(9000);
    expect(parseArabicAmountWords('مائة ريال فقط لا غير')).toBe(100);
    expect(parseArabicAmountWords('أربعة آلاف ومئتان دولار')).toBe(4200);
    expect(parseArabicAmountWords('خمسة وعشرون دينار')).toBe(25);
    expect(parseArabicAmountWords('ألف دولار')).toBe(1000);
  });

  it('survives the spelling recognition actually produces', () => {
    // Hamzas, taa marbuta and alef maqsura all come back inconsistently.
    expect(parseArabicAmountWords('تسعه الاف دولار')).toBe(9000);
    expect(parseArabicAmountWords('اربعة الاف')).toBe(4000);
  });

  it('refuses rather than half-reads', () => {
    // The point of this is to corroborate the figure. A number built from part
    // of a sentence corroborates nothing, so an unknown word ends it.
    expect(parseArabicAmountWords('تسعة زقفون دولار')).toBeNull();
    expect(parseArabicAmountWords('دولار فقط لا غير')).toBeNull();
    expect(parseArabicAmountWords('')).toBeNull();
  });
});
