package httpclient_test

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/example/loan-service/internal/domain"
	httpclient "github.com/example/loan-service/internal/infrastructure/httpclient"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func newLogger() *slog.Logger { return slog.New(slog.NewTextHandler(io.Discard, nil)) }

func TestHTTPCatalogClient_OK(t *testing.T) {
	bookID := uuid.New()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "/internal/books/"+bookID.String(), r.URL.Path)
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"id":             bookID.String(),
			"availableStock": 3,
			"totalStock":     5,
		})
	}))
	defer srv.Close()

	c := httpclient.NewHTTPCatalogClient(srv.URL, time.Second, newLogger())
	got, err := c.CheckAvailability(context.Background(), bookID)
	require.NoError(t, err)
	assert.True(t, got.Exists)
	assert.True(t, got.Available)
	assert.Equal(t, 3, got.AvailableStock)
	assert.Equal(t, 5, got.TotalStock)
}

func TestHTTPCatalogClient_404MapsToNotFound(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	}))
	defer srv.Close()

	c := httpclient.NewHTTPCatalogClient(srv.URL, time.Second, newLogger())
	_, err := c.CheckAvailability(context.Background(), uuid.New())
	assert.ErrorIs(t, err, domain.ErrBookNotFoundRemote)
}

func TestHTTPCatalogClient_503MapsToUnavailable(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
	}))
	defer srv.Close()

	c := httpclient.NewHTTPCatalogClient(srv.URL, time.Second, newLogger())
	_, err := c.CheckAvailability(context.Background(), uuid.New())
	assert.ErrorIs(t, err, domain.ErrCatalogUnavailable)
}

func TestHTTPCatalogClient_NoStockMeansUnavailable(t *testing.T) {
	bookID := uuid.New()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"id":             bookID.String(),
			"availableStock": 0,
			"totalStock":     2,
		})
	}))
	defer srv.Close()

	c := httpclient.NewHTTPCatalogClient(srv.URL, time.Second, newLogger())
	got, err := c.CheckAvailability(context.Background(), bookID)
	require.NoError(t, err)
	assert.True(t, got.Exists)
	assert.False(t, got.Available)
	assert.Equal(t, 0, got.AvailableStock)
}

func TestHTTPCatalogClient_ConnectionRefused_ReturnsUnavailable(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	url := srv.URL
	srv.Close()

	c := httpclient.NewHTTPCatalogClient(url, 500*time.Millisecond, newLogger())
	_, err := c.CheckAvailability(context.Background(), uuid.New())
	assert.ErrorIs(t, err, domain.ErrCatalogUnavailable)
}
