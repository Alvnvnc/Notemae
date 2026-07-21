package agentclient

import (
	"context"
	"os"
	"testing"
	"time"
)

// TestParseProfile_Integration hits a real agent instance to prove the Go
// client is wire-compatible. It is skipped unless AGENT_URL is set, so the
// normal `go test ./...` run stays hermetic:
//
//	AGENT_URL=http://localhost:8001 go test ./internal/data/agentclient -run Integration -v
func TestParseProfile_Integration(t *testing.T) {
	baseURL := os.Getenv("AGENT_URL")
	if baseURL == "" {
		t.Skip("set AGENT_URL to run the live agent connectivity test")
	}

	client := New(baseURL)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// fast=true takes the deterministic heuristic path: no model credits spent,
	// but it still exercises the full HTTP request/response round-trip.
	profile, generatedBy, err := client.ParseProfile(ctx, "parfum untuk kerja di kantor, budget 1 juta", 3, true)
	if err != nil {
		t.Fatalf("ParseProfile against %s failed: %v", baseURL, err)
	}
	if generatedBy != "catalog_fallback" {
		t.Errorf("fast parse should be catalog_fallback, got %q", generatedBy)
	}
	if profile.Limit != 3 {
		t.Errorf("limit should round-trip as 3, got %d", profile.Limit)
	}
	t.Logf("connected: occasion=%v budget_idr=%v generated_by=%s",
		profile.Occasion, profile.BudgetIDR, generatedBy)
}
