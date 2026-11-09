/**
 * The form of a bank name that two spellings of one bank share.
 *
 * Arabic is written several ways that read as the same word: a hamza on the
 * alef or not (الإسلامي / الاسلامي), a final taa marbuta or haa, a final yaa
 * with or without dots, vowel marks, the stretching tatweel. Comparing names
 * as typed let «البنك الاسلامي الفلسطيني» in next to «البنك الإسلامي
 * الفلسطيني», and a picker then offered the same bank twice.
 */
export function foldBankName(name: string): string {
  return (
    name
      .normalize('NFC')
      .toLowerCase()
      // Vowel marks, shadda, sukun, superscript alef; and the tatweel.
      .replace(/[ً-ٰٟـ]/g, '')
      .replace(/[أإآٱ]/g, 'ا')
      .replace(/ة/g, 'ه')
      .replace(/ى/g, 'ي')
      .replace(/ؤ/g, 'و')
      .replace(/ئ/g, 'ي')
      // Punctuation and spacing are not part of a name's identity.
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim()
  );
}
