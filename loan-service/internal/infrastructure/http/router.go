package http

import (
	"log/slog"

	"github.com/example/loan-service/internal/infrastructure/http/middleware"
	"github.com/gin-gonic/gin"
	swaggerFiles "github.com/swaggo/files"
	ginSwagger "github.com/swaggo/gin-swagger"

	_ "github.com/example/loan-service/docs/swagger"
)

func RegisterRoutes(
	r *gin.Engine,
	loan *LoanHandler,
	health *HealthHandler,
	avail *CatalogAvailabilityHandler,
	log *slog.Logger,
) {
	r.Use(gin.Recovery(), middleware.RequestLogger(log), middleware.ErrorHandler(log))

	r.GET("/healthz", health.Healthz)
	r.GET("/swagger/*any", ginSwagger.WrapHandler(swaggerFiles.Handler))

	api := r.Group("/")
	{
		api.POST("/loans", loan.CreateLoan)
		api.GET("/loans", loan.ListLoans)
		api.POST("/loans/:id/return", loan.ReturnLoan)
		api.GET("/availability/:bookId", avail.Get)
	}
}
