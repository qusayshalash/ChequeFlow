-- Make the cheque ledger and the audit trail append-only.
--
-- `cheque_events` and `audit_logs` may only ever be INSERTed. Any UPDATE or
-- DELETE — from the API, a migration, or a psql session — raises an error.
-- This also blocks cascaded deletes: removing a cheque or an organization
-- fails while its ledger rows exist, which is the intended guarantee. The
-- application never hard-deletes anything (cheques carry `deleted_at`).
-- Maintenance that genuinely must purge data can run, as superuser:
--   SET LOCAL session_replication_role = 'replica';
-- inside an explicit transaction.

CREATE OR REPLACE FUNCTION prevent_row_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION
    'Table % is append-only: % is not permitted', TG_TABLE_NAME, TG_OP
    USING ERRCODE = '2F004';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER cheque_events_append_only
  BEFORE UPDATE OR DELETE ON "cheque_events"
  FOR EACH ROW EXECUTE FUNCTION prevent_row_mutation();

CREATE TRIGGER audit_logs_append_only
  BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION prevent_row_mutation();

-- Cheque amounts must be positive; a zero or negative cheque is a data error.
ALTER TABLE "cheques"
  ADD CONSTRAINT "cheques_amount_positive" CHECK ("amount" > 0);

-- A cheque cannot be due before it was issued.
ALTER TABLE "cheques"
  ADD CONSTRAINT "cheques_due_after_issue"
  CHECK ("issue_date" IS NULL OR "due_date" >= "issue_date");
