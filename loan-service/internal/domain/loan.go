package domain

import (
	"time"

	"github.com/google/uuid"
)

const (
	LoanStatusActive   = "active"
	LoanStatusReturned = "returned"
)

type Loan struct {
	ID         uuid.UUID
	BookID     uuid.UUID
	UserID     uuid.UUID
	BorrowedAt time.Time
	ReturnedAt *time.Time
	Status     string
	CreatedAt  time.Time
	UpdatedAt  time.Time

	IdempotencyKey string
}

func (l *Loan) IsActive() bool {
	return l.Status == LoanStatusActive && l.ReturnedAt == nil
}

func (l *Loan) MarkReturned(now time.Time) error {
	if !l.IsActive() {
		return ErrLoanAlreadyReturned
	}
	l.ReturnedAt = &now
	l.Status = LoanStatusReturned
	return nil
}
