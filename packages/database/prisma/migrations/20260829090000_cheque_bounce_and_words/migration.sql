-- Written amount and bounce details.
--
-- `amount_in_words` holds the amount as written in letters on the cheque face.
-- It is kept verbatim because in most jurisdictions the written amount prevails
-- over the numeric one when the two disagree.
--
-- `bounce_reason` / `bounce_fee` record what the bank said and charged when it
-- refused payment. They stay on the cheque after it is re-presented or returned,
-- so the history of a bounced cheque is never lost.

ALTER TABLE "cheques" ADD COLUMN "amount_in_words" TEXT;
ALTER TABLE "cheques" ADD COLUMN "bounce_reason" TEXT;
ALTER TABLE "cheques" ADD COLUMN "bounce_fee" DECIMAL(18,2);

-- A fee is a cost, never a credit.
ALTER TABLE "cheques"
  ADD CONSTRAINT "cheques_bounce_fee_non_negative" CHECK ("bounce_fee" IS NULL OR "bounce_fee" >= 0);

-- Reminders a person set by hand.
--
-- `custom` marks a reminder that was not derived from the due-date schedule.
-- The automatic reminders are deleted and recomputed whenever a cheque moves,
-- so without this flag a manually chosen reminder would silently disappear the
-- next time anything happened to the cheque.
ALTER TABLE "reminders" ADD COLUMN "custom" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "reminders" ADD COLUMN "note" TEXT;
ALTER TABLE "reminders" ADD COLUMN "acknowledged_at" TIMESTAMPTZ(3);
