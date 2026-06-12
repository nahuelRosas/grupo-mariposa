package persistence

import (
	"context"
	"errors"

	"github.com/example/loan-service/internal/domain"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type LoanRepository struct {
	db *gorm.DB
}

func NewLoanRepository() *LoanRepository { return &LoanRepository{db: globalDB} }

func NewLoanRepositoryWithDB(db *gorm.DB) *LoanRepository { return &LoanRepository{db: db} }

func (r *LoanRepository) Create(ctx context.Context, loan *domain.Loan) error {
	m := toModel(loan)
	if err := r.gormWith(ctx).Create(m).Error; err != nil {
		return err
	}
	*loan = *toDomain(m)
	return nil
}

func (r *LoanRepository) Update(ctx context.Context, loan *domain.Loan) error {
	m := toModel(loan)
	res := r.gormWith(ctx).Save(m)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return domain.ErrLoanNotFound
	}
	*loan = *toDomain(m)
	return nil
}

func (r *LoanRepository) FindByID(ctx context.Context, id uuid.UUID) (*domain.Loan, error) {
	var m LoanModel
	if err := r.gormWith(ctx).First(&m, "id = ?", id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, domain.ErrLoanNotFound
		}
		return nil, err
	}
	return toDomain(&m), nil
}

func (r *LoanRepository) FindByIdempotencyKey(ctx context.Context, key string) (*domain.Loan, error) {
	if key == "" {
		return nil, nil
	}
	var m LoanModel
	if err := r.gormWith(ctx).Where("idempotency_key = ?", key).First(&m).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return toDomain(&m), nil
}

func (r *LoanRepository) CountActiveByBookID(ctx context.Context, bookID uuid.UUID) (int64, error) {
	var n int64
	if err := r.gormWith(ctx).Model(&LoanModel{}).
		Where("book_id = ? AND status = ?", bookID, domain.LoanStatusActive).
		Count(&n).Error; err != nil {
		return 0, err
	}
	return n, nil
}

func (r *LoanRepository) List(ctx context.Context, f domain.LoanFilter) ([]*domain.Loan, int64, error) {
	q := r.gormWith(ctx).Model(&LoanModel{})
	if f.UserID != nil {
		q = q.Where("user_id = ?", *f.UserID)
	}
	if f.BookID != nil {
		q = q.Where("book_id = ?", *f.BookID)
	}
	if f.Status != "" {
		q = q.Where("status = ?", f.Status)
	}
	if f.From != nil {
		q = q.Where("borrowed_at >= ?", *f.From)
	}
	if f.To != nil {
		q = q.Where("borrowed_at <= ?", *f.To)
	}
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	page := f.Page
	if page < 1 {
		page = 1
	}
	pageSize := f.PageSize
	if pageSize < 1 {
		pageSize = 20
	}
	if pageSize > 100 {
		pageSize = 100
	}
	var rows []LoanModel
	if err := q.Order("borrowed_at DESC").
		Limit(pageSize).
		Offset((page - 1) * pageSize).
		Find(&rows).Error; err != nil {
		return nil, 0, err
	}
	out := make([]*domain.Loan, len(rows))
	for i := range rows {
		out[i] = toDomain(&rows[i])
	}
	return out, total, nil
}

func (r *LoanRepository) gormWith(ctx context.Context) *gorm.DB {
	if r.db == nil {
		panic("persistence: repository has no *gorm.DB (call NewLoanRepositoryWithDB or SetDB first)")
	}
	return r.db.WithContext(ctx)
}

var globalDB *gorm.DB

func SetDB(db *gorm.DB) { globalDB = db }

func toModel(l *domain.Loan) *LoanModel {
	if l == nil {
		return nil
	}
	return &LoanModel{
		ID:             l.ID,
		BookID:         l.BookID,
		UserID:         l.UserID,
		BorrowedAt:     l.BorrowedAt,
		ReturnedAt:     l.ReturnedAt,
		Status:         l.Status,
		IdempotencyKey: l.IdempotencyKey,
		CreatedAt:      l.CreatedAt,
		UpdatedAt:      l.UpdatedAt,
	}
}

func toDomain(m *LoanModel) *domain.Loan {
	if m == nil {
		return nil
	}
	return &domain.Loan{
		ID:             m.ID,
		BookID:         m.BookID,
		UserID:         m.UserID,
		BorrowedAt:     m.BorrowedAt,
		ReturnedAt:     m.ReturnedAt,
		Status:         m.Status,
		IdempotencyKey: m.IdempotencyKey,
		CreatedAt:      m.CreatedAt,
		UpdatedAt:      m.UpdatedAt,
	}
}

var _ domain.LoanRepository = (*LoanRepository)(nil)
