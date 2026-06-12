-- Rollback for init migration.
DROP INDEX IF EXISTS idx_loans_idempotency;
DROP INDEX IF EXISTS idx_loans_status;
DROP INDEX IF EXISTS idx_loans_user_status;
DROP INDEX IF EXISTS idx_loans_book_id;
DROP TABLE IF EXISTS loans;
