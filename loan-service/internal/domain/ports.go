package domain

import (
	"context"
	"time"

	"github.com/google/uuid"
)

type LoanService interface {
	RegisterLoan(ctx context.Context, bookID, userID uuid.UUID, idempotencyKey string) (*Loan, error)
	RegisterReturn(ctx context.Context, loanID uuid.UUID) (*Loan, error)
	GetLoan(ctx context.Context, loanID uuid.UUID) (*Loan, error)
	ListLoans(ctx context.Context, f LoanFilter) (*LoanPage, error)
	ValidateAvailability(ctx context.Context, bookID uuid.UUID) (available bool, activeCount int64, err error)
}

type LoanRepository interface {
	Create(ctx context.Context, loan *Loan) error
	Update(ctx context.Context, loan *Loan) error
	FindByID(ctx context.Context, id uuid.UUID) (*Loan, error)
	FindByIdempotencyKey(ctx context.Context, key string) (*Loan, error)
	CountActiveByBookID(ctx context.Context, bookID uuid.UUID) (int64, error)
	List(ctx context.Context, f LoanFilter) ([]*Loan, int64, error)
}

type LoanFilter struct {
	UserID   *uuid.UUID
	BookID   *uuid.UUID
	Status   string
	From     *time.Time
	To       *time.Time
	Page     int
	PageSize int
}

type LoanPage struct {
	Items    []*Loan
	Page     int
	PageSize int
	Total    int64
}

type CatalogAvailability struct {
	Exists         bool
	Available      bool
	AvailableStock int
	TotalStock     int
}

type CatalogClient interface {
	CheckAvailability(ctx context.Context, bookID uuid.UUID) (CatalogAvailability, error)
}
