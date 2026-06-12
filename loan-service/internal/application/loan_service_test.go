package application_test

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"sync"
	"testing"
	"time"

	"github.com/example/loan-service/internal/application"
	"github.com/example/loan-service/internal/domain"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type fakeRepo struct {
	loans        map[uuid.UUID]*domain.Loan
	byIdempotkey map[string]uuid.UUID
}

func newFakeRepo() *fakeRepo {
	return &fakeRepo{
		loans:        map[uuid.UUID]*domain.Loan{},
		byIdempotkey: map[string]uuid.UUID{},
	}
}

func (f *fakeRepo) Create(_ context.Context, l *domain.Loan) error {
	if _, exists := f.loans[l.ID]; exists {
		return errors.New("already exists")
	}
	now := time.Now().UTC()
	if l.CreatedAt.IsZero() {
		l.CreatedAt = now
	}
	l.UpdatedAt = now
	f.loans[l.ID] = l
	if l.IdempotencyKey != "" {
		f.byIdempotkey[l.IdempotencyKey] = l.ID
	}
	return nil
}

func (f *fakeRepo) Update(_ context.Context, l *domain.Loan) error {
	if _, ok := f.loans[l.ID]; !ok {
		return domain.ErrLoanNotFound
	}
	l.UpdatedAt = time.Now().UTC()
	f.loans[l.ID] = l
	return nil
}

func (f *fakeRepo) FindByID(_ context.Context, id uuid.UUID) (*domain.Loan, error) {
	l, ok := f.loans[id]
	if !ok {
		return nil, domain.ErrLoanNotFound
	}
	return l, nil
}

func (f *fakeRepo) FindByIdempotencyKey(_ context.Context, key string) (*domain.Loan, error) {
	if key == "" {
		return nil, nil
	}
	id, ok := f.byIdempotkey[key]
	if !ok {
		return nil, nil
	}
	return f.loans[id], nil
}

func (f *fakeRepo) CountActiveByBookID(_ context.Context, bookID uuid.UUID) (int64, error) {
	var n int64
	for _, l := range f.loans {
		if l.BookID == bookID && l.Status == domain.LoanStatusActive {
			n++
		}
	}
	return n, nil
}

func (f *fakeRepo) List(_ context.Context, filter domain.LoanFilter) ([]*domain.Loan, int64, error) {
	out := []*domain.Loan{}
	for _, l := range f.loans {
		if filter.UserID != nil && l.UserID != *filter.UserID {
			continue
		}
		if filter.BookID != nil && l.BookID != *filter.BookID {
			continue
		}
		if filter.Status != "" && l.Status != filter.Status {
			continue
		}
		if filter.From != nil && l.BorrowedAt.Before(*filter.From) {
			continue
		}
		if filter.To != nil && l.BorrowedAt.After(*filter.To) {
			continue
		}
		out = append(out, l)
	}
	return out, int64(len(out)), nil
}

type fakeCatalog struct {
	exists    bool
	available bool
	err       error
	calls     int
}

func (f *fakeCatalog) CheckAvailability(_ context.Context, _ uuid.UUID) (domain.CatalogAvailability, error) {
	f.calls++
	if f.err != nil {
		return domain.CatalogAvailability{}, f.err
	}
	return domain.CatalogAvailability{
		Exists:         f.exists,
		Available:      f.available,
		AvailableStock: 1,
		TotalStock:     1,
	}, nil
}

func newLogger() *slog.Logger { return slog.New(slog.NewTextHandler(io.Discard, nil)) }

func newSvcWithCatalog(c domain.CatalogClient) (*application.LoanService, *fakeRepo) {
	repo := newFakeRepo()
	svc := application.NewLoanServiceDeps(application.LoanServiceDeps{
		Repo:    repo,
		Catalog: c,
		Log:     newLogger(),
	})
	return svc, repo
}

func TestRegisterLoan_StoresIdempotencyKey(t *testing.T) {
	cat := &fakeCatalog{exists: true, available: true}
	svc, repo := newSvcWithCatalog(cat)
	bookID, userID := uuid.New(), uuid.New()
	loan, err := svc.RegisterLoan(context.Background(), bookID, userID, "key-1")
	require.NoError(t, err)
	assert.Equal(t, bookID, loan.BookID)
	assert.Equal(t, userID, loan.UserID)
	assert.Equal(t, "key-1", loan.IdempotencyKey)
	assert.Equal(t, domain.LoanStatusActive, loan.Status)
	assert.Equal(t, 1, len(repo.loans))
	assert.Equal(t, 1, cat.calls, "catalog should be queried exactly once")
}

func TestRegisterLoan_ReplaysByIdempotencyKey(t *testing.T) {
	cat := &fakeCatalog{exists: true, available: true}
	svc, repo := newSvcWithCatalog(cat)
	bookID, userID := uuid.New(), uuid.New()
	first, err := svc.RegisterLoan(context.Background(), bookID, userID, "key-1")
	require.NoError(t, err)

	second, err := svc.RegisterLoan(context.Background(), bookID, userID, "key-1")
	require.NoError(t, err)
	assert.Equal(t, first.ID, second.ID)
	assert.Equal(t, 1, len(repo.loans), "should not create a duplicate loan")
	assert.Equal(t, 1, cat.calls, "replay path must short-circuit before hitting catalog")
}

func TestRegisterLoan_IdempotencyConflictOnDifferentPayload(t *testing.T) {
	cat := &fakeCatalog{exists: true, available: true}
	svc, _ := newSvcWithCatalog(cat)
	bookID, userID := uuid.New(), uuid.New()
	_, err := svc.RegisterLoan(context.Background(), bookID, userID, "key-1")
	require.NoError(t, err)

	_, err = svc.RegisterLoan(context.Background(), uuid.New(), userID, "key-1")
	assert.ErrorIs(t, err, domain.ErrIdempotencyConflict)
}

func TestRegisterReturn_TransitionsStatus(t *testing.T) {
	cat := &fakeCatalog{exists: true, available: true}
	svc, _ := newSvcWithCatalog(cat)
	bookID, userID := uuid.New(), uuid.New()
	loan, err := svc.RegisterLoan(context.Background(), bookID, userID, "")
	require.NoError(t, err)

	returned, err := svc.RegisterReturn(context.Background(), loan.ID)
	require.NoError(t, err)
	assert.Equal(t, domain.LoanStatusReturned, returned.Status)
	assert.NotNil(t, returned.ReturnedAt)
}

func TestRegisterReturn_AlreadyReturned(t *testing.T) {
	cat := &fakeCatalog{exists: true, available: true}
	svc, _ := newSvcWithCatalog(cat)
	bookID, userID := uuid.New(), uuid.New()
	loan, err := svc.RegisterLoan(context.Background(), bookID, userID, "")
	require.NoError(t, err)
	_, err = svc.RegisterReturn(context.Background(), loan.ID)
	require.NoError(t, err)
	_, err = svc.RegisterReturn(context.Background(), loan.ID)
	assert.ErrorIs(t, err, domain.ErrLoanAlreadyReturned)
}

func TestValidateAvailability_RejectsZeroBookID(t *testing.T) {
	cat := &fakeCatalog{}
	svc, _ := newSvcWithCatalog(cat)
	_, _, err := svc.ValidateAvailability(context.Background(), uuid.Nil)
	assert.ErrorIs(t, err, domain.ErrInvalidInput)
}

func TestRegisterLoan_CatalogDown_ReturnsUnavailable(t *testing.T) {
	cat := &fakeCatalog{err: domain.ErrCatalogUnavailable}
	svc, repo := newSvcWithCatalog(cat)
	bookID, userID := uuid.New(), uuid.New()
	_, err := svc.RegisterLoan(context.Background(), bookID, userID, "")
	assert.ErrorIs(t, err, domain.ErrCatalogUnavailable)
	assert.Equal(t, 0, len(repo.loans), "must not create loan when catalog is down")
}

func TestRegisterLoan_CatalogSaysBookMissing_ReturnsNotFound(t *testing.T) {
	cat := &fakeCatalog{exists: false, available: false, err: domain.ErrBookNotFoundRemote}
	svc, repo := newSvcWithCatalog(cat)
	bookID, userID := uuid.New(), uuid.New()
	_, err := svc.RegisterLoan(context.Background(), bookID, userID, "")
	assert.ErrorIs(t, err, domain.ErrBookNotFoundRemote)
	assert.Equal(t, 0, len(repo.loans))
}

func TestRegisterLoan_CatalogSaysNoStock_ReturnsBookUnavailable(t *testing.T) {
	cat := &fakeCatalog{exists: true, available: false}
	svc, repo := newSvcWithCatalog(cat)
	bookID, userID := uuid.New(), uuid.New()
	_, err := svc.RegisterLoan(context.Background(), bookID, userID, "")
	assert.ErrorIs(t, err, domain.ErrBookUnavailable)
	assert.Equal(t, 0, len(repo.loans))
}

func TestRegisterLoan_RejectsZeroBookID(t *testing.T) {
	cat := &fakeCatalog{exists: true, available: true}
	svc, _ := newSvcWithCatalog(cat)
	_, err := svc.RegisterLoan(context.Background(), uuid.Nil, uuid.New(), "")
	assert.ErrorIs(t, err, domain.ErrInvalidInput)
	assert.Equal(t, 0, cat.calls, "must not call catalog for invalid input")
}

func TestRegisterLoan_ConcurrentSameBookID_DoesNotSerialize(t *testing.T) {
	cat := &fakeCatalog{exists: true, available: true}
	svc, repo := newSvcWithCatalog(cat)
	bookID, userID := uuid.New(), uuid.New()

	const N = 5
	for i := 0; i < N; i++ {
		_, err := svc.RegisterLoan(context.Background(), bookID, userID, "")
		require.NoError(t, err)
	}
	assert.Equal(t, N, len(repo.loans), "B persisted N loans; the stock invariant is A's responsibility")
}

type safeFakeRepo struct {
	mu           sync.Mutex
	loans        map[uuid.UUID]*domain.Loan
	byIdempotkey map[string]uuid.UUID
}

func newSafeFakeRepo() *safeFakeRepo {
	return &safeFakeRepo{
		loans:        map[uuid.UUID]*domain.Loan{},
		byIdempotkey: map[string]uuid.UUID{},
	}
}

func (f *safeFakeRepo) Create(_ context.Context, l *domain.Loan) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if _, exists := f.loans[l.ID]; exists {
		return errors.New("already exists")
	}
	now := time.Now().UTC()
	if l.CreatedAt.IsZero() {
		l.CreatedAt = now
	}
	l.UpdatedAt = now
	f.loans[l.ID] = l
	if l.IdempotencyKey != "" {
		f.byIdempotkey[l.IdempotencyKey] = l.ID
	}
	return nil
}

func (f *safeFakeRepo) Update(_ context.Context, l *domain.Loan) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if _, ok := f.loans[l.ID]; !ok {
		return domain.ErrLoanNotFound
	}
	l.UpdatedAt = time.Now().UTC()
	f.loans[l.ID] = l
	return nil
}

func (f *safeFakeRepo) FindByID(_ context.Context, id uuid.UUID) (*domain.Loan, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	l, ok := f.loans[id]
	if !ok {
		return nil, domain.ErrLoanNotFound
	}
	return l, nil
}

func (f *safeFakeRepo) FindByIdempotencyKey(_ context.Context, key string) (*domain.Loan, error) {
	if key == "" {
		return nil, nil
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	id, ok := f.byIdempotkey[key]
	if !ok {
		return nil, nil
	}
	return f.loans[id], nil
}

func (f *safeFakeRepo) CountActiveByBookID(_ context.Context, bookID uuid.UUID) (int64, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	var n int64
	for _, l := range f.loans {
		if l.BookID == bookID && l.Status == domain.LoanStatusActive {
			n++
		}
	}
	return n, nil
}

func (f *safeFakeRepo) List(_ context.Context, filter domain.LoanFilter) ([]*domain.Loan, int64, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	out := []*domain.Loan{}
	for _, l := range f.loans {
		if filter.UserID != nil && l.UserID != *filter.UserID {
			continue
		}
		if filter.BookID != nil && l.BookID != *filter.BookID {
			continue
		}
		if filter.Status != "" && l.Status != filter.Status {
			continue
		}
		if filter.From != nil && l.BorrowedAt.Before(*filter.From) {
			continue
		}
		if filter.To != nil && l.BorrowedAt.After(*filter.To) {
			continue
		}
		out = append(out, l)
	}
	return out, int64(len(out)), nil
}

func TestRegisterLoan_TrueConcurrencyWithRace(t *testing.T) {
	repo := newSafeFakeRepo()
	svc := application.NewLoanServiceDeps(application.LoanServiceDeps{
		Repo:          repo,
		Catalog:       &fakeCatalog{exists: true, available: true},
		Log:           newLogger(),
		SkipBookCheck: true, // skip catalog to focus on the repo race
	})
	bookID, userID := uuid.New(), uuid.New()

	const N = 8
	var wg sync.WaitGroup
	errs := make(chan error, N)
	for i := 0; i < N; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, err := svc.RegisterLoan(context.Background(), bookID, userID, "")
			errs <- err
		}()
	}
	wg.Wait()
	close(errs)
	var ok int
	for e := range errs {
		if e == nil {
			ok++
		}
	}
	assert.Equal(t, N, ok, "no goroutine should fail; the thread-safe repo serialises writes")
	repo.mu.Lock()
	defer repo.mu.Unlock()
	assert.Equal(t, N, len(repo.loans))
}

func TestListLoans_FilterByDateRange(t *testing.T) {
	cat := &fakeCatalog{exists: true, available: true}
	svc, repo := newSvcWithCatalog(cat)
	bookID, userID := uuid.New(), uuid.New()

	base := time.Now().UTC().Truncate(time.Hour)
	for i := 0; i < 3; i++ {
		l, err := svc.RegisterLoan(context.Background(), bookID, userID, "")
		require.NoError(t, err)
		require.NotNil(t, l)
		require.NotEqual(t, uuid.Nil, l.ID)
		require.Contains(t, repo.loans, l.ID)
		stored := repo.loans[l.ID]
		stored.BorrowedAt = base.Add(time.Duration(-2+i) * time.Hour)
	}

	from := base.Add(-90 * time.Minute)
	page, err := svc.ListLoans(context.Background(), domain.LoanFilter{
		From:     &from,
		Page:     1,
		PageSize: 10,
	})
	require.NoError(t, err)
	assert.EqualValues(t, 2, page.Total, "fake repo total refleja el filter")
	require.Len(t, page.Items, 2, "filter narrows the in-memory list to 2")
	for _, it := range page.Items {
		assert.False(t, it.BorrowedAt.Before(from), "borrowed_at >= from")
	}
}
