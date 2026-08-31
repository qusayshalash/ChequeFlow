import { z } from 'zod';

/**
 * A restore request.
 *
 * The archive is validated only as far as the restore actually needs: the
 * format version and the shape of `data`. Every row is re-validated against
 * the database's own constraints when it is inserted, so a hand-edited archive
 * cannot smuggle in an amount that is not a number or a status that does not
 * exist — the transaction simply fails and nothing is written.
 */
export const restoreBackupSchema = z.object({
  archive: z.object({
    format: z.number().int(),
    exportedAt: z.string(),
    organization: z.object({
      id: z.string(),
      name: z.string(),
      country: z.string(),
      defaultCurrency: z.string(),
    }),
    data: z.object({
      branches: z.array(z.record(z.string(), z.unknown())).default([]),
      locations: z.array(z.record(z.string(), z.unknown())).default([]),
      contacts: z.array(z.record(z.string(), z.unknown())).default([]),
      banks: z.array(z.record(z.string(), z.unknown())).default([]),
      users: z.array(z.record(z.string(), z.unknown())).default([]),
      cheques: z.array(z.record(z.string(), z.unknown())).default([]),
      chequeEvents: z.array(z.record(z.string(), z.unknown())).default([]),
      reminders: z.array(z.record(z.string(), z.unknown())).default([]),
    }),
  }),
  /**
   * Typed by hand in the UI. A restore overwrites an organization's records
   * and cannot be undone, so it is not something a stray click should reach.
   */
  confirm: z.literal(true),
});
export type RestoreBackupInput = z.infer<typeof restoreBackupSchema>;
