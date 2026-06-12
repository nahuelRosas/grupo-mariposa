package grpcserver

import (
	"context"
	"errors"
	"log/slog"
	"time"

	"github.com/example/loan-service/internal/domain"
	librarypb "github.com/example/loan-service/proto/gen"
	"github.com/google/uuid"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type LoanGRPCServer struct {
	librarypb.UnimplementedLoanServiceServer
	svc domain.LoanService
	log *slog.Logger
}

func NewLoanGRPCServer(svc domain.LoanService, log *slog.Logger) *LoanGRPCServer {
	return &LoanGRPCServer{svc: svc, log: log}
}

func (s *LoanGRPCServer) RegisterLoan(ctx context.Context, req *librarypb.RegisterLoanRequest) (*librarypb.RegisterLoanResponse, error) {
	start := time.Now()
	logger := s.log.With(slog.String("rpc", "RegisterLoan"))

	bookID, err := uuid.Parse(req.GetBookId())
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, "book_id is not a valid uuid")
	}
	userID, err := uuid.Parse(req.GetUserId())
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, "user_id is not a valid uuid")
	}
	idempotencyKey := req.GetIdempotencyKey()

	loan, err := s.svc.RegisterLoan(ctx, bookID, userID, idempotencyKey)
	if err != nil {
		logger.Error("rpc failed", slog.String("error", err.Error()))
		return nil, mapDomainErrorToGRPC(err)
	}

	logger.Info(
		"rpc ok",
		slog.String("loan_id", loan.ID.String()),
		slog.Duration("latency", time.Since(start)),
	)
	return &librarypb.RegisterLoanResponse{
		LoanId:     loan.ID.String(),
		BorrowedAt: loan.BorrowedAt.UTC().Format(time.RFC3339),
		Status:     loan.Status,
		DueAt:      "",
		Message:    "",
	}, nil
}

func (s *LoanGRPCServer) ValidateAvailability(ctx context.Context, req *librarypb.ValidateAvailabilityRequest) (*librarypb.ValidateAvailabilityResponse, error) {
	bookID, err := uuid.Parse(req.GetBookId())
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, "book_id is not a valid uuid")
	}
	available, count, err := s.svc.ValidateAvailability(ctx, bookID)
	if err != nil {
		return nil, mapDomainErrorToGRPC(err)
	}
	return &librarypb.ValidateAvailabilityResponse{
		Available:        available,
		ActiveLoansCount: int32(count),
	}, nil
}

func (s *LoanGRPCServer) RegisterReturn(ctx context.Context, req *librarypb.RegisterReturnRequest) (*librarypb.RegisterReturnResponse, error) {
	loanID, err := uuid.Parse(req.GetLoanId())
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, "loan_id is not a valid uuid")
	}
	loan, err := s.svc.RegisterReturn(ctx, loanID)
	if err != nil {

		if errors.Is(err, domain.ErrLoanAlreadyReturned) {
			existing, gerr := s.svc.GetLoan(ctx, loanID)
			if gerr != nil {
				return nil, mapDomainErrorToGRPC(gerr)
			}
			resp := &librarypb.RegisterReturnResponse{
				LoanId:  existing.ID.String(),
				Status:  "already_returned",
				Message: "loan was already returned",
			}
			if existing.ReturnedAt != nil {
				resp.ReturnedAt = existing.ReturnedAt.UTC().Format(time.RFC3339)
			}
			return resp, nil
		}
		return nil, mapDomainErrorToGRPC(err)
	}
	resp := &librarypb.RegisterReturnResponse{
		LoanId:  loan.ID.String(),
		Status:  loan.Status,
		Message: "",
	}
	if loan.ReturnedAt != nil {
		resp.ReturnedAt = loan.ReturnedAt.UTC().Format(time.RFC3339)
	}
	return resp, nil
}

func (s *LoanGRPCServer) GetLoan(ctx context.Context, req *librarypb.GetLoanRequest) (*librarypb.GetLoanResponse, error) {
	loanID, err := uuid.Parse(req.GetLoanId())
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, "loan_id is not a valid uuid")
	}
	loan, err := s.svc.GetLoan(ctx, loanID)
	if err != nil {
		return nil, mapDomainErrorToGRPC(err)
	}
	resp := &librarypb.GetLoanResponse{
		LoanId:   loan.ID.String(),
		BookId:   loan.BookID.String(),
		UserId:   loan.UserID.String(),
		Status:   loan.Status,
		LoanedAt: loan.BorrowedAt.UTC().Format(time.RFC3339),
	}
	if loan.ReturnedAt != nil {
		resp.ReturnedAt = loan.ReturnedAt.UTC().Format(time.RFC3339)
	}
	return resp, nil
}

func UnaryLogger(log *slog.Logger) grpc.UnaryServerInterceptor {
	return func(ctx context.Context, req interface{}, info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (interface{}, error) {
		start := time.Now()
		resp, err := handler(ctx, req)
		attrs := []any{
			slog.String("method", info.FullMethod),
			slog.Duration("latency", time.Since(start)),
		}
		if err != nil {
			attrs = append(attrs, slog.String("error", err.Error()))
			log.Warn("grpc call failed", attrs...)
		} else {
			log.Debug("grpc call ok", attrs...)
		}
		return resp, err
	}
}
