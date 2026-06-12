package grpcclient

import (
	"context"
	"log/slog"
	"time"

	"github.com/example/loan-service/internal/domain"
	librarypb "github.com/example/loan-service/proto/gen"
	"github.com/google/uuid"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/status"
)

type GRPCCatalogClient struct {
	conn   *grpc.ClientConn
	client librarypb.BookServiceClient
	log    *slog.Logger
}

func NewGRPCCatalogClient(ctx context.Context, addr string, timeout time.Duration, log *slog.Logger) (*GRPCCatalogClient, error) {
	conn, err := grpc.DialContext(
		ctx, addr,
		grpc.WithTransportCredentials(insecure.NewCredentials()),
		grpc.WithBlock(),
		grpc.WithTimeout(timeout),
	)
	if err != nil {
		return nil, err
	}
	return &GRPCCatalogClient{
		conn:   conn,
		client: librarypb.NewBookServiceClient(conn),
		log:    log,
	}, nil
}

func (c *GRPCCatalogClient) Close() error { return c.conn.Close() }

func (c *GRPCCatalogClient) CheckAvailability(ctx context.Context, bookID uuid.UUID) (domain.CatalogAvailability, error) {
	resp, err := c.client.BookExists(ctx, &librarypb.BookExistsRequest{
		BookId: bookID.String(),
	})
	if err != nil {
		st, _ := status.FromError(err)
		switch st.Code().String() {
		case "NotFound":
			return domain.CatalogAvailability{Exists: false, Available: false}, domain.ErrBookNotFoundRemote
		case "Unavailable", "DeadlineExceeded":
			return domain.CatalogAvailability{}, domain.ErrCatalogUnavailable
		default:
			c.log.Warn("catalog grpc unexpected", slog.String("err", err.Error()))
			return domain.CatalogAvailability{}, domain.ErrCatalogInvalidAnswer
		}
	}
	return domain.CatalogAvailability{
		Exists:         resp.GetExists(),
		Available:      resp.GetAvailable(),
		AvailableStock: int(resp.GetAvailableStock()),
		TotalStock:     int(resp.GetTotalStock()),
	}, nil
}

var _ domain.CatalogClient = (*GRPCCatalogClient)(nil)
