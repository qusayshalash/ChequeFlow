import { describe, expect, it } from 'vitest';

import { foldBankName } from './bank-name';

describe('foldBankName', () => {
  it('treats a missing hamza as the same name', () => {
    expect(foldBankName('البنك الاسلامي الفلسطيني')).toBe(foldBankName('البنك الإسلامي الفلسطيني'));
  });

  it('ignores vowel marks, tatweel, taa marbuta and dotless yaa', () => {
    expect(foldBankName('بَنْك القـاهرة')).toBe(foldBankName('بنك القاهره'));
    expect(foldBankName('مصرف الهدى')).toBe(foldBankName('مصرف الهدي'));
  });

  it('ignores case, punctuation and spacing', () => {
    expect(foldBankName('  Bank  of-Palestine ')).toBe(foldBankName('bank of palestine'));
  });

  it('keeps different banks apart', () => {
    expect(foldBankName('البنك العربي')).not.toBe(foldBankName('البنك الإسلامي العربي'));
  });
});
