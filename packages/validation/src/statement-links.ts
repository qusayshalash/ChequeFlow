import { z } from 'zod';

/** How long a share link lives. A link that never ends is a leak waiting. */
export const STATEMENT_LINK_DAYS = [1, 7, 14, 30] as const;

export const createStatementLinkSchema = z.object({
  days: z
    .union(
      STATEMENT_LINK_DAYS.map((days) => z.literal(days)) as unknown as [
        z.ZodLiteral<1>,
        z.ZodLiteral<7>,
        z.ZodLiteral<14>,
        z.ZodLiteral<30>,
      ],
    )
    .default(7),
});
export type CreateStatementLinkInput = z.infer<typeof createStatementLinkSchema>;
