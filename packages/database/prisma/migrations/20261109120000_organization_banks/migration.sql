-- Banks an organization adds for itself, beside the shared reference list.
--
-- Until now every bank was reference data with no owner and nothing could
-- add one, so a cheque drawn on a bank outside the eight in the list could
-- only carry the bank's name as free text, outside every per-bank figure.

ALTER TABLE "banks"
  ADD COLUMN "organization_id" UUID,
  ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "banks"
  ADD CONSTRAINT "banks_organization_id_fkey" FOREIGN KEY ("organization_id")
  REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "banks_organization_id_idx" ON "banks"("organization_id");

-- A code is unique among the reference banks, and within each organization's
-- own; an organization may reuse a code the reference list does not have.
DROP INDEX "banks_country_code_key";
CREATE UNIQUE INDEX "banks_reference_country_code_key" ON "banks"("country", "code")
  WHERE "organization_id" IS NULL;
CREATE UNIQUE INDEX "banks_organization_country_code_key" ON "banks"("organization_id", "country", "code")
  WHERE "organization_id" IS NOT NULL;
