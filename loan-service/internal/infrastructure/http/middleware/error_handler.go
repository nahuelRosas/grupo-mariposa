package middleware

import (
	"errors"
	"log/slog"
	"net/http"

	"github.com/example/loan-service/internal/domain"
	"github.com/example/loan-service/internal/infrastructure/http/dto"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

func ErrorHandler(log *slog.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Next()
		if len(c.Errors) == 0 {
			return
		}
		err := c.Errors.Last().Err
		traceID := uuid.NewString()
		statusCode, code := mapDomainErrorToHTTP(err)
		log.Warn(
			"request failed",
			slog.String("trace_id", traceID),
			slog.String("path", c.Request.URL.Path),
			slog.String("method", c.Request.Method),
			slog.String("code", code),
			slog.String("error", err.Error()),
		)
		c.AbortWithStatusJSON(statusCode, dto.ErrorResponse{
			Code:    code,
			Message: err.Error(),
			TraceID: traceID,
		})
	}
}

func mapDomainErrorToHTTP(err error) (int, string) {
	switch {
	case errors.Is(err, domain.ErrLoanNotFound):
		return http.StatusNotFound, "loan_not_found"
	case errors.Is(err, domain.ErrBookNotFoundRemote):
		return http.StatusNotFound, "book_not_found"
	case errors.Is(err, domain.ErrBookUnavailable):
		return http.StatusConflict, "book_unavailable"
	case errors.Is(err, domain.ErrLoanAlreadyReturned):
		return http.StatusUnprocessableEntity, "loan_already_returned"
	case errors.Is(err, domain.ErrIdempotencyConflict):
		return http.StatusConflict, "idempotency_conflict"
	case errors.Is(err, domain.ErrCatalogUnavailable):
		return http.StatusServiceUnavailable, "catalog_unavailable"
	case errors.Is(err, domain.ErrInvalidInput):
		return http.StatusBadRequest, "invalid_input"
	default:
		return http.StatusInternalServerError, "internal_error"
	}
}
