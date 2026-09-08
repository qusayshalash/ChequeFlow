/**
 * The amount a cheque is written out in, in Arabic words.
 *
 * Two jobs, and the second is what makes the first safe to do at all.
 *
 * Recognition mangles this line more than any other on the cheque: it is
 * handwritten, it is cursive, and the engine has no idea it is reading
 * numbers. A real one came back as `تسعة الان دولار لاغير` — "nine the-now
 * dollars" — for a cheque written `تسعة آلاف دولار لا غير`. `الان` is not a
 * word that appears in an amount, and neither is `نسمة`; they are `آلاف` and
 * `تسعة` misread.
 *
 * Correcting them is tempting and, on its own, reckless. The written amount is
 * the one that prevails in a dispute, so a confident-looking repair that
 * happens to be wrong is worse than an obviously garbled line the reviewer
 * cannot help but check. So nothing is corrected on its own authority: the
 * repaired words are read back as a number and compared with the figure in the
 * amount box. Two independent readings agreeing is evidence. One reading
 * "cleaned up" until it looks right is not.
 */

/**
 * Misreadings seen in the wild, and only those.
 *
 * Not a spellchecker and not a fuzzy match: each entry is a specific shape
 * recognition produces for a specific number word. A guess added here becomes
 * a guess in the field that decides what a cheque is worth.
 */
const MISREADINGS: Readonly<Record<string, string>> = {
  // `آلاف` loses its hamza and its lam-alef ligature, and lands on a common word.
  الان: 'آلاف',
  آلان: 'آلاف',
  // `تسعة` picks up a nun from the neighbouring ligature.
  نسمة: 'تسعة',
  تسمة: 'تسعة',
  // Most people write `لا غير` closed up, and it comes back as one token.
  لاغير: 'لا غير',
};

/** Standalone number words, before any multiplier is applied. */
const UNITS: Readonly<Record<string, number>> = {
  صفر: 0,
  واحد: 1, احد: 1, أحد: 1, إحدى: 1, احدى: 1,
  اثنان: 2, اثنين: 2, إثنان: 2, اثنتان: 2,
  ثلاثة: 3, ثلاث: 3,
  اربعة: 4, أربعة: 4, اربع: 4, أربع: 4,
  خمسة: 5, خمس: 5,
  ستة: 6, ست: 6,
  سبعة: 7, سبع: 7,
  ثمانية: 8, ثماني: 8, ثمان: 8,
  تسعة: 9, تسع: 9,
  عشرة: 10, عشر: 10,
  عشرون: 20, عشرين: 20,
  ثلاثون: 30, ثلاثين: 30,
  اربعون: 40, أربعون: 40, اربعين: 40, أربعين: 40,
  خمسون: 50, خمسين: 50,
  ستون: 60, ستين: 60,
  سبعون: 70, سبعين: 70,
  ثمانون: 80, ثمانين: 80,
  تسعون: 90, تسعين: 90,
  مئة: 100, مائة: 100,
  مئتان: 200, مئتين: 200, مائتان: 200, مائتين: 200,
  الف: 1000, ألف: 1000, إلف: 1000,
  الفان: 2000, ألفان: 2000, الفين: 2000, ألفين: 2000,
  مليون: 1_000_000, مليونان: 2_000_000, مليونين: 2_000_000,
};

/** Words that multiply what came before them rather than adding to it. */
const MULTIPLIERS: Readonly<Record<string, number>> = {
  آلاف: 1000, الاف: 1000, ألاف: 1000,
  ملايين: 1_000_000, مليون: 1_000_000,
  مئة: 100, مائة: 100,
};

/** Currency names and filler that carry no numeric value. */
const IGNORED =
  /^(دولار|دولارا|دولارات|شيكل|شيقل|شواقل|دينار|دنانير|يورو|جنيه|درهم|ريال|فقط|لا|غير|و|فلس|فلسا|سنت|سنتا|قرش|قرشا)$/;

/** Strips the diacritics and hamza forms that recognition renders unreliably. */
function fold(word: string): string {
  return word
    .replace(/[ً-ْـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه');
}

const FOLDED_UNITS = new Map(Object.entries(UNITS).map(([word, value]) => [fold(word), value]));
const FOLDED_MULTIPLIERS = new Map(
  Object.entries(MULTIPLIERS).map(([word, value]) => [fold(word), value]),
);

/**
 * Repairs the misreadings above. Nothing else is touched.
 *
 * Returns the text unchanged when it recognises nothing, so a line this does
 * not understand reaches the reviewer exactly as the engine produced it.
 */
export function repairArabicAmountWords(text: string): string {
  // Whole tokens, not a regular expression. JavaScript's `\b` is defined over
  // ASCII word characters, so it does not mark a boundary between Arabic
  // letters at all — a pattern written with it silently matches nothing here.
  return text
    .split(/\s+/)
    .map((word) => MISREADINGS[word] ?? word)
    .join(' ')
    .trim();
}

/**
 * Reads Arabic amount words back into a number.
 *
 * `null` whenever the text does not resolve cleanly — an unknown word that is
 * not currency or filler, or no number words at all. A partial reading is not
 * returned: the point of this is to corroborate the figure, and a number built
 * from half a sentence corroborates nothing.
 */
export function parseArabicAmountWords(text: string): number | null {
  const words = text.split(/[\s،,.-]+/).map(fold).filter(Boolean);
  if (words.length === 0) return null;

  let total = 0;
  let group = 0;
  let sawNumber = false;

  for (const raw of words) {
    // `و` is written joined to what follows — `ومئتان` is "and two hundred".
    const word = raw.length > 1 && raw.startsWith('و') && !FOLDED_UNITS.has(raw) && !FOLDED_MULTIPLIERS.has(raw)
      ? raw.slice(1)
      : raw;
    if (IGNORED.test(word)) continue;

    const multiplier = FOLDED_MULTIPLIERS.get(word);
    if (multiplier !== undefined && group > 0) {
      // `تسعة آلاف` — the running group is multiplied and banked.
      total += group * multiplier;
      group = 0;
      sawNumber = true;
      continue;
    }

    const unit = FOLDED_UNITS.get(word);
    if (unit === undefined) return null;

    if (unit >= 1000 && group > 0) {
      total += group * unit;
      group = 0;
    } else if (unit === 100 && group > 0) {
      group *= unit;
    } else {
      group += unit;
    }
    sawNumber = true;
  }

  return sawNumber ? total + group : null;
}
