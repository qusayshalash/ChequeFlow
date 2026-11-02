-- Locking an account after repeated failed sign-ins.
--
-- Sign-in was limited per IP address only. Someone guessing at one account
-- from several addresses had no limit at all, and every failure was written
-- to the audit trail and acted on by nothing. The count lives on the user so
-- the check is one row read; the audit trail still records every attempt.

ALTER TABLE "users" ADD COLUMN "failed_login_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN "locked_until" TIMESTAMPTZ(3);
