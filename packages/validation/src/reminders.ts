import { z } from 'zod';

import { isoDateTimeSchema, longTextSchema } from './primitives.js';

/**
 * Snooze durations are given in minutes so the client can offer whatever
 * shortcuts it likes ("1 hour", "tomorrow morning") without the API needing to
 * know about any of them. Capped at 90 days: a reminder pushed further than
 * that is really a new due date, and should be handled as a postponement.
 */
export const snoozeReminderSchema = z.object({
  minutes: z.coerce
    .number()
    .int()
    .min(1)
    .max(60 * 24 * 90),
});
export type SnoozeReminderInput = z.infer<typeof snoozeReminderSchema>;

export const createReminderSchema = z.object({
  remindAt: isoDateTimeSchema,
  note: longTextSchema.optional(),
});
export type CreateReminderInput = z.infer<typeof createReminderSchema>;

/**
 * Logging a WhatsApp reminder a person has just sent themselves.
 *
 * Only a note: the recipient, the time and the channel are all facts the server
 * already knows or can see, and accepting them from the client would let a
 * record be written that says something other than what happened.
 */
export const createWhatsAppReminderSchema = z.object({
  note: longTextSchema.optional(),
});
export type CreateWhatsAppReminderInput = z.infer<typeof createWhatsAppReminderSchema>;
