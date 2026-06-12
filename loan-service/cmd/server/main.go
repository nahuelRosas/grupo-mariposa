// @title           Loan Service
// @version         1.0
// @description     Loan Service: registers loans, returns, and validates with Catalog Service that the book exists and has stock. Exposes HTTP and gRPC; Catalog Service consumes HTTP by default and gRPC as a bonus.
// @description
// @description     Reverse channel: Loan Service calls Catalog Service via HTTP (`/books/:id`) or gRPC (`BookExists`) to verify availability before registering a loan.
// @host            localhost:8080
// @BasePath        /
// @schemes         http https
// @produce         json
// @consumes        json

package main

import (
	"context"
	"errors"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/example/loan-service/internal/application"
	"github.com/example/loan-service/internal/config"
	"github.com/example/loan-service/internal/domain"
	grpcserver "github.com/example/loan-service/internal/infrastructure/grpc"
	grpcclient "github.com/example/loan-service/internal/infrastructure/grpcclient"
	httpdelivery "github.com/example/loan-service/internal/infrastructure/http"
	httpclient "github.com/example/loan-service/internal/infrastructure/httpclient"
	"github.com/example/loan-service/internal/infrastructure/persistence"
	"github.com/example/loan-service/pkg/logger"
	librarypb "github.com/example/loan-service/proto/gen"
	"github.com/gin-gonic/gin"
	"google.golang.org/grpc"
	"gorm.io/gorm"

	"gorm.io/driver/postgres"
)

func main() {
	cfg := config.Load()
	log := logger.New(cfg.LogLevel)
	log.Info(
		"starting loan-service",
		slog.String("app_env", cfg.AppEnv),
		slog.String("grpc_port", cfg.GRPCPort),
		slog.String("http_port", cfg.HTTPPort),
		slog.String("catalog_transport", cfg.CatalogTransport),
		slog.String("catalog_url", cfg.CatalogURL),
	)

	db := openDB(cfg, log)
	defer closeDB(db, log)

	if err := db.Exec("CREATE EXTENSION IF NOT EXISTS pgcrypto").Error; err != nil {
		log.Warn("pgcrypto extension not created (non-fatal in some envs)", slog.String("error", err.Error()))
	}

	persistence.SetDB(db)

	loanRepo := persistence.NewLoanRepository()
	catalogClient := buildCatalogClient(cfg, log)
	loanSvc := application.NewLoanServiceDeps(application.LoanServiceDeps{
		Repo:    loanRepo,
		Catalog: catalogClient,
		Log:     log,
	})

	grpcSrv := grpcserver.NewLoanGRPCServer(loanSvc, log)
	grpcListener, err := net.Listen("tcp", ":"+cfg.GRPCPort)
	if err != nil {
		log.Error("grpc listen failed", slog.String("error", err.Error()))
		os.Exit(1)
	}
	grpcServer := grpc.NewServer(grpc.UnaryInterceptor(grpcserver.UnaryLogger(log)))
	librarypb.RegisterLoanServiceServer(grpcServer, grpcSrv)

	gin.SetMode(gin.ReleaseMode)
	router := gin.New()
	loanH := httpdelivery.NewLoanHandler(loanSvc)
	availH := httpdelivery.NewCatalogAvailabilityHandler(catalogClient, log)
	sqlDB, err := db.DB()
	if err != nil {
		log.Error("db handle for healthcheck failed", slog.String("error", err.Error()))
		os.Exit(1)
	}
	healthH := httpdelivery.NewHealthHandler(sqlDB)
	httpdelivery.RegisterRoutes(router, loanH, healthH, availH, log)
	httpServer := &http.Server{
		Addr:              ":" + cfg.HTTPPort,
		Handler:           router,
		ReadHeaderTimeout: 5 * time.Second,
	}

	errCh := make(chan error, 2)
	go func() {
		log.Info("grpc serving", slog.String("addr", grpcListener.Addr().String()))
		errCh <- grpcServer.Serve(grpcListener)
	}()
	go func() {
		log.Info("http serving", slog.String("addr", httpServer.Addr))
		errCh <- httpServer.ListenAndServe()
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	select {
	case sig := <-quit:
		log.Info("shutdown signal received", slog.String("signal", sig.String()))
	case err := <-errCh:
		if err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Error("server failed", slog.String("error", err.Error()))
		}
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	log.Info("graceful shutdown starting")
	grpcServer.GracefulStop()
	if err := httpServer.Shutdown(shutdownCtx); err != nil {
		log.Error("http shutdown error", slog.String("error", err.Error()))
	}
	if g, ok := catalogClient.(*grpcclient.GRPCCatalogClient); ok && g != nil {
		_ = g.Close()
	}
	log.Info("bye")
}

func openDB(cfg config.Config, log *slog.Logger) *gorm.DB {
	dsn := dsnFromCfg(cfg)
	var db *gorm.DB
	var err error
	for i := 0; i < 10; i++ {
		db, err = gorm.Open(postgres.Open(dsn), &gorm.Config{})
		if err == nil {
			break
		}
		log.Warn("db not ready, retrying", slog.Int("attempt", i+1), slog.String("error", err.Error()))
		time.Sleep(time.Duration(i+1) * time.Second)
	}
	if err != nil {
		log.Error("db open failed", slog.String("error", err.Error()))
		os.Exit(1)
	}
	sqlDB, err := db.DB()
	if err != nil {
		log.Error("db handle failed", slog.String("error", err.Error()))
		os.Exit(1)
	}
	sqlDB.SetMaxOpenConns(cfg.DBMaxOpenConns)
	sqlDB.SetMaxIdleConns(cfg.DBMaxIdleConns)
	sqlDB.SetConnMaxLifetime(time.Duration(cfg.DBConnMaxLifetime) * time.Minute)
	return db
}

func dsnFromCfg(cfg config.Config) string {
	return "host=" + cfg.DBHost +
		" port=" + strconv.Itoa(cfg.DBPort) +
		" user=" + cfg.DBUser +
		" password=" + cfg.DBPassword +
		" dbname=" + cfg.DBName +
		" sslmode=" + cfg.DBSSLMode +
		" TimeZone=UTC"
}

func closeDB(db *gorm.DB, log *slog.Logger) {
	sqlDB, err := db.DB()
	if err != nil {
		log.Warn("close db handle", slog.String("error", err.Error()))
		return
	}
	if err := sqlDB.Close(); err != nil {
		log.Warn("close db", slog.String("error", err.Error()))
	}
}

func buildCatalogClient(cfg config.Config, log *slog.Logger) domain.CatalogClient {
	switch strings.ToLower(cfg.CatalogTransport) {
	case "grpc":
		dialCtx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		g, err := grpcclient.NewGRPCCatalogClient(dialCtx, cfg.CatalogGRPCAddr, time.Duration(cfg.CatalogTimeoutMS)*time.Millisecond, log)
		if err != nil {
			log.Warn("catalog grpc dial failed, falling back to http", slog.String("err", err.Error()))
			return httpclient.NewHTTPCatalogClient(cfg.CatalogURL, time.Duration(cfg.CatalogTimeoutMS)*time.Millisecond, log)
		}
		log.Info("catalog grpc client ready", slog.String("addr", cfg.CatalogGRPCAddr))
		return g
	default:
		return httpclient.NewHTTPCatalogClient(cfg.CatalogURL, time.Duration(cfg.CatalogTimeoutMS)*time.Millisecond, log)
	}
}
