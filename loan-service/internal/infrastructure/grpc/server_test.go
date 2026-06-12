package grpcserver_test

import (
	"context"
	"errors"
	"log/slog"
	"testing"
	"time"

	"github.com/example/loan-service/internal/domain"
	grpcserver "github.com/example/loan-service/internal/infrastructure/grpc"
	librarypb "github.com/example/loan-service/proto/gen"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type MockLoanService struct{ mock.Mock }

func (m *MockLoanService) RegisterLoan(ctx context.Context, bookID, userID uuid.UUID, idempotencyKey string) (*domain.Loan, error) {
	args := m.Called(ctx, bookID, userID, idempotencyKey)
	if l := args.Get(0); l != nil {
		return l.(*domain.Loan), args.Error(1)
	}
	return nil, args.Error(1)
}

func (m *MockLoanService) RegisterReturn(ctx context.Context, loanID uuid.UUID) (*domain.Loan, error) {
	args := m.Called(ctx, loanID)
	if l := args.Get(0); l != nil {
		return l.(*domain.Loan), args.Error(1)
	}
	return nil, args.Error(1)
}

func (m *MockLoanService) GetLoan(ctx context.Context, loanID uuid.UUID) (*domain.Loan, error) {
	args := m.Called(ctx, loanID)
	if l := args.Get(0); l != nil {
		return l.(*domain.Loan), args.Error(1)
	}
	return nil, args.Error(1)
}

func (m *MockLoanService) ListLoans(ctx context.Context, f domain.LoanFilter) (*domain.LoanPage, error) {
	args := m.Called(ctx, f)
	if p := args.Get(0); p != nil {
		return p.(*domain.LoanPage), args.Error(1)
	}
	return nil, args.Error(1)
}

func (m *MockLoanService) ValidateAvailability(ctx context.Context, bookID uuid.UUID) (bool, int64, error) {
	args := m.Called(ctx, bookID)
	return args.Bool(0), args.Get(1).(int64), args.Error(2)
}

func newLogger() *slog.Logger { return slog.Default() }

func TestRegisterLoan_Success(t *testing.T) {
	bookID, userID := uuid.New(), uuid.New()
	loan := &domain.Loan{
		ID:         uuid.New(),
		BookID:     bookID,
		UserID:     userID,
		BorrowedAt: time.Date(2026, 6, 11, 12, 0, 0, 0, time.UTC),
		Status:     domain.LoanStatusActive,
	}
	mockSvc := &MockLoanService{}
	mockSvc.On("RegisterLoan", mock.Anything, bookID, userID, "key-1").Return(loan, nil)

	s := grpcserver.NewLoanGRPCServer(mockSvc, newLogger())
	resp, err := s.RegisterLoan(context.Background(), &librarypb.RegisterLoanRequest{
		BookId: bookID.String(), UserId: userID.String(), IdempotencyKey: "key-1",
	})

	assert.NoError(t, err)
	assert.Equal(t, loan.ID.String(), resp.GetLoanId())
	assert.Equal(t, domain.LoanStatusActive, resp.GetStatus())
	assert.Equal(t, "2026-06-11T12:00:00Z", resp.GetBorrowedAt())
	mockSvc.AssertExpectations(t)
}

func TestRegisterLoan_InvalidArgs(t *testing.T) {
	s := grpcserver.NewLoanGRPCServer(&MockLoanService{}, newLogger())
	_, err := s.RegisterLoan(context.Background(), &librarypb.RegisterLoanRequest{
		BookId: "not-a-uuid", UserId: uuid.New().String(),
	})
	st, _ := status.FromError(err)
	assert.Equal(t, codes.InvalidArgument, st.Code())
}

func TestRegisterLoan_ErrorMapping(t *testing.T) {
	cases := []struct {
		name   string
		err    error
		expect codes.Code
	}{
		{"book unavailable", domain.ErrBookUnavailable, codes.ResourceExhausted},
		{"loan not found", domain.ErrLoanNotFound, codes.NotFound},
		{"invalid input", domain.ErrInvalidInput, codes.InvalidArgument},
		{"idempotency conflict", domain.ErrIdempotencyConflict, codes.AlreadyExists},
		{"unknown -> Internal", errors.New("boom"), codes.Internal},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			bookID, userID := uuid.New(), uuid.New()
			mockSvc := &MockLoanService{}
			mockSvc.On("RegisterLoan", mock.Anything, bookID, userID, "").Return(nil, tc.err)
			s := grpcserver.NewLoanGRPCServer(mockSvc, newLogger())
			_, err := s.RegisterLoan(context.Background(), &librarypb.RegisterLoanRequest{
				BookId: bookID.String(), UserId: userID.String(),
			})
			st, _ := status.FromError(err)
			assert.Equal(t, tc.expect, st.Code())
		})
	}
}

func TestValidateAvailability_Success(t *testing.T) {
	bookID := uuid.New()
	mockSvc := &MockLoanService{}
	mockSvc.On("ValidateAvailability", mock.Anything, bookID).Return(true, int64(0), nil)
	s := grpcserver.NewLoanGRPCServer(mockSvc, newLogger())
	resp, err := s.ValidateAvailability(context.Background(), &librarypb.ValidateAvailabilityRequest{
		BookId: bookID.String(),
	})
	assert.NoError(t, err)
	assert.True(t, resp.GetAvailable())
	assert.Equal(t, int32(0), resp.GetActiveLoansCount())
}

func TestGetLoan_NotFound(t *testing.T) {
	loanID := uuid.New()
	mockSvc := &MockLoanService{}
	mockSvc.On("GetLoan", mock.Anything, loanID).Return(nil, domain.ErrLoanNotFound)
	s := grpcserver.NewLoanGRPCServer(mockSvc, newLogger())
	_, err := s.GetLoan(context.Background(), &librarypb.GetLoanRequest{LoanId: loanID.String()})
	st, _ := status.FromError(err)
	assert.Equal(t, codes.NotFound, st.Code())
}
