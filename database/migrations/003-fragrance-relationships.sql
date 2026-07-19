-- Curated original/dupe/flanker mapping between catalog fragrances.
-- relation reads left-to-right: fragrance_id is a <relation> of related_id.
CREATE TABLE IF NOT EXISTS fragrance_relationships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fragrance_id UUID NOT NULL REFERENCES fragrances(id) ON DELETE CASCADE,
    related_id UUID NOT NULL REFERENCES fragrances(id) ON DELETE CASCADE,
    relation TEXT NOT NULL CHECK (relation IN ('clone_of', 'inspired_by', 'flanker_of')),
    confidence REAL NOT NULL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
    source TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (fragrance_id <> related_id),
    UNIQUE (fragrance_id, related_id)
);

CREATE INDEX IF NOT EXISTS fragrance_relationships_related_idx
    ON fragrance_relationships (related_id);
