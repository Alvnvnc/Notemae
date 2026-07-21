package postgres

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/Alvnvnc/Notemae/backend/internal/domain/repository"
)

// argBuilder accumulates query args and hands back the matching $N placeholder,
// so a clause and its value can never drift out of sync.
type argBuilder struct {
	args []any
}

func (b *argBuilder) next(v any) string {
	b.args = append(b.args, v)
	return "$" + strconv.Itoa(len(b.args))
}

// noteTierColumn maps a tier name to its pyramid column. Anything unknown falls
// back to the flat union, so an unrecognised tier widens the search rather than
// returning nothing. The result is always a hard-coded identifier — never user
// input — so it is safe to interpolate into SQL.
func noteTierColumn(tier *string) string {
	if tier == nil {
		return "notes"
	}
	switch strings.ToLower(*tier) {
	case "top":
		return "top_notes"
	case "heart":
		return "heart_notes"
	case "base":
		return "base_notes"
	default:
		return "notes"
	}
}

// catalogWhere builds the shared WHERE clause, appending values to b. The
// count and the page both call this so the pager total always matches the
// window it sizes. Returns "" (no clause) when nothing is filtered.
func catalogWhere(b *argBuilder, f repository.CatalogFilter) string {
	var clauses []string

	if f.Query != nil && *f.Query != "" {
		p := b.next("%" + *f.Query + "%")
		clauses = append(clauses, fmt.Sprintf("(brand ILIKE %s OR name ILIKE %s OR description ILIKE %s)", p, p, p))
	}
	if f.Note != nil && *f.Note != "" {
		column := noteTierColumn(f.NoteTier)
		p := b.next(strings.ToLower(*f.Note))
		clauses = append(clauses, fmt.Sprintf("%s = ANY(%s)", p, column))
	}
	if f.Occasion != nil && *f.Occasion != "" {
		p := b.next(strings.ToLower(*f.Occasion))
		clauses = append(clauses, fmt.Sprintf("%s = ANY(occasions)", p))
	}
	if f.Gender != nil && *f.Gender != "" {
		p := b.next(strings.ToLower(*f.Gender))
		clauses = append(clauses, "gender = "+p)
	}
	if f.Brand != nil && *f.Brand != "" {
		// Brand is matched exactly and not lower-cased, matching the Python filter.
		p := b.next(*f.Brand)
		clauses = append(clauses, "brand = "+p)
	}
	if f.MaxPriceIDR != nil {
		// A price-less record still clears an upper bound: nothing rules it out.
		p := b.next(*f.MaxPriceIDR)
		clauses = append(clauses, fmt.Sprintf("(price_idr IS NULL OR price_idr <= %s)", p))
	}
	if f.MinPriceIDR != nil {
		// A lower bound excludes price-less records — the catalog cannot promise
		// they clear the floor.
		p := b.next(*f.MinPriceIDR)
		clauses = append(clauses, "price_idr >= "+p)
	}
	for _, note := range f.AvoidNotes {
		p := b.next(strings.ToLower(note))
		clauses = append(clauses, fmt.Sprintf("NOT (%s = ANY(notes))", p))
	}

	if len(clauses) == 0 {
		return ""
	}
	return "WHERE " + strings.Join(clauses, " AND ")
}
