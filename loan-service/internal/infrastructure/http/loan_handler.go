package http

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"time"

	"github.com/example/loan-service/internal/domain"
	"github.com/example/loan-service/internal/infrastructure/http/dto"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type LoanHandler struct {
	svc domain.LoanService
}

func NewLoanHandler(svc domain.LoanService) *LoanHandler {
	return &LoanHandler{svc: svc}
}

// @Summary      List loans (paginated, filterable)
// @Description  Returns a paginated list of loans. Supports filtering by user_id, book_id, status, and date range.
// @Tags         loans
// @Produce      json
// @Param        user_id    query     string  false  "Filter by user UUID"
// @Param        book_id    query     string  false  "Filter by book UUID"
// @Param        status     query     string  false  "Filter by status"  Enums(active, returned)
// @Param        from       query     string  false  "Borrowed at >= from (RFC3339)"
// @Param        to         query     string  false  "Borrowed at <= to (RFC3339)"
// @Param        page       query     int     false  "1-based page index"  default(1)
// @Param        page_size  query     int     false  "Items per page (1-100)"  default(20)
// @Success      200        {object}  dto.LoanListResponse
// @Failure      400        {object}  dto.ErrorResponse  "invalid query"
// @Failure      500        {object}  dto.ErrorResponse
// @Router       /loans [get]
func (h *LoanHandler) ListLoans(c *gin.Context) {
	var q dto.ListLoansQuery
	if err := c.ShouldBindQuery(&q); err != nil {
		_ = c.Error(err)
		return
	}
	page, err := h.svc.ListLoans(c.Request.Context(), q.ToFilter())
	if err != nil {
		_ = c.Error(err)
		return
	}
	c.JSON(http.StatusOK, dto.NewLoanListResponse(page))
}

// @Summary      Register a loan
// @Description  Validates with Catalog Service that the book exists and has stock, then persists the loan. Idempotent if `idempotency_key` is supplied.
// @Tags         loans
// @Accept       json
// @Produce      json
// @Param        X-Idempotency-Key  header    string                    false  "Optional dedup key (also accepted in body)"
// @Param        request            body      dto.CreateLoanRequest     true   "Loan request"
// @Success      201                {object}  dto.LoanResponse
// @Failure      400                {object}  dto.ErrorResponse  "invalid input"
// @Failure      404                {object}  dto.ErrorResponse  "book not found in catalog"
// @Failure      409                {object}  dto.ErrorResponse  "insufficient stock or duplicate idempotency key"
// @Failure      503                {object}  dto.ErrorResponse  "catalog service unavailable"
// @Router       /loans [post]
func (h *LoanHandler) CreateLoan(c *gin.Context) {
	var body dto.CreateLoanRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		_ = c.Error(errors.Join(domain.ErrInvalidInput, err))
		return
	}
	bookID, err := uuid.Parse(body.BookID)
	if err != nil {
		_ = c.Error(errors.Join(domain.ErrInvalidInput, err))
		return
	}
	userID, err := uuid.Parse(body.UserID)
	if err != nil {
		_ = c.Error(errors.Join(domain.ErrInvalidInput, err))
		return
	}
	loan, err := h.svc.RegisterLoan(c.Request.Context(), bookID, userID, body.IdempotencyKey)
	if err != nil {
		_ = c.Error(err)
		return
	}
	c.JSON(http.StatusCreated, dto.NewLoanResponse(loan))
}

// @Summary      Register a return
// @Description  Marks the loan as returned and updates the timestamp. Idempotent: returning an already-returned loan is a no-op.
// @Tags         loans
// @Produce      json
// @Param        id   path      string  true  "Loan UUID"
// @Success      200  {object}  dto.LoanResponse
// @Failure      400  {object}  dto.ErrorResponse  "invalid uuid"
// @Failure      404  {object}  dto.ErrorResponse  "loan not found"
// @Router       /loans/{id}/return [post]
func (h *LoanHandler) ReturnLoan(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		_ = c.Error(errors.Join(domain.ErrInvalidInput, err))
		return
	}
	loan, err := h.svc.RegisterReturn(c.Request.Context(), id)
	if err != nil {
		_ = c.Error(err)
		return
	}
	c.JSON(http.StatusOK, dto.NewLoanResponse(loan))
}

type CatalogAvailabilityHandler struct {
	catalog domain.CatalogClient
	log     *slog.Logger
}

func NewCatalogAvailabilityHandler(catalog domain.CatalogClient, log *slog.Logger) *CatalogAvailabilityHandler {
	return &CatalogAvailabilityHandler{catalog: catalog, log: log}
}

type availabilityResponse struct {
	Exists         bool `json:"exists"`
	Available      bool `json:"available"`
	AvailableStock int  `json:"availableStock"`
	TotalStock     int  `json:"totalStock"`
}

// @Summary      Check book availability (reverse channel)
// @Description  Loan Service calls Catalog Service to confirm the book still exists and has stock. This is the reverse channel used by the saga.
// @Tags         catalog
// @Produce      json
// @Param        bookId  path      string  true  "Book UUID"
// @Success      200     {object}  availabilityResponse
// @Failure      400     {object}  dto.ErrorResponse  "invalid uuid"
// @Failure      404     {object}  dto.ErrorResponse  "book not found in catalog"
// @Failure      503     {object}  dto.ErrorResponse  "catalog service unavailable"
// @Router       /availability/{bookId} [get]
func (h *CatalogAvailabilityHandler) Get(c *gin.Context) {
	bookID, err := uuid.Parse(c.Param("bookId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": "invalid_input", "message": "bookId must be a uuid"})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 2*time.Second)
	defer cancel()
	avail, err := h.catalog.CheckAvailability(ctx, bookID)
	if err != nil {
		switch {
		case errors.Is(err, domain.ErrBookNotFoundRemote):
			c.JSON(http.StatusNotFound, gin.H{"code": "book_not_found", "message": "book not found in catalog"})
			return
		case errors.Is(err, domain.ErrCatalogUnavailable):
			h.log.Warn("catalog unavailable for availability check", slog.String("err", err.Error()))
			c.JSON(http.StatusServiceUnavailable, gin.H{"code": "catalog_unavailable", "message": "catalog service unavailable"})
			return
		default:
			h.log.Error("catalog unexpected error", slog.String("err", err.Error()))
			c.JSON(http.StatusBadGateway, gin.H{"code": "catalog_error", "message": err.Error()})
			return
		}
	}
	c.JSON(http.StatusOK, availabilityResponse{
		Exists:         avail.Exists,
		Available:      avail.Available,
		AvailableStock: avail.AvailableStock,
		TotalStock:     avail.TotalStock,
	})
}

type Pinger interface {
	PingContext(ctx context.Context) error
}

type HealthHandler struct {
	db Pinger
}

func NewHealthHandler(db Pinger) *HealthHandler {
	return &HealthHandler{db: db}
}

// @Summary      Liveness + DB ping
// @Description  Returns 200 with db=up when the database is reachable; 503 with db=down otherwise. Fast and dependency-free for orchestrator healthchecks.
// @Tags         health
// @Produce      json
// @Success      200  {object}  map[string]string
// @Failure      503  {object}  map[string]string
// @Router       /healthz [get]
func (h *HealthHandler) Healthz(c *gin.Context) {
	if h.db == nil {
		c.JSON(http.StatusOK, gin.H{"status": "ok", "db": "unknown"})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 2*time.Second)
	defer cancel()
	if err := h.db.PingContext(ctx); err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"status": "degraded", "db": "down"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "ok", "db": "up"})
}
