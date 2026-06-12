-- Migration: init (loan-service, db_loans)
-- Source: internal/infrastructure/persistence/models.go
--
-- Creates the single loans table that loan-service (Préstamos) needs.
-- All GORM-style constraints are spelled out explicitly so that the
-- migration is reproducible and reviewable without reading the Go code.

-- Required for gen_random_uuid() on stock Postgres installations.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- loans -----------------------------------------------------------------------
--
-- Notes on the schema:
--   * status is varchar(20) with no CHECK constraint; allowed values
--     are enforced at the application layer (domain.LoanStatus).
--   * idempotency_key has a PARTIAL unique index so that NULL/empty
--     keys do not collide but a non-empty key is globally unique.
--     golang-migrate treats the WHERE clause as part of the index
--     definition; this is supported in Postgres.
--   * borrowed_at defaults to now() so service code can omit it on insert.

CREATE TABLE loans (
    id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    book_id          UUID         NOT NULL,
    user_id          UUID         NOT NULL,
    borrowed_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    returned_at      TIMESTAMPTZ,
    status           VARCHAR(20)  NOT NULL DEFAULT 'active',
    idempotency_key  VARCHAR(64),
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Plain indexes ---------------------------------------------------------------

CREATE INDEX idx_loans_book_id
    ON loans (book_id);

CREATE INDEX idx_loans_user_status
    ON loans (user_id, status);

CREATE INDEX idx_loans_status
    ON loans (status);

-- Partial unique index: enforces idempotency only when the key is set.
-- Rows with idempotency_key = '' or NULL are exempt.

CREATE UNIQUE INDEX idx_loans_idempotency
    ON loans (idempotency_key)
    WHERE idempotency_key IS NOT NULL AND idempotency_key <> '';
