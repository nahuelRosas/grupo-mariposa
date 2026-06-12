-- Migration: init
-- Source: prisma/schema.prisma
--
-- Creates the three tables that catalog-service (Catalog) needs to
-- operate:
--   - users:           catalog of borrowers + admins
--   - books:           catalog with total_stock and available_stock
--   - loans:           local *shadow* of loans; the source of truth
--                      for loan state lives in loan-service
--
-- All FKs use ON DELETE RESTRICT to avoid silent data loss.
-- Loans carry a `status` column (PENDING | ACTIVE | ROLLED_BACK) so
-- the saga in create-loan.usecase.ts can record its progress.

-- Required for gen_random_uuid(); in managed Postgres (RDS, Cloud SQL)
-- the extension is usually pre-installed.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Enums -----------------------------------------------------------------------

CREATE TYPE "Role" AS ENUM ('ADMIN', 'USER');

-- users -----------------------------------------------------------------------

CREATE TABLE "users" (
    "id"            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    "email"         TEXT         NOT NULL,
    "password_hash" TEXT         NOT NULL,
    "full_name"     TEXT         NOT NULL,
    "role"          "Role"       NOT NULL DEFAULT 'USER',
    "is_active"     BOOLEAN      NOT NULL DEFAULT true,
    "created_at"    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    "updated_at"    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX "users_email_key" ON "users" ("email");
CREATE INDEX        "users_email_idx" ON "users" ("email");
CREATE INDEX        "users_role_is_active_idx" ON "users" ("role", "is_active");

-- books -----------------------------------------------------------------------

CREATE TABLE "books" (
    "id"               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    "isbn"             VARCHAR(20)  NOT NULL,
    "title"            VARCHAR(255) NOT NULL,
    "author"           VARCHAR(255) NOT NULL,
    "publisher"        VARCHAR(255),
    "published_year"   INTEGER,
    "total_stock"      INTEGER      NOT NULL DEFAULT 0,
    "available_stock"  INTEGER      NOT NULL DEFAULT 0,
    "description"      TEXT,
    "created_at"       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    "updated_at"       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX "books_isbn_key" ON "books" ("isbn");
CREATE INDEX        "books_isbn_idx"  ON "books" ("isbn");
CREATE INDEX        "books_title_idx" ON "books" ("title");
CREATE INDEX        "books_author_idx" ON "books" ("author");

-- loans (local shadow) --------------------------------------------------------

CREATE TABLE "loans" (
    "id"               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    "remote_loan_id"   UUID,
    "user_id"          UUID         NOT NULL,
    "book_id"          UUID         NOT NULL,
    "status"           TEXT         NOT NULL DEFAULT 'PENDING',
    "created_at"       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    "updated_at"       TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT "loans_user_id_fkey"
        FOREIGN KEY ("user_id") REFERENCES "users" ("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "loans_book_id_fkey"
        FOREIGN KEY ("book_id") REFERENCES "books" ("id")
        ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "loans_remote_loan_id_key" ON "loans" ("remote_loan_id");
CREATE INDEX        "loans_user_id_idx"  ON "loans" ("user_id");
CREATE INDEX        "loans_book_id_idx"  ON "loans" ("book_id");
CREATE INDEX        "loans_status_idx"   ON "loans" ("status");
CREATE INDEX        "loans_created_at_idx" ON "loans" ("created_at");
