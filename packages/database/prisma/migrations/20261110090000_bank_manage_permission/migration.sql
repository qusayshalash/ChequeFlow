-- Managing banks becomes a permission of its own, held by owners and admins.
--
-- It sat behind settings.manage, which only the owner holds, so an admin who
-- runs the office day to day could not add the bank a new cheque was drawn
-- on. Bootstrap writes the catalogue only into an empty database, so the
-- organizations that exist get the new key and its grants here.

INSERT INTO "permissions" ("id", "key", "description")
VALUES (gen_random_uuid(), 'bank.manage', 'Manage banks')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE p."key" = 'bank.manage'
  AND r."is_system" = true
  AND r."name" IN ('OWNER', 'ADMIN')
ON CONFLICT DO NOTHING;
