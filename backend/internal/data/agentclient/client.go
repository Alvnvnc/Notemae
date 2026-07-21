// Package agentclient is the data-layer adapter that implements
// repository.AgentPort by talking HTTP to the Qwen agent service. It uses only
// the standard library; the JSON shapes mirror exactly what the former Python
// backend sent, so it is wire-compatible with the existing agent.
package agentclient

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"time"

	"github.com/Alvnvnc/Notemae/backend/internal/domain/entity"
	"github.com/Alvnvnc/Notemae/backend/internal/domain/repository"
)

// Client talks to the agent service. unary is used for request/response calls
// with a per-call timeout; stream has no client timeout so a long-lived
// explanation stream is bounded by the caller's context instead.
type Client struct {
	baseURL string
	unary   *http.Client
	stream  *http.Client
}

// compile-time proof the adapter satisfies the domain port.
var _ repository.AgentPort = (*Client)(nil)

// New builds a client for the agent at baseURL. timeout bounds unary calls.
func New(baseURL string) *Client {
	return &Client{
		baseURL: baseURL,
		unary:   &http.Client{Timeout: 45 * time.Second},
		stream:  &http.Client{}, // no timeout: streaming lifetime is the ctx's
	}
}

// postJSON sends body as JSON to path and decodes the response into out. A
// non-2xx status is returned as an error so the domain can fall back.
func (c *Client) postJSON(ctx context.Context, path string, body, out any) error {
	buf, err := json.Marshal(body)
	if err != nil {
		return fmt.Errorf("agent: marshal %s: %w", path, err)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+path, bytes.NewReader(buf))
	if err != nil {
		return fmt.Errorf("agent: new request %s: %w", path, err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.unary.Do(req)
	if err != nil {
		return fmt.Errorf("agent: post %s: %w", path, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("agent: %s returned %d", path, resp.StatusCode)
	}
	if out == nil {
		return nil
	}
	if err := json.NewDecoder(resp.Body).Decode(out); err != nil {
		return fmt.Errorf("agent: decode %s: %w", path, err)
	}
	return nil
}

// Embed maps to POST /v1/embeddings.
func (c *Client) Embed(ctx context.Context, texts []string) ([][]float32, error) {
	var out struct {
		Embeddings [][]float32 `json:"embeddings"`
	}
	if err := c.postJSON(ctx, "/v1/embeddings", map[string]any{"texts": texts}, &out); err != nil {
		return nil, err
	}
	return out.Embeddings, nil
}

// Recommend maps to POST /v1/recommend.
func (c *Client) Recommend(ctx context.Context, req entity.AgentRequest) (*entity.RecommendationResponse, error) {
	var out entity.RecommendationResponse
	if err := c.postJSON(ctx, "/v1/recommend", req, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// Rank maps to POST /v1/recommend/rank. The agent's RankRequest is a
// RecommendationRequest plus a rerank flag, so AgentRequest is embedded to
// flatten into the same JSON object.
func (c *Client) Rank(ctx context.Context, req entity.AgentRequest, rerank bool) ([]entity.MatchResult, error) {
	body := struct {
		entity.AgentRequest
		Rerank bool `json:"rerank"`
	}{AgentRequest: req, Rerank: rerank}

	var out struct {
		Matches []entity.MatchResult `json:"matches"`
	}
	if err := c.postJSON(ctx, "/v1/recommend/rank", body, &out); err != nil {
		return nil, err
	}
	return out.Matches, nil
}

// ParseProfile maps to POST /v1/preferences/parse?fast=<bool>.
func (c *Client) ParseProfile(ctx context.Context, text string, limit int, fast bool) (entity.RecommendationRequest, entity.GeneratedBy, error) {
	path := "/v1/preferences/parse?" + url.Values{"fast": {strconv.FormatBool(fast)}}.Encode()
	body := map[string]any{"text": text, "limit": limit}

	var out struct {
		Profile     entity.RecommendationRequest `json:"profile"`
		GeneratedBy entity.GeneratedBy           `json:"generated_by"`
	}
	if err := c.postJSON(ctx, path, body, &out); err != nil {
		return entity.RecommendationRequest{}, "", err
	}
	return out.Profile, out.GeneratedBy, nil
}

// ExplainDupes maps to POST /v1/dupes/explain.
func (c *Client) ExplainDupes(ctx context.Context, payload entity.DupeExplainPayload) (string, entity.GeneratedBy, error) {
	var out struct {
		Explanation string             `json:"explanation"`
		GeneratedBy entity.GeneratedBy `json:"generated_by"`
	}
	if err := c.postJSON(ctx, "/v1/dupes/explain", payload, &out); err != nil {
		return "", "", err
	}
	return out.Explanation, out.GeneratedBy, nil
}

// ExplainRecommendation maps to POST /v1/recommend/explain, which streams the
// narrative as plain-text deltas. Chunks are pushed onto the returned channel
// as they arrive; errCh receives a single terminal value (nil on clean EOF)
// after the text channel closes. The domain layer strips the trailing fallback
// sentinel — this adapter forwards bytes verbatim.
func (c *Client) ExplainRecommendation(ctx context.Context, payload entity.ExplainPayload) (<-chan string, <-chan error, error) {
	buf, err := json.Marshal(payload)
	if err != nil {
		return nil, nil, fmt.Errorf("agent: marshal explain: %w", err)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/v1/recommend/explain", bytes.NewReader(buf))
	if err != nil {
		return nil, nil, fmt.Errorf("agent: new explain request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.stream.Do(req)
	if err != nil {
		return nil, nil, fmt.Errorf("agent: post explain: %w", err)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		resp.Body.Close()
		return nil, nil, fmt.Errorf("agent: explain returned %d", resp.StatusCode)
	}

	textCh := make(chan string)
	errCh := make(chan error, 1)
	go func() {
		defer close(textCh)
		defer resp.Body.Close()
		reader := make([]byte, 4096)
		for {
			n, readErr := resp.Body.Read(reader)
			if n > 0 {
				select {
				case textCh <- string(reader[:n]):
				case <-ctx.Done():
					errCh <- ctx.Err()
					return
				}
			}
			if readErr == io.EOF {
				errCh <- nil
				return
			}
			if readErr != nil {
				errCh <- readErr
				return
			}
		}
	}()
	return textCh, errCh, nil
}
