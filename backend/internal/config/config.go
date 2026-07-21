// Package config loads runtime settings from the environment. It replaces the
// Python `pydantic-settings` Settings object; the env var names and defaults
// are kept identical so the same docker-compose wiring keeps working.
package config

import (
	"os"
	"strings"
)

type Config struct {
	DatabaseURL         string
	AgentURL            string
	ServiceSharedSecret string
	FrontendOrigins     string
	Port                string
}

// Load reads the environment, falling back to the same defaults the Python
// backend shipped with.
func Load() Config {
	return Config{
		DatabaseURL:         env("DATABASE_URL", "postgresql://scent:scent@localhost:5432/notemae"),
		AgentURL:            env("AGENT_URL", "http://localhost:8001"),
		ServiceSharedSecret: env("SERVICE_SHARED_SECRET", "change-me-before-production"),
		FrontendOrigins:     env("FRONTEND_ORIGINS", "http://localhost:4173"),
		Port:                env("PORT", "8000"),
	}
}

// CORSOrigins splits FRONTEND_ORIGINS on commas, trimming blanks — the Go
// equivalent of Settings.cors_origins.
func (c Config) CORSOrigins() []string {
	out := make([]string, 0)
	for _, origin := range strings.Split(c.FrontendOrigins, ",") {
		if trimmed := strings.TrimSpace(origin); trimmed != "" {
			out = append(out, trimmed)
		}
	}
	return out
}

func env(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
