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

/**
 * Inserts the reference banks, or renames them to the current spelling.
 *
 * By lookup rather than upsert: the code is unique only among banks with no
 * organization, which is a partial index Prisma cannot address by name.
 */
export async function ensureReferenceBanks(db: {
  bank: {
    findFirst(args: {
      where: { country: string; code: string; organizationId: null };
      select: { id: true };
    }): Promise<{ id: string } | null>;
    update(args: { where: { id: string }; data: { name: string } }): Promise<unknown>;
    create(args: { data: { country: string; code: string; name: string } }): Promise<unknown>;
  };
}): Promise<void> {
  for (const bank of REFERENCE_BANKS) {
    const existing = await db.bank.findFirst({
      where: { country: bank.country, code: bank.code, organizationId: null },
      select: { id: true },
    });
    if (existing) {
      await db.bank.update({ where: { id: existing.id }, data: { name: bank.name } });
    } else {
      await db.bank.create({ data: { country: bank.country, code: bank.code, name: bank.name } });
    }
  }
}
