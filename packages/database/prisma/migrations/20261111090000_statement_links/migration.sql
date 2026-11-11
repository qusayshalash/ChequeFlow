-- Links that show one contact its own statement, without an account.
--
-- Only a hash of each token is kept, so a copy of this table hands out no
-- working link. A link ends on its own (expires_at) or when revoked.

CREATE TABLE "statement_links" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "contact_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "last_viewed_at" TIMESTAMPTZ(3),

    CONSTRAINT "statement_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "statement_links_token_hash_key" ON "statement_links"("token_hash");
CREATE INDEX "statement_links_organization_id_contact_id_idx" ON "statement_links"("organization_id", "contact_id");

ALTER TABLE "statement_links" ADD CONSTRAINT "statement_links_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "statement_links" ADD CONSTRAINT "statement_links_contact_id_fkey"
  FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "statement_links" ADD CONSTRAINT "statement_links_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
