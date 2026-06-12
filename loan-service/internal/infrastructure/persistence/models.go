package persistence

import (
	"time"

	"github.com/google/uuid"
)

type LoanModel struct {
	ID             uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	BookID         uuid.UUID `gorm:"type:uuid;not null;index:idx_loans_book_id"`
	UserID         uuid.UUID `gorm:"type:uuid;not null;index:idx_loans_user_status,priority:1"`
	BorrowedAt     time.Time `gorm:"not null;default:now()"`
	ReturnedAt     *time.Time
	Status         string    `gorm:"type:varchar(20);not null;default:'active';index:idx_loans_user_status,priority:2;index:idx_loans_status"`
	IdempotencyKey string    `gorm:"type:varchar(64);uniqueIndex:idx_loans_idempotency,where:idempotency_key <> ''"`
	CreatedAt      time.Time `gorm:"not null"`
	UpdatedAt      time.Time `gorm:"not null"`
}

func (LoanModel) TableName() string { return "loans" }
