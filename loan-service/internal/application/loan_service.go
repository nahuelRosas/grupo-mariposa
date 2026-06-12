package application

import (
	"context"
	"errors"
	"log/slog"
	"time"

	"github.com/example/loan-service/internal/domain"
	"github.com/google/uuid"
)

type LoanService struct {
	repo          domain.LoanRepository
	catalog       domain.CatalogClient
	log           *slog.Logger
	now           func() time.Time
	skipBookCheck bool
}

type LoanServiceDeps struct {
	Repo          domain.LoanRepository
	Catalog       domain.CatalogClient
	Log           *slog.Logger
	Now           func() time.Time
	SkipBookCheck bool
}

func NewLoanServiceDeps(d LoanServiceDeps) *LoanService {
	if d.Now == nil {
		d.Now = time.Now
	}
	if d.Log == nil {
		d.Log = slog.Default()
	}
	return &LoanService{
		repo:          d.Repo,
		catalog:       d.Catalog,
		log:           d.Log,
		now:           d.Now,
		skipBookCheck: d.SkipBookCheck,
	}
}

func NewLoanService(repo domain.LoanRepository, log *slog.Logger) *LoanService {
	return NewLoanServiceDeps(LoanServiceDeps{
		Repo:          repo,
		Catalog:       noopCatalogClient{},
		Log:           log,
		SkipBookCheck: true,
	})
}

func (s *LoanService) SetClock(f func() time.Time) { s.now = f }

func (s *LoanService) RegisterLoan(ctx context.Context, bookID, userID uuid.UUID, idempotencyKey string) (*domain.Loan, error) {
	if bookID == uuid.Nil || userID == uuid.Nil {
		return nil, domain.ErrInvalidInput
	}

	if idempotencyKey != "" {
		existing, err := s.repo.FindByIdempotencyKey(ctx, idempotencyKey)
		if err != nil {
			return nil, err
		}
		if existing != nil {
			if existing.BookID != bookID || existing.UserID != userID {
				return nil, domain.ErrIdempotencyConflict
			}
			return existing, nil
		}
	}

	if !s.skipBookCheck && s.catalog != nil {
		avail, err := s.catalog.CheckAvailability(ctx, bookID)
		if err != nil {
			switch {
			case errors.Is(err, domain.ErrBookNotFoundRemote):
				return nil, domain.ErrBookNotFoundRemote
			case errors.Is(err, domain.ErrCatalogUnavailable):
				s.log.Warn(
					"catalog unavailable, refusing loan",
					slog.String("book_id", bookID.String()),
					slog.String("err", err.Error()),
				)
				return nil, domain.ErrCatalogUnavailable
			default:
				s.log.Error(
					"catalog unexpected error",
					slog.String("book_id", bookID.String()),
					slog.String("err", err.Error()),
				)
				return nil, domain.ErrCatalogUnavailable
			}
		}
		if !avail.Exists {
			return nil, domain.ErrBookNotFoundRemote
		}
		if !avail.Available {
			return nil, domain.ErrBookUnavailable
		}
	}

	loan := &domain.Loan{
		ID:             uuid.New(),
		BookID:         bookID,
		UserID:         userID,
		BorrowedAt:     s.now().UTC(),
		Status:         domain.LoanStatusActive,
		IdempotencyKey: idempotencyKey,
	}
	if err := s.repo.Create(ctx, loan); err != nil {
		return nil, err
	}
	s.log.Info(
		"loan registered",
		slog.String("loan_id", loan.ID.String()),
		slog.String("book_id", bookID.String()),
		slog.String("user_id", userID.String()),
	)
	return loan, nil
}

func (s *LoanService) RegisterReturn(ctx context.Context, loanID uuid.UUID) (*domain.Loan, error) {
	if loanID == uuid.Nil {
		return nil, domain.ErrInvalidInput
	}
	loan, err := s.repo.FindByID(ctx, loanID)
	if err != nil {
		return nil, err
	}
	if err := loan.MarkReturned(s.now().UTC()); err != nil {
		return nil, err
	}
	if err := s.repo.Update(ctx, loan); err != nil {
		return nil, err
	}
	s.log.Info(
		"loan returned",
		slog.String("loan_id", loan.ID.String()),
	)
	return loan, nil
}

func (s *LoanService) GetLoan(ctx context.Context, loanID uuid.UUID) (*domain.Loan, error) {
	return s.repo.FindByID(ctx, loanID)
}

func (s *LoanService) ListLoans(ctx context.Context, f domain.LoanFilter) (*domain.LoanPage, error) {
	items, total, err := s.repo.List(ctx, f)
	if err != nil {
		return nil, err
	}
	page := f.Page
	if page < 1 {
		page = 1
	}
	pageSize := f.PageSize
	if pageSize < 1 {
		pageSize = 20
	}
	return &domain.LoanPage{Items: items, Page: page, PageSize: pageSize, Total: total}, nil
}

func (s *LoanService) ValidateAvailability(ctx context.Context, bookID uuid.UUID) (bool, int64, error) {
	if bookID == uuid.Nil {
		return false, 0, domain.ErrInvalidInput
	}
	n, err := s.repo.CountActiveByBookID(ctx, bookID)
	if err != nil {
		return false, 0, err
	}
	return n == 0, n, nil
}

var _ domain.LoanService = (*LoanService)(nil)

type noopCatalogClient struct{}

func (noopCatalogClient) CheckAvailability(_ context.Context, _ uuid.UUID) (domain.CatalogAvailability, error) {
	return domain.CatalogAvailability{Exists: true, Available: true}, nil
}

var _ domain.CatalogClient = noopCatalogClient{}
