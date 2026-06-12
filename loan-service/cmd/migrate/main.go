package main

import (
	"errors"
	"fmt"
	"log/slog"
	"os"
	"strconv"

	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/postgres"
	_ "github.com/golang-migrate/migrate/v4/source/file"
)

func main() {
	log := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelInfo}))

	if len(os.Args) < 2 {
		log.Error("usage: migrate <up|down|version|force VERSION>")
		os.Exit(2)
	}
	cmd := os.Args[1]

	migrationsPath := getenv("MIGRATIONS_PATH", "file://./migrations")
	dsn := buildDSN()

	m, err := migrate.New(migrationsPath, dsn)
	if err != nil {
		log.Error("migrate init", slog.String("err", err.Error()))
		os.Exit(1)
	}
	defer m.Close()

	switch cmd {
	case "up":
		if err := m.Up(); err != nil && !errors.Is(err, migrate.ErrNoChange) {
			log.Error("migrate up", slog.String("err", err.Error()))
			os.Exit(1)
		}
		log.Info("migrate up done")
	case "down":
		if err := m.Down(); err != nil && !errors.Is(err, migrate.ErrNoChange) {
			log.Error("migrate down", slog.String("err", err.Error()))
			os.Exit(1)
		}
		log.Info("migrate down done")
	case "version":
		v, dirty, err := m.Version()
		if errors.Is(err, migrate.ErrNilVersion) {
			fmt.Println("no migrations applied")
			return
		}
		if err != nil {
			log.Error("migrate version", slog.String("err", err.Error()))
			os.Exit(1)
		}
		fmt.Printf("version=%d dirty=%v\n", v, dirty)
	case "force":
		if len(os.Args) < 3 {
			log.Error("force requires a version argument")
			os.Exit(2)
		}
		v, err := strconv.Atoi(os.Args[2])
		if err != nil {
			log.Error("force version must be an integer", slog.String("err", err.Error()))
			os.Exit(2)
		}
		if err := m.Force(v); err != nil {
			log.Error("migrate force", slog.String("err", err.Error()))
			os.Exit(1)
		}
		log.Info("migrate force done", slog.Int("version", v))
	default:
		log.Error("unknown subcommand", slog.String("cmd", cmd))
		os.Exit(2)
	}
}

func buildDSN() string {
	return fmt.Sprintf(
		"postgres://%s:%s@%s:%s/%s?sslmode=%s",
		getenv("DB_USER", "library"),
		getenv("DB_PASSWORD", "library_dev_pw"),
		getenv("DB_HOST", "localhost"),
		getenv("DB_PORT", "5432"),
		getenv("DB_NAME", "db_loans"),
		getenv("DB_SSLMODE", "disable"),
	)
}

func getenv(k, def string) string {
	if v, ok := os.LookupEnv(k); ok && v != "" {
		return v
	}
	return def
}
