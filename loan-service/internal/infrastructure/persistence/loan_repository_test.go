package persistence

import (
	"context"
	"testing"
	"time"

	"github.com/example/loan-service/internal/domain"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func newTestDB(t *testing.T) *gorm.DB {
	t.Helper()

	dsn := "file:" + t.Name() + "?mode=memory&cache=shared&_busy_timeout=5000"
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	require.NoError(t, err)

	stmts := []string{
		`CREATE TABLE IF NOT EXISTS loans (
			id TEXT PRIMARY KEY,
			book_id TEXT NOT NULL,
			user_id TEXT NOT NULL,
			borrowed_at DATETIME NOT NULL,
			returned_at DATETIME,
			status TEXT NOT NULL DEFAULT 'active',
			idempotency_key TEXT,
			created_at DATETIME NOT NULL,
			updated_at DATETIME NOT NULL
		)`,
		`CREATE INDEX IF NOT EXISTS idx_loans_book_id ON loans (book_id)`,
		`CREATE INDEX IF NOT EXISTS idx_loans_user_status ON loans (user_id, status)`,
		`CREATE INDEX IF NOT EXISTS idx_loans_status ON loans (status)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_loans_idempotency ON loans (idempotency_key) WHERE idempotency_key IS NOT NULL AND idempotency_key <> ''`,
	}
	for _, s := range stmts {
		require.NoError(t, db.Exec(s).Error, s)
	}
	return db
}

func newLoanFixture() *domain.Loan {
	now := time.Now().UTC()
	return &domain.Loan{
		ID:         uuid.New(),
		BookID:     uuid.New(),
		UserID:     uuid.New(),
		BorrowedAt: now,
		Status:     domain.LoanStatusActive,
		CreatedAt:  now,
		UpdatedAt:  now,
	}
}

func TestLoanRepository_Create_and_FindByID(t *testing.T) {
	ctx := context.Background()
	repo := NewLoanRepositoryWithDB(newTestDB(t))

	loan := newLoanFixture()
	require.NoError(t, repo.Create(ctx, loan))

	got, err := repo.FindByID(ctx, loan.ID)
	require.NoError(t, err)
	assert.Equal(t, loan.ID, got.ID)
	assert.Equal(t, loan.BookID, got.BookID)
	assert.Equal(t, loan.UserID, got.UserID)
	assert.Equal(t, domain.LoanStatusActive, got.Status)
}

func TestLoanRepository_FindByID_NotFound(t *testing.T) {
	ctx := context.Background()
	repo := NewLoanRepositoryWithDB(newTestDB(t))

	_, err := repo.FindByID(ctx, uuid.New())
	assert.ErrorIs(t, err, domain.ErrLoanNotFound)
}

func TestLoanRepository_FindByIdempotencyKey(t *testing.T) {
	ctx := context.Background()
	repo := NewLoanRepositoryWithDB(newTestDB(t))

	loan, err := repo.FindByIdempotencyKey(ctx, "")
	require.NoError(t, err)
	assert.Nil(t, loan)

	want := newLoanFixture()
	want.IdempotencyKey = "idem-123"
	require.NoError(t, repo.Create(ctx, want))

	got, err := repo.FindByIdempotencyKey(ctx, "idem-123")
	require.NoError(t, err)
	require.NotNil(t, got)
	assert.Equal(t, want.ID, got.ID)
}

func TestLoanRepository_Update_marks_returned(t *testing.T) {
	ctx := context.Background()
	repo := NewLoanRepositoryWithDB(newTestDB(t))

	loan := newLoanFixture()
	require.NoError(t, repo.Create(ctx, loan))

	returnedAt := time.Now().UTC().Add(2 * time.Hour)
	require.NoError(t, loan.MarkReturned(returnedAt))
	require.NoError(t, repo.Update(ctx, loan))

	got, err := repo.FindByID(ctx, loan.ID)
	require.NoError(t, err)
	assert.Equal(t, domain.LoanStatusReturned, got.Status)
	require.NotNil(t, got.ReturnedAt)
	assert.WithinDuration(t, returnedAt, *got.ReturnedAt, time.Second)
}

func TestLoanRepository_Update_missing_id_creates_row(t *testing.T) {
	ctx := context.Background()
	repo := NewLoanRepositoryWithDB(newTestDB(t))

	loan := newLoanFixture()
	loan.Status = domain.LoanStatusReturned
	err := repo.Update(ctx, loan)
	assert.NoError(t, err)

	got, err := repo.FindByID(ctx, loan.ID)
	require.NoError(t, err)
	assert.Equal(t, domain.LoanStatusReturned, got.Status)
}

func TestLoanRepository_CountActiveByBookID(t *testing.T) {
	ctx := context.Background()
	repo := NewLoanRepositoryWithDB(newTestDB(t))

	bookID := uuid.New()

	for i := 0; i < 2; i++ {
		l := newLoanFixture()
		l.BookID = bookID
		require.NoError(t, repo.Create(ctx, l))
	}
	lr := newLoanFixture()
	lr.BookID = bookID
	require.NoError(t, repo.Create(ctx, lr))
	returnedAt := time.Now().UTC()
	require.NoError(t, lr.MarkReturned(returnedAt))
	require.NoError(t, repo.Update(ctx, lr))

	n, err := repo.CountActiveByBookID(ctx, bookID)
	require.NoError(t, err)
	assert.Equal(t, int64(2), n)
}

func TestLoanRepository_List_paginates_and_filters(t *testing.T) {
	ctx := context.Background()
	repo := NewLoanRepositoryWithDB(newTestDB(t))

	userID := uuid.New()
	bookID := uuid.New()

	for i := 0; i < 5; i++ {
		l := newLoanFixture()
		l.UserID = userID
		l.BookID = bookID

		l.BorrowedAt = time.Now().UTC().Add(time.Duration(-i) * time.Minute)
		require.NoError(t, repo.Create(ctx, l))
	}

	other := newLoanFixture()
	require.NoError(t, repo.Create(ctx, other))

	t.Run("page 1, size 2", func(t *testing.T) {
		items, total, err := repo.List(ctx, domain.LoanFilter{
			UserID: &userID, Page: 1, PageSize: 2,
		})
		require.NoError(t, err)
		assert.Equal(t, int64(5), total)
		require.Len(t, items, 2)
	})
	t.Run("page 3, size 2 returns 1 (last partial page)", func(t *testing.T) {
		items, total, err := repo.List(ctx, domain.LoanFilter{
			UserID: &userID, Page: 3, PageSize: 2,
		})
		require.NoError(t, err)
		assert.Equal(t, int64(5), total)
		require.Len(t, items, 1)
	})
	t.Run("filter by user excludes other user's loan", func(t *testing.T) {
		_, total, err := repo.List(ctx, domain.LoanFilter{UserID: &userID})
		require.NoError(t, err)
		assert.Equal(t, int64(5), total)
	})
	t.Run("empty filter returns everything", func(t *testing.T) {
		_, total, err := repo.List(ctx, domain.LoanFilter{})
		require.NoError(t, err)
		assert.Equal(t, int64(6), total)
	})
}
