import { parseArabicAmountWords } from './arabic-amount';
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

/**
 * A second bank, photographed through the phone.
 *
 * The first fixture came from one Arab Bank cheque, and four heuristics were
 * written against it. This one is a Bank of Palestine cheque taken with the
 * app's own camera, and it broke the one that looked most settled: its MICR
 * band came back as `20000012 ±89/462004 0829429300–`, with `±` and an en dash
 * where the E-13B glyphs should be. A rule that required `#` did not see a
 * band at all, so the cheque number fell through to "any six-to-ten digit run"
 * and picked up `Ac No. 0829429300` printed at the top — the account number,
 * reported as the cheque number, on a cheque whose real number was 20000012.
 */
const BANK_OF_PALESTINE = [
  'بنك فلسطين',
  'BANK OF PALESTINE',
  'AL-ERSAL BRANCH',
  'فرع الارسال',
  'Pay to order of',
  'The amount of',
  'command',
  'option',
  'Ac No. 0829429300',
  'ABAS ASAD ABAS DWEIK',
  'عباس اسعد عباس دويك',
  'ID. 201496320',
  'Tel. 0547964639',
  'RAMALLAH - EAN MOSBAH - ALJABA',
  'ادفعوا لأمر',
  'مبلغ وقدره',
  'تسعة الان دولار لاغير',
  'Signature',
  'توقيع',
  '.10-6-226',
  'Date',
  'تاريخ',
  '20000012 ±89/462004 0829429300–',
  'رام الله - عين مصباح - عماره ال',
  'BANK OF PALESTINE',
  'USD 9000 *',
  'BANK',
  'BANK OF PALESTINE',
].join('\n');

describe('a Bank of Palestine cheque, photographed in the app', () => {
  const fields = parseChequeText({ text: BANK_OF_PALESTINE, engineConfidence: 1 });

  it('takes the cheque number from the band, not from `Ac No.`', () => {
    expect(fields.chequeNumber.value).toBe('20000012');
  });

  it('and reads the account number from the same band', () => {
    expect(fields.accountNumber.value).toBe('0829429300');
  });

  it('reads the amount beside the currency', () => {
    // `ID. 201496320` is larger than the amount here too.
    expect(fields.numericAmount.value).toBe('9000');
    expect(fields.currency.value).toBe('USD');
  });

  it('reads the account holder in Arabic, not the bank\'s transliteration', () => {
    // The bank prints both, on consecutive lines. The ledger is Arabic-first,
    // and `عباس اسعد عباس دويك` matches a contact where `ABAS ASAD ABAS DWEIK`
    // does not.
    expect(fields.drawerName.value).toBe('عباس اسعد عباس دويك');
  });

  it('mends the amount in words, and only because the figure agrees', () => {
    // `تسعة الان دولار لاغير` for a cheque written `تسعة آلاف دولار لا غير`.
    // The mended words read back as 9000, which is what the amount box says,
    // so the repair is corroborated rather than merely plausible.
    expect(fields.writtenAmount.value).toBe('تسعة آلاف دولار لا غير');
    // Scored as a value found against an anchor, because it was: the anchor is
    // the figure in the box, which reads the same.
    expect(fields.writtenAmount.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it('does not raise its confidence when the figure disagrees', () => {
    // Same line, a different figure in the box. The repair still happens — the
    // reviewer should see readable words — but nothing corroborates it now, so
    // it must not be presented as the settled reading.
    const mismatched = BANK_OF_PALESTINE.replace('USD 9000 *', 'USD 4000 *');
    const fields = parseChequeText({ text: mismatched, engineConfidence: 1 });

    expect(fields.writtenAmount.value).toBe('تسعة آلاف دولار لا غير');
    expect(fields.writtenAmount.confidence).toBeLessThan(0.5);
  });

  it('leaves the date empty when the year did not survive recognition', () => {
    // Vision read `10-6-2026` as `.10-6-226`. There is no honest date in that,
    // and inventing 2026 from 226 would be a guess wearing a fact's clothes.
    expect(fields.dueDate.value).toBeNull();
  });
});

/**
 * The same cheque, photographed a second time.
 *
 * Nothing changed but the angle, and recognition emitted the holder block in a
 * different order: `ID. 201496320` landed between the Latin name and the
 * Arabic one. A rule that looked at the line after `Ac No.`, and the line
 * after that, found only the transliteration.
 *
 * Two photographs of one cheque disagreeing about line order is the ordinary
 * case, not a freak one — which is why the block is scanned rather than
 * counted through.
 */
const SAME_CHEQUE_REPHOTOGRAPHED = [
  'J',
  'بنك فلسطين',
  'BANK OF PALESTINE',
  'AL-ERSAL BRANCH',
  'فرع الارسال',
  'Pay to order of',
  'The amount of',
  'H',
  'command',
  'option',
  'Ac No. 0829429300',
  'ABAS ASAD ABAS DWEIK',
  'ID. 201496320',
  'عباس اسعد عباس دويك',
  'Tel. 0547964639',
  'RAMALLAH - EAN MOSBAH - ALJABA',
  'ادفعوا لأمر',
  'نسمة الان دولار لاغير',
  'مبلغ وقدره',
  'Signature',
  'توقيع',
  '.10-6-2026',
  'Date',
  'تاريخ',
  '20000012 ±89/462004 0829429300–',
  'USD 9000 *',
  'BANK OF PALESTINE',
].join('\n');

describe('the same cheque, photographed again at a different angle', () => {
  const fields = parseChequeText({ text: SAME_CHEQUE_REPHOTOGRAPHED, engineConfidence: 1 });

  it('still finds the Arabic name, now separated from the label by the ID line', () => {
    expect(fields.drawerName.value).toBe('عباس اسعد عباس دويك');
  });

  it('reads the date this time, because the year survived', () => {
    // The first photograph lost a digit — `.10-6-226`. A steadier shot kept it.
    expect(fields.dueDate.value).toBe('2026-06-10');
  });

  it('mends the amount in words against the figure', () => {
    expect(fields.writtenAmount.value).toBe('تسعة آلاف دولار لا غير');
  });

  it('agrees with the other photograph on everything that matters', () => {
    expect(fields.chequeNumber.value).toBe('20000012');
    expect(fields.numericAmount.value).toBe('9000');
    expect(fields.accountNumber.value).toBe('0829429300');
    expect(fields.currency.value).toBe('USD');
  });
});

/**
 * A third photograph, and the pre-printed label came with the handwriting.
 *
 * On the two before this, `مبلغ وقدره` — "an amount of", printed on the cheque
 * — sat on its own line and the handwritten words on another. Here recognition
 * joined them: `و مبلغ وقدره تسعة الان دولار لا غير`. Taking the line whole put
 * the cheque's own stationery into the amount field.
 *
 * It also cost the repair its corroboration. The mended words are read back as
 * a number to check them against the figure, and `مبلغ` and `وقدره` are not
 * numbers — so the reading failed, and a correct repair scored as an unchecked
 * guess.
 */
const LABEL_JOINED_TO_HANDWRITING = [
  'بنك فلسطين',
  'BANK OF PALESTINE',
  'AL-ERSAL BRANCH',
  'فرع الارسال',
  'Pay to order of',
  'The amount of',
  'Ac No. 0829429300',
  'ABAS ASAD ABAS DWEIK',
  'عباس اسعد عباس دويك',
  'ID. 201496320',
  'Tel. 0547964639',
  'RAMALLAH - EAN MOSBAH - ALJABA',
  '▪ ادفعوا لأمر',
  'و مبلغ وقدره تسعة الان دولار لا غير',
  'رام الله - عين مصباح - عماره ال',
  'BANK OF PALESTINE',
  'USD',
  '9000*',
  'Signature',
  'وقيع',
  '10-7-2026',
  'Date',
  '20000013 ±89/462004 0829429300-',
  'BANK OF PALESTINE',
].join('\n');

describe('a cheque whose printed label ran into the handwriting', () => {
  const fields = parseChequeText({ text: LABEL_JOINED_TO_HANDWRITING, engineConfidence: 1 });

  it('keeps the words and drops the stationery', () => {
    expect(fields.writtenAmount.value).toBe('تسعة آلاف دولار لا غير');
  });

  it('and the figure can vouch for them again once the label is gone', () => {
    expect(fields.writtenAmount.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it('reads the figure even with the currency on its own line', () => {
    // `USD` and `9000*` came back as separate lines, so the amount is not
    // beside a currency code on the page any more.
    expect(fields.numericAmount.value).toBe('9000');
    expect(fields.currency.value).toBe('USD');
  });

  it('still gets the rest of the record', () => {
    expect(fields.chequeNumber.value).toBe('20000013');
    expect(fields.accountNumber.value).toBe('0829429300');
    expect(fields.drawerName.value).toBe('عباس اسعد عباس دويك');
    expect(fields.dueDate.value).toBe('2026-07-10');
  });
});

/**
 * A different hand, and the fixed list of misspellings ran out.
 *
 * Every fixture before this lost the same letters, so a table of exact
 * misreadings kept up. This hand lost different ones — `دولا` for `دولار`,
 * `لاغي` for `لا غير` — and a table has nothing to say about a truncation it
 * has not met. Each new hand would have needed another entry.
 *
 * An amount written out on a cheque draws on a few dozen words and nothing
 * else, so a truncated one is matched back against that closed vocabulary. It
 * generalises to the next hand without inventing anything, and a token close
 * to two words at once is left alone rather than guessed at.
 *
 * The line also puts the bank's rule between the label and the writing —
 * `مبلغ وقدره | الف دولا فقط لاغي` — where the previous cheque had it in front.
 */
const A_DIFFERENT_HAND = [
  '291',
  'البنك العربي',
  'ARAB BANK',
  'الارسال',
  'AL-IRSAL',
  'pay to the order of',
  'the amount of',
  'Signature',
  'UAE BA',
  'ld. 905079992',
  'ادفعوا لأمر | محمد محمود عوض مصريه',
  'مبلغ وقدره | الف دولا فقط لاغي',
  'اید ها',
  '130.6.2016',
  'date',
  'ـريخ',
  '#20317287 #49/87543, 3170411510⑉',
  'السيد / زايد ناجي عيسي نعسان',
  'MR. Zayed Naji Issa Nasan',
  'الارسال',
  '9340-317041-1/510',
  'RAMALLAH-Moghayer-Main',
  'Tel.',
  '595999937',
  'ARAB BANK',
  'USD £ 1000',
  'البنك الهوي',
  'ARAB BANK',
].join('\n');

describe('an Arab Bank cheque in a different hand', () => {
  const fields = parseChequeText({ text: A_DIFFERENT_HAND, engineConfidence: 1 });

  it('puts the dropped letters back from the vocabulary an amount is drawn from', () => {
    expect(fields.writtenAmount.value).toBe('الف دولار فقط لا غير');
  });

  it('and the figure vouches for the result', () => {
    expect(fields.writtenAmount.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it('drops the rule the bank prints after the label', () => {
    // `مبلغ وقدره | الف …` — the separator follows the label here rather than
    // preceding it, which the earlier cheque never showed.
    expect(fields.writtenAmount.value).not.toContain('|');
    expect(fields.writtenAmount.value).not.toContain('مبلغ');
  });

  it('reads the payee, whose line carries the same rule', () => {
    expect(fields.payeeName.value).toBe('محمد محمود عوض مصريه');
  });

  it('gets the rest of the record', () => {
    expect(fields.chequeNumber.value).toBe('20317287');
    expect(fields.numericAmount.value).toBe('1000');
    expect(fields.currency.value).toBe('USD');
    expect(fields.accountNumber.value).toBe('3170411510');
    expect(fields.drawerName.value).toBe('زايد ناجي عيسي نعسان');
  });
});

/**
 * A third bank, a shekel cheque, and two faults in one line.
 *
 * The amount box is printed with a rule after the figure, so recognition
 * returned `NIS #70,000/`. The amount pattern carried one `(?![\d/-])` after
 * the whole alternation — there to keep a date's parts out — and the trailing
 * slash failed the grouped-thousands branch on it. Matching fell through to
 * the bare-integer branch, which took `70`. The cheque was offered at seventy
 * and confirmed at seventy.
 *
 * And the figure itself is wrong. The cheque is for ten thousand, which is
 * what the words say; the handwritten `1` came back as a `7`. So the reading
 * this fixture pins is `70000` — faithful to the text recognition produced,
 * which is all a text parser can be — while the words, read independently, say
 * ten thousand.
 *
 * That disagreement is the whole point of a cheque stating its amount twice.
 * Neither side is trusted when they differ: the parser has no way to know
 * which one slipped, and here it was the figure.
 */
const SHEKEL_CHEQUE_WITH_A_RULE = [
  '₪30000321 281/836424 1440823011!',
  'البنك الإسلامي الفلسطيني',
  'Palestine Islamic Bank',
  'Masyoun Branch',
  'فرع الماصيون',
  '11',
  'PALESTINE ISLAMIC BANK',
  'Ac No.0001440823',
  'HUSSAM RAED ODEH ABDELNABI',
  'ID. 403816986',
  'حسام رائد عوده عبدالنبي',
  'Tel. 0598569324',
  'RAMALLAH',
  'بيتونيا الرئيسي',
  'LESTINE ISLAMIC BANK ادفعوا لامر',
  'PAL',
  'NIS #70,000/',
  'البنك السالمي الفلسطيني',
  'Palestine Islamic Bank',
  'مبلغ وقدره',
  'عشرة الآف شكل فقط لاغير',
  'Pay to the order of',
  'The amount of',
  ': 2-30- 2026 : حسام بر الى',
  'تاريخ',
  '• ·2·30',
  'Date',
  'توقيع',
  'Signature',
  '#30000322 81/83642A 1440823011',
].join('\n');

describe('a shekel cheque whose amount box is printed with a rule', () => {
  const fields = parseChequeText({ text: SHEKEL_CHEQUE_WITH_A_RULE, engineConfidence: 1 });

  it('reads the whole grouped figure, not the part before the separator', () => {
    expect(fields.numericAmount.value).toBe('70000');
  });

  it('reads the shekel', () => {
    expect(fields.currency.value).toBe('ILS');
  });

  it('doubts both readings when they disagree, not just the words', () => {
    // Ten thousand in words against seventy thousand in the box. Scoring only
    // the words down would treat the figure as the authority — and on this
    // cheque the figure is the one that is wrong.
    expect(fields.writtenAmount.confidence).toBeLessThan(0.5);
    expect(fields.numericAmount.confidence).toBeLessThan(0.5);
  });

  it('still reads the words as ten thousand', () => {
    expect(parseArabicAmountWords(fields.writtenAmount.value ?? '')).toBe(10000);
  });

  it('gets the rest of the record', () => {
    expect(fields.chequeNumber.value).toBe('30000321');
    expect(fields.accountNumber.value).toBe('1440823011');
    expect(fields.drawerName.value).toBe('حسام رائد عوده عبدالنبي');
    expect(fields.bankName.value).toMatch(/الإسلامي|Islamic/);
  });
});
