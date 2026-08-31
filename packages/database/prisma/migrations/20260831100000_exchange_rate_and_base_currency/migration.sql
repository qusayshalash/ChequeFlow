-- Recording what a foreign-currency cheque was worth when it arrived.
--
-- The dashboard deliberately refuses to add dollars to shekels: a single mixed
-- total is a number nobody can act on. But a business still needs one figure
-- for the bank and the accountant, and the honest way to produce it is to
-- record the rate at the moment the cheque was taken in — not to apply today's
-- rate to a cheque received last year.
--
-- `base_currency` is the currency the books are kept in. It starts equal to the
-- organization's default entry currency, which is the right answer for anyone
-- who has not thought about it yet, and can be changed independently after.
ALTER TABLE "organizations" ADD COLUMN "base_currency" CHAR(3);
UPDATE "organizations" SET "base_currency" = "default_currency" WHERE "base_currency" IS NULL;
ALTER TABLE "organizations" ALTER COLUMN "base_currency" SET NOT NULL;

-- The rate that converts one unit of the cheque's currency into the base
-- currency, as it stood when the cheque was recorded. Six decimal places
-- because a rate is a ratio, not money: two would round ILS→USD into noise.
ALTER TABLE "cheques" ADD COLUMN "exchange_rate" DECIMAL(18,6);

-- The converted amount, stored rather than derived.
--
-- It is a historical fact, not a calculation to repeat: recomputing it later
-- from a rate column would still be correct, but aggregating across thousands
-- of cheques in SQL is far cheaper against a stored column, and reports are
-- where this number is actually used.
ALTER TABLE "cheques" ADD COLUMN "amount_base" DECIMAL(18,2);

-- A rate is a positive ratio. Zero would silently erase a cheque from every
-- base-currency total; a negative one is meaningless.
ALTER TABLE "cheques"
  ADD CONSTRAINT "cheques_exchange_rate_positive"
  CHECK ("exchange_rate" IS NULL OR "exchange_rate" > 0);

-- The two columns travel together. One without the other is a cheque that
-- claims to be converted but has no figure, or carries a figure nobody can
-- trace back to a rate.
ALTER TABLE "cheques"
  ADD CONSTRAINT "cheques_conversion_complete"
  CHECK (("exchange_rate" IS NULL) = ("amount_base" IS NULL));

-- Cheques recorded before this migration keep NULL: nobody knows what the rate
-- was on the day they arrived, and inventing one would put a number in the
-- books that no document supports. Reports say how many are unconverted rather
-- than quietly leaving them out of the total.
