/**
 * The banks a cheque can be drawn on. Reference data, not demo data: they are
 * real banks, and a new organization needs them before its first cheque can
 * name one. Shared by the development seed and the production bootstrap.
 */
export const REFERENCE_BANKS = [
  { country: 'PS', code: 'PALS', name: 'بنك فلسطين' },
  { country: 'PS', code: 'QUDS', name: 'بنك القدس' },
  { country: 'PS', code: 'NBNK', name: 'البنك الوطني' },
  { country: 'PS', code: 'PIBC', name: 'البنك الإسلامي الفلسطيني' },
  { country: 'PS', code: 'AIBA', name: 'البنك الإسلامي العربي' },
  { country: 'PS', code: 'ARAB', name: 'البنك العربي' },
  { country: 'PS', code: 'CAIR', name: 'بنك القاهرة عمان' },
  { country: 'PS', code: 'JOBA', name: 'بنك الأردن' },
] as const;
