// Command api is the composition root for the ScentSphere backend. It loads
// config, opens the PostgreSQL pool and agent client, wires them into the
// domain services, and serves the HTTP presentation layer. This is the only
// place the concrete adapters and the domain meet.
package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/Alvnvnc/Notemae/backend/internal/config"
	"github.com/Alvnvnc/Notemae/backend/internal/data/agentclient"
	"github.com/Alvnvnc/Notemae/backend/internal/data/postgres"
	"github.com/Alvnvnc/Notemae/backend/internal/domain/usecase"
	httpapi "github.com/Alvnvnc/Notemae/backend/internal/presentation/http"
)

func main() {
	cfg := config.Load()

	pool, err := postgres.NewPool(context.Background(), cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("postgres: %v", err)
	}
	defer pool.Close()

	// Data-layer adapters conform to the domain ports; services depend only on
	// those interfaces.
	repo := postgres.New(pool)
	agent := agentclient.New(cfg.AgentURL)

	catalog := usecase.NewCatalogService(repo)
	dupe := usecase.NewDupeService(repo, agent)
	rec := usecase.NewRecommendationService(repo, agent)
	internal := usecase.NewInternalService(repo, agent)

	router := httpapi.NewRouter(
		httpapi.Config{
			AllowedOrigins:      cfg.CORSOrigins(),
			ServiceSharedSecret: cfg.ServiceSharedSecret,
		},
		catalog, dupe, rec, internal,
	)

	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           router,
		ReadHeaderTimeout: 10 * time.Second,
	}

	go func() {
		log.Printf("scentsphere backend listening on :%s (agent=%s)", cfg.Port, cfg.AgentURL)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("http server: %v", err)
		}
	}()

	// Drain in-flight requests on SIGINT/SIGTERM before exiting.
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop
	log.Println("shutting down…")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Printf("graceful shutdown failed: %v", err)
	}
	log.Println("backend stopped")
}
