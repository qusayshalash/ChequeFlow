-- Cheques already in the books' currency convert at 1.
--
-- This is an identity, not a guess: a dollar cheque in a business that keeps
-- its books in dollars is worth exactly its face value, whatever the day. So
-- these rows can be filled in safely, and leaving them empty would report a
-- business with no foreign cheques at all as having nothing convertible.
--
-- Cheques in a *different* currency are deliberately left alone. Nobody knows
-- what the rate was on the day they arrived, and inventing one would put a
-- figure in the books that no document supports. Those are counted and
-- reported as unconverted instead.
UPDATE "cheques" c
SET "exchange_rate" = 1,
    "amount_base"   = c."amount"
FROM "organizations" o
WHERE o."id" = c."organization_id"
  AND c."currency" = o."base_currency"
  AND c."exchange_rate" IS NULL;
