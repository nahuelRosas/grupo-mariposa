package http_test

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/example/loan-service/internal/domain"
	httpdelivery "github.com/example/loan-service/internal/infrastructure/http"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
)

type mockLoanService struct{ mock.Mock }

func (m *mockLoanService) RegisterLoan(ctx context.Context, bookID, userID uuid.UUID, key string) (*domain.Loan, error) {
	args := m.Called(ctx, bookID, userID, key)
	if l := args.Get(0); l != nil {
		return l.(*domain.Loan), args.Error(1)
	}
	return nil, args.Error(1)
}

func (m *mockLoanService) RegisterReturn(ctx context.Context, loanID uuid.UUID) (*domain.Loan, error) {
	args := m.Called(ctx, loanID)
	if l := args.Get(0); l != nil {
		return l.(*domain.Loan), args.Error(1)
	}
	return nil, args.Error(1)
}

func (m *mockLoanService) GetLoan(ctx context.Context, loanID uuid.UUID) (*domain.Loan, error) {
	args := m.Called(ctx, loanID)
	if l := args.Get(0); l != nil {
		return l.(*domain.Loan), args.Error(1)
	}
	return nil, args.Error(1)
}

func (m *mockLoanService) ListLoans(ctx context.Context, f domain.LoanFilter) (*domain.LoanPage, error) {
	args := m.Called(ctx, f)
	if p := args.Get(0); p != nil {
		return p.(*domain.LoanPage), args.Error(1)
	}
	return nil, args.Error(1)
}

func (m *mockLoanService) ValidateAvailability(ctx context.Context, bookID uuid.UUID) (bool, int64, error) {
	args := m.Called(ctx, bookID)
	return args.Bool(0), args.Get(1).(int64), args.Error(2)
}

type fakeCatalog struct{ mock.Mock }

func (f *fakeCatalog) CheckAvailability(ctx context.Context, bookID uuid.UUID) (domain.CatalogAvailability, error) {
	args := f.Called(ctx, bookID)
	if args.Get(0) == nil {
		return domain.CatalogAvailability{}, args.Error(1)
	}
	return args.Get(0).(domain.CatalogAvailability), args.Error(1)
}

func testLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

type fakePinger struct{ err error }

func (f fakePinger) PingContext(_ context.Context) error { return f.err }

func buildRouter(mockSvc *mockLoanService, cat domain.CatalogClient) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	httpdelivery.RegisterRoutes(
		r,
		httpdelivery.NewLoanHandler(mockSvc),
		httpdelivery.NewHealthHandler(fakePinger{}),
		httpdelivery.NewCatalogAvailabilityHandler(cat, testLogger()),
		testLogger(),
	)
	return r
}

func TestListLoans_OK(t *testing.T) {
	mockSvc := &mockLoanService{}
	page := &domain.LoanPage{
		Items: []*domain.Loan{
			{ID: uuid.New(), BookID: uuid.New(), UserID: uuid.New(), Status: domain.LoanStatusActive},
		},
		Page: 1, PageSize: 20, Total: 1,
	}
	mockSvc.On("ListLoans", mock.Anything, mock.Anything).Return(page, nil)

	r := buildRouter(mockSvc, &fakeCatalog{})

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/loans?page=1&page_size=20", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	var body map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &body))
	assert.EqualValues(t, 1, body["total"])
}

func TestReturnLoan_NotFound(t *testing.T) {
	mockSvc := &mockLoanService{}
	mockSvc.On("RegisterReturn", mock.Anything, mock.Anything).Return(nil, domain.ErrLoanNotFound)

	r := buildRouter(mockSvc, &fakeCatalog{})
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/loans/"+uuid.NewString()+"/return", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusNotFound, w.Code)
	assert.Contains(t, w.Body.String(), "loan_not_found")
}

func TestHealthz_Up(t *testing.T) {
	r := buildRouter(&mockLoanService{}, &fakeCatalog{})
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Contains(t, w.Body.String(), `"db":"up"`)
}

func TestCreateLoan_OK(t *testing.T) {
	mockSvc := &mockLoanService{}
	bookID, userID := uuid.New(), uuid.New()
	loan := &domain.Loan{ID: uuid.New(), BookID: bookID, UserID: userID, Status: domain.LoanStatusActive}
	mockSvc.On("RegisterLoan", mock.Anything, bookID, userID, "key-abc").Return(loan, nil)

	r := buildRouter(mockSvc, &fakeCatalog{})

	body := `{"book_id":"` + bookID.String() + `","user_id":"` + userID.String() + `","idempotency_key":"key-abc"}`
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/loans", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusCreated, w.Code)
	var resp map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, loan.ID.String(), resp["id"])
}

func TestCreateLoan_InvalidBody(t *testing.T) {
	r := buildRouter(&mockLoanService{}, &fakeCatalog{})

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/loans", strings.NewReader(`{"book_id":"not-a-uuid"}`))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestAvailability_OK(t *testing.T) {
	bookID := uuid.New()
	cat := &fakeCatalog{}
	cat.On("CheckAvailability", mock.Anything, bookID).Return(
		domain.CatalogAvailability{Exists: true, Available: true, AvailableStock: 2, TotalStock: 5}, nil,
	)

	r := buildRouter(&mockLoanService{}, cat)
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/availability/"+bookID.String(), nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	var body map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &body))
	assert.Equal(t, true, body["exists"])
	assert.Equal(t, true, body["available"])
	assert.EqualValues(t, 2, body["availableStock"])
}

func TestAvailability_CatalogDown_503(t *testing.T) {
	bookID := uuid.New()
	cat := &fakeCatalog{}
	cat.On("CheckAvailability", mock.Anything, bookID).Return(
		domain.CatalogAvailability{}, domain.ErrCatalogUnavailable,
	)

	r := buildRouter(&mockLoanService{}, cat)
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/availability/"+bookID.String(), nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusServiceUnavailable, w.Code)
}

func TestAvailability_BookNotFound_404(t *testing.T) {
	bookID := uuid.New()
	cat := &fakeCatalog{}
	cat.On("CheckAvailability", mock.Anything, bookID).Return(
		domain.CatalogAvailability{Exists: false}, domain.ErrBookNotFoundRemote,
	)

	r := buildRouter(&mockLoanService{}, cat)
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/availability/"+bookID.String(), nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusNotFound, w.Code)
}
