package httpclient

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"time"

	"github.com/example/loan-service/internal/domain"
	"github.com/google/uuid"
)

type HTTPCatalogClient struct {
	baseURL string
	http    *http.Client
	log     *slog.Logger
}

func NewHTTPCatalogClient(baseURL string, timeout time.Duration, log *slog.Logger) *HTTPCatalogClient {
	return &HTTPCatalogClient{
		baseURL: baseURL,
		http:    &http.Client{Timeout: timeout},
		log:     log,
	}
}

type bookResponse struct {
	ID             string `json:"id"`
	AvailableStock int    `json:"availableStock"`
	TotalStock     int    `json:"totalStock"`
}

func (c *HTTPCatalogClient) CheckAvailability(ctx context.Context, bookID uuid.UUID) (domain.CatalogAvailability, error) {
	url := fmt.Sprintf("%s/internal/books/%s", c.baseURL, bookID.String())
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return domain.CatalogAvailability{}, fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("Accept", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		c.log.Warn("catalog http call failed", slog.String("err", err.Error()), slog.String("url", url))
		return domain.CatalogAvailability{}, domain.ErrCatalogUnavailable
	}
	defer resp.Body.Close()

	switch resp.StatusCode {
	case http.StatusOK:
		body, err := io.ReadAll(resp.Body)
		if err != nil {
			return domain.CatalogAvailability{}, domain.ErrCatalogInvalidAnswer
		}
		var b bookResponse
		if err := json.Unmarshal(body, &b); err != nil {
			c.log.Warn("catalog body not json", slog.String("body", string(body)))
			return domain.CatalogAvailability{}, domain.ErrCatalogInvalidAnswer
		}
		if b.ID == "" {
			return domain.CatalogAvailability{}, domain.ErrCatalogInvalidAnswer
		}
		return domain.CatalogAvailability{
			Exists:         true,
			Available:      b.AvailableStock > 0,
			AvailableStock: b.AvailableStock,
			TotalStock:     b.TotalStock,
		}, nil
	case http.StatusNotFound:
		return domain.CatalogAvailability{Exists: false, Available: false}, domain.ErrBookNotFoundRemote
	case http.StatusServiceUnavailable, http.StatusBadGateway, http.StatusGatewayTimeout:
		return domain.CatalogAvailability{}, domain.ErrCatalogUnavailable
	default:
		return domain.CatalogAvailability{}, fmt.Errorf("catalog unexpected status %d: %w", resp.StatusCode, domain.ErrCatalogInvalidAnswer)
	}
}

var _ domain.CatalogClient = (*HTTPCatalogClient)(nil)
