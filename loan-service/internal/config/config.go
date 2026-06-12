package config

import (
	"os"
	"strconv"
)

type Config struct {
	AppEnv   string
	HTTPPort string
	GRPCPort string

	DBHost            string
	DBPort            int
	DBName            string
	DBUser            string
	DBPassword        string
	DBSSLMode         string
	DBMaxOpenConns    int
	DBMaxIdleConns    int
	DBConnMaxLifetime int

	CatalogURL       string
	CatalogTimeoutMS int
	CatalogTransport string
	CatalogGRPCAddr  string

	LogLevel string
}

func Load() Config {
	return Config{
		AppEnv:            getenv("APP_ENV", "development"),
		HTTPPort:          getenv("HTTP_PORT", "8080"),
		GRPCPort:          getenv("GRPC_PORT", "50051"),
		DBHost:            getenv("DB_HOST", "localhost"),
		DBPort:            getenvInt("DB_PORT", 5432),
		DBName:            getenv("DB_NAME", "db_loans"),
		DBUser:            getenv("DB_USER", "library"),
		DBPassword:        getenv("DB_PASSWORD", "library_dev_pw"),
		DBSSLMode:         getenv("DB_SSLMODE", "disable"),
		DBMaxOpenConns:    getenvInt("DB_MAX_OPEN_CONNS", 20),
		DBMaxIdleConns:    getenvInt("DB_MAX_IDLE_CONNS", 5),
		DBConnMaxLifetime: getenvInt("DB_CONN_MAX_LIFETIME_MIN", 30),
		CatalogURL:        getenv("CATALOG_URL", "http://catalog:3000"),
		CatalogTimeoutMS:  getenvInt("CATALOG_TIMEOUT_MS", 2000),
		CatalogTransport:  getenv("CATALOG_TRANSPORT", "http"),
		CatalogGRPCAddr:   getenv("CATALOG_GRPC_ADDR", "catalog:50052"),
		LogLevel:          getenv("LOG_LEVEL", "info"),
	}
}

func getenv(k, def string) string {
	if v, ok := os.LookupEnv(k); ok && v != "" {
		return v
	}
	return def
}

func getenvInt(k string, def int) int {
	if v, ok := os.LookupEnv(k); ok {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return def
}
