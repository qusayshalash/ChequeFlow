-- What happened after a cheque bounced, and how much one customer may owe.

-- ── the replacement chain ────────────────────────────────────────────────────
--
-- The system already recorded why the bank refused a cheque and what it
-- charged, and then the thread ended. In practice a bounced cheque is either
-- re-presented or replaced by a new one, and without a link between the two the
-- customer's history reads cleaner than it was: three replacements for the same
-- debt look like three separate cheques that happened to be written.
ALTER TABLE "cheques" ADD COLUMN "replaces_cheque_id" UUID;

ALTER TABLE "cheques"
  ADD CONSTRAINT "cheques_replaces_cheque_id_fkey"
  FOREIGN KEY ("replaces_cheque_id") REFERENCES "cheques"("id") ON DELETE SET NULL;

-- A cheque cannot replace itself. Longer cycles are prevented in the service,
-- which walks the chain before writing; this catches the one case a database
-- can catch on its own.
ALTER TABLE "cheques"
  ADD CONSTRAINT "cheques_replaces_not_self"
  CHECK ("replaces_cheque_id" IS NULL OR "replaces_cheque_id" <> "id");

-- Reading the chain forwards ("what replaced this?") is the common direction.
CREATE INDEX "cheques_replaces_cheque_id_idx" ON "cheques"("replaces_cheque_id");

-- ── credit limit ─────────────────────────────────────────────────────────────
--
-- The ceiling of uncollected cheques a business is willing to hold from one
-- customer. It carries its own currency: a limit means nothing without one, and
-- this system refuses to add dollars to shekels anywhere else either.
--
-- Both columns are optional. A customer with no limit set is not "unlimited" in
-- any meaningful sense — nobody has decided yet, and the reports say exactly
-- that rather than inventing a ceiling.
ALTER TABLE "contacts" ADD COLUMN "credit_limit" DECIMAL(18,2);
ALTER TABLE "contacts" ADD COLUMN "credit_limit_currency" CHAR(3);

ALTER TABLE "contacts"
  ADD CONSTRAINT "contacts_credit_limit_positive"
  CHECK ("credit_limit" IS NULL OR "credit_limit" > 0);

-- The amount and its currency travel together, like the exchange rate and the
-- converted amount on a cheque: a ceiling with no currency cannot be compared
-- to anything.
ALTER TABLE "contacts"
  ADD CONSTRAINT "contacts_credit_limit_complete"
  CHECK (("credit_limit" IS NULL) = ("credit_limit_currency" IS NULL));
