-- Phones that have asked to be told when a cheque comes due.
--
-- The reminder rows have existed since the beginning, but nothing ever sent
-- them: a reminder was a line in a feed that had to be opened to be seen. This
-- is the other half — somewhere to deliver to.
--
-- The token is the identity, not the user. A phone handed to a colleague signs
-- in as someone else and has to start delivering to them; keying on the token
-- and reassigning its user on registration is what makes that happen instead of
-- the device quietly notifying the person who first set it up.

CREATE TYPE "DevicePlatform" AS ENUM ('IOS', 'ANDROID');

CREATE TABLE "device_tokens" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "platform" "DevicePlatform" NOT NULL,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "device_tokens_token_key" ON "device_tokens"("token");
CREATE INDEX "device_tokens_user_id_idx" ON "device_tokens"("user_id");
CREATE INDEX "device_tokens_organization_id_idx" ON "device_tokens"("organization_id");

-- A deleted user's phone must stop being told about that organization's money.
ALTER TABLE "device_tokens"
    ADD CONSTRAINT "device_tokens_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
