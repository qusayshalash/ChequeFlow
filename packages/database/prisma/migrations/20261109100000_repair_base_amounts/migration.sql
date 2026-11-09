-- Repairs converted amounts left wrong by two bugs, both fixed in the code
-- that writes them:
--
--  * Reviewing a photographed cheque set its real amount and kept the
--    converted amount of the 1.00 placeholder.
--  * Changing a cheque's currency kept the old currency's rate, so a dollar
--    cheque changed to shekels carried a rate of 1 and counted shekels as
--    dollars.
--
-- Measured on one organization before this ran: its in-hand dollar cheques
-- came to 73,002.00 and their converted total to 54,005.00, in a business
-- that keeps its books in dollars.
--
-- Converted amounts are derived data, recomputed here from what each cheque
-- already records; no amount, currency or status is touched.

-- 1. In the books' currency the conversion is the identity.
UPDATE "cheques" c
SET "exchange_rate" = 1,
    "amount_base"   = c."amount"
FROM "organizations" o
WHERE o."id" = c."organization_id"
  AND c."currency" = o."base_currency"
  AND (c."amount_base" IS DISTINCT FROM c."amount"
       OR c."exchange_rate" IS DISTINCT FROM 1);

-- 2. A rate of exactly 1 between two different currencies is the inherited
--    one, not a rate anyone recorded. The cheque goes back to unconverted,
--    which the dashboard counts and says so, rather than keeping a figure no
--    document supports.
UPDATE "cheques" c
SET "exchange_rate" = NULL,
    "amount_base"   = NULL
FROM "organizations" o
WHERE o."id" = c."organization_id"
  AND c."currency" <> o."base_currency"
  AND c."exchange_rate" = 1;

-- 3. Any other recorded rate: the converted amount follows from it, rounded
--    half up to cents as the application does.
UPDATE "cheques" c
SET "amount_base" = ROUND(c."amount" * c."exchange_rate", 2)
FROM "organizations" o
WHERE o."id" = c."organization_id"
  AND c."currency" <> o."base_currency"
  AND c."exchange_rate" IS NOT NULL
  AND c."amount_base" IS DISTINCT FROM ROUND(c."amount" * c."exchange_rate", 2);
