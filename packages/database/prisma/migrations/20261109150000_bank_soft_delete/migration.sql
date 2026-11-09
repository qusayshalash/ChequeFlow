-- An organization's own bank can be deleted, softly as everything else is.
--
-- Only a bank no cheque has ever been drawn on can go (the API refuses the
-- rest, which can be hidden instead), so nothing points at a deleted one.
-- Its code is freed for reuse: the uniqueness of codes counts live banks only.

ALTER TABLE "banks" ADD COLUMN "deleted_at" TIMESTAMPTZ(3);

DROP INDEX "banks_organization_country_code_key";
CREATE UNIQUE INDEX "banks_organization_country_code_key" ON "banks"("organization_id", "country", "code")
  WHERE "organization_id" IS NOT NULL AND "deleted_at" IS NULL;
