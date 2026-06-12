package dto

import (
	"time"

	"github.com/example/loan-service/internal/domain"
	"github.com/google/uuid"
)

type CreateLoanRequest struct {
	BookID         string `json:"book_id"         binding:"required,uuid" example:"978-0-13-468599-1" swaggertype:"string" format:"uuid"`
	UserID         string `json:"user_id"         binding:"required,uuid" example:"3e1ae706-5ca9-4aeb-aa60-c5b7f942969d" swaggertype:"string" format:"uuid"`
	IdempotencyKey string `json:"idempotency_key" binding:"omitempty" example:"loan-attempt-2025-01-15-abc123"`
}

type ListLoansQuery struct {
	UserID   string `form:"user_id"   binding:"omitempty,uuid"`
	BookID   string `form:"book_id"   binding:"omitempty,uuid"`
	Status   string `form:"status"    binding:"omitempty,oneof=active returned" example:"active"`
	From     string `form:"from"      binding:"omitempty,datetime=2006-01-02T15:04:05Z07:00" example:"2025-01-01T00:00:00Z"`
	To       string `form:"to"        binding:"omitempty,datetime=2006-01-02T15:04:05Z07:00" example:"2025-12-31T23:59:59Z"`
	Page     int    `form:"page"      binding:"omitempty,gte=1" example:"1"`
	PageSize int    `form:"page_size" binding:"omitempty,gte=1,lte=100" example:"20"`
}

func (q ListLoansQuery) ToFilter() domain.LoanFilter {
	f := domain.LoanFilter{
		Status:   q.Status,
		Page:     q.Page,
		PageSize: q.PageSize,
	}
	if q.UserID != "" {
		id := uuid.MustParse(q.UserID)
		f.UserID = &id
	}
	if q.BookID != "" {
		id := uuid.MustParse(q.BookID)
		f.BookID = &id
	}
	if q.From != "" {
		t, _ := time.Parse(time.RFC3339, q.From)
		f.From = &t
	}
	if q.To != "" {
		t, _ := time.Parse(time.RFC3339, q.To)
		f.To = &t
	}
	if f.Page == 0 {
		f.Page = 1
	}
	if f.PageSize == 0 {
		f.PageSize = 20
	}
	return f
}

type LoanResponse struct {
	ID         uuid.UUID  `json:"id"          example:"3e1ae706-5ca9-4aeb-aa60-c5b7f942969d" swaggertype:"string" format:"uuid"`
	BookID     uuid.UUID  `json:"book_id"     example:"978-0-13-468599-1" swaggertype:"string" format:"uuid"`
	UserID     uuid.UUID  `json:"user_id"     example:"3e1ae706-5ca9-4aeb-aa60-c5b7f942969d" swaggertype:"string" format:"uuid"`
	BorrowedAt time.Time  `json:"borrowed_at" example:"2025-01-15T10:00:00Z"`
	ReturnedAt *time.Time `json:"returned_at,omitempty" example:"2025-02-15T10:00:00Z"`
	Status     string     `json:"status"      example:"active" enums:"active,returned"`
}

func NewLoanResponse(l *domain.Loan) LoanResponse {
	if l == nil {
		return LoanResponse{}
	}
	return LoanResponse{
		ID:         l.ID,
		BookID:     l.BookID,
		UserID:     l.UserID,
		BorrowedAt: l.BorrowedAt,
		ReturnedAt: l.ReturnedAt,
		Status:     l.Status,
	}
}

type LoanListResponse struct {
	Items    []LoanResponse `json:"items"`
	Page     int            `json:"page"`
	PageSize int            `json:"page_size"`
	Total    int64          `json:"total"`
}

func NewLoanListResponse(p *domain.LoanPage) LoanListResponse {
	items := make([]LoanResponse, 0, len(p.Items))
	for _, it := range p.Items {
		items = append(items, NewLoanResponse(it))
	}
	return LoanListResponse{
		Items:    items,
		Page:     p.Page,
		PageSize: p.PageSize,
		Total:    p.Total,
	}
}
