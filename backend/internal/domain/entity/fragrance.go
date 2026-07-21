// Package entity holds the pure domain models. It is the innermost layer:
// nothing here imports net/http, database drivers, or the Gin/pgx stack.
// Both the data layer and the presentation layer depend on these types.
package entity

import "github.com/google/uuid"

// SourceType mirrors the CHECK constraint on fragrances.source_type.
type SourceType string

const (
	SourcePublicDataset SourceType = "public_dataset"
	SourceOfficialAPI   SourceType = "official_api"
	SourceLicensedFeed  SourceType = "licensed_feed"
)

// Fragrance is the catalog record exposed to the browser. Nullable SQL columns
// are pointers so a missing value serializes as JSON null (matching the Python
// Optional fields) instead of a zero that looks like real data.
//
// NOTE (parity): slice fields must be non-nil when marshaled — a nil Go slice
// encodes to `null`, but the Python API returned `[]`. The data layer is
// responsible for materializing empty slices, never leaving them nil.
type Fragrance struct {
	ID              uuid.UUID  `json:"id"`
	Slug            string     `json:"slug"`
	Brand           string     `json:"brand"`
	Name            string     `json:"name"`
	Description     string     `json:"description"`
	Gender          string     `json:"gender"`
	ReleaseYear     *int       `json:"release_year"`
	Notes           []string   `json:"notes"`
	TopNotes        []string   `json:"top_notes"`
	HeartNotes      []string   `json:"heart_notes"`
	BaseNotes       []string   `json:"base_notes"`
	Occasions       []string   `json:"occasions"`
	Climates        []string   `json:"climates"`
	PriceIDR        *int       `json:"price_idr"`
	Rating          *Score     `json:"rating"`
	LongevityScore  *Score     `json:"longevity_score"`
	ProjectionScore *Score     `json:"projection_score"`
	SourceURL       string     `json:"source_url"`
	SourceType      SourceType `json:"source_type"`
	// SemanticSimilarity is only populated when a query embedding was supplied.
	// It is a float8 computed in-database, so it renders identically on both
	// backends and stays a plain float64 (no Score wrapper).
	SemanticSimilarity *float64 `json:"semantic_similarity"`
}

// FragranceList is a paginated catalog window. Total is the count under the
// same filter as Items so the pager can never drift onto a different predicate.
type FragranceList struct {
	Total int         `json:"total"`
	Items []Fragrance `json:"items"`
}

type BrandList struct {
	Items []string `json:"items"`
}

// InternalFragranceUpsert is the payload the scraping service pushes to
// /internal/fragrances. Field-level bounds are enforced in the presentation
// DTO; the domain type carries the validated shape.
type InternalFragranceUpsert struct {
	Slug            string     `json:"slug"`
	Brand           string     `json:"brand"`
	Name            string     `json:"name"`
	Description     string     `json:"description"`
	Gender          string     `json:"gender"`
	ReleaseYear     *int       `json:"release_year"`
	Notes           []string   `json:"notes"`
	TopNotes        []string   `json:"top_notes"`
	HeartNotes      []string   `json:"heart_notes"`
	BaseNotes       []string   `json:"base_notes"`
	Occasions       []string   `json:"occasions"`
	Climates        []string   `json:"climates"`
	PriceIDR        *int       `json:"price_idr"`
	Rating          *float64   `json:"rating"`
	LongevityScore  *float64   `json:"longevity_score"`
	ProjectionScore *float64   `json:"projection_score"`
	SourceURL       string     `json:"source_url"`
	SourceType      SourceType `json:"source_type"`
}

// InternalList is the shape of the paginated /internal/fragrances response.
type InternalList struct {
	Total int         `json:"total"`
	Items []Fragrance `json:"items"`
}
