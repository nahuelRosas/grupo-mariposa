package domain

import "errors"

var (
	ErrLoanNotFound         = errors.New("loan not found")
	ErrBookUnavailable      = errors.New("book currently on loan")
	ErrLoanAlreadyReturned  = errors.New("loan already returned")
	ErrInvalidInput         = errors.New("invalid input")
	ErrIdempotencyConflict  = errors.New("idempotency key already used with a different request")
	ErrBookNotFoundRemote   = errors.New("book not found in catalog service")
	ErrCatalogUnavailable   = errors.New("catalog service unavailable")
	ErrCatalogInvalidAnswer = errors.New("catalog service returned an invalid answer")
)
