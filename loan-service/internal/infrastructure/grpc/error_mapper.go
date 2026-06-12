package grpcserver

import (
	"context"
	"errors"

	"github.com/example/loan-service/internal/domain"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func mapDomainErrorToGRPC(err error) error {
	switch {
	case errors.Is(err, domain.ErrLoanNotFound):
		return status.Error(codes.NotFound, "loan not found")
	case errors.Is(err, domain.ErrBookNotFoundRemote):
		return status.Error(codes.NotFound, "book not found in catalog")
	case errors.Is(err, domain.ErrBookUnavailable):
		return status.Error(codes.ResourceExhausted, "book currently on loan")
	case errors.Is(err, domain.ErrLoanAlreadyReturned):
		return status.Error(codes.FailedPrecondition, "loan already returned")
	case errors.Is(err, domain.ErrIdempotencyConflict):
		return status.Error(codes.AlreadyExists, "idempotency key already used with a different request")
	case errors.Is(err, domain.ErrInvalidInput):
		return status.Error(codes.InvalidArgument, err.Error())
	case errors.Is(err, domain.ErrCatalogUnavailable):
		return status.Error(codes.Unavailable, "catalog service unavailable")
	case errors.Is(err, context.DeadlineExceeded):
		return status.Error(codes.DeadlineExceeded, "deadline exceeded")
	case errors.Is(err, context.Canceled):
		return status.Error(codes.Canceled, "request canceled")
	default:
		return status.Error(codes.Internal, "internal error")
	}
}
