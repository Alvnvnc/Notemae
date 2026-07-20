CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE fragrances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT NOT NULL UNIQUE,
    brand TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    gender TEXT NOT NULL DEFAULT 'unisex',
    release_year INTEGER,
    -- ordered union of the three tiers below, opening first; stands on its
    -- own for records ingested before the pyramid existed
    notes TEXT[] NOT NULL DEFAULT '{}',
    top_notes TEXT[] NOT NULL DEFAULT '{}',
    heart_notes TEXT[] NOT NULL DEFAULT '{}',
    base_notes TEXT[] NOT NULL DEFAULT '{}',
    occasions TEXT[] NOT NULL DEFAULT '{}',
    climates TEXT[] NOT NULL DEFAULT '{}',
    price_idr INTEGER,
    rating NUMERIC(2, 1),
    longevity_score NUMERIC(2, 1),
    projection_score NUMERIC(2, 1),
    source_url TEXT NOT NULL,
    source_type TEXT NOT NULL CHECK (source_type IN ('public_dataset', 'official_api', 'licensed_feed')),
    document_embedding VECTOR(1024),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX fragrances_notes_idx ON fragrances USING GIN (notes);
CREATE INDEX fragrances_top_notes_idx ON fragrances USING GIN (top_notes);
CREATE INDEX fragrances_heart_notes_idx ON fragrances USING GIN (heart_notes);
CREATE INDEX fragrances_base_notes_idx ON fragrances USING GIN (base_notes);
CREATE INDEX fragrances_missing_pyramid_idx ON fragrances (id)
    WHERE top_notes = '{}' AND heart_notes = '{}' AND base_notes = '{}';
CREATE INDEX fragrances_occasions_idx ON fragrances USING GIN (occasions);
CREATE INDEX fragrances_climates_idx ON fragrances USING GIN (climates);

CREATE TABLE fragrance_prices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fragrance_id UUID NOT NULL REFERENCES fragrances(id) ON DELETE CASCADE,
    retailer TEXT NOT NULL,
    price_idr INTEGER NOT NULL CHECK (price_idr >= 0),
    size_ml INTEGER,
    product_url TEXT NOT NULL,
    observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (fragrance_id, retailer, size_ml, observed_at)
);

-- relation reads left-to-right: fragrance_id is a <relation> of related_id.
CREATE TABLE fragrance_relationships (
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

CREATE INDEX fragrance_relationships_related_idx
    ON fragrance_relationships (related_id);

CREATE TABLE ingestion_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_name TEXT NOT NULL,
    source_type TEXT NOT NULL CHECK (source_type IN ('public_dataset', 'official_api', 'licensed_feed')),
    status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed')),
    records_received INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ
);

INSERT INTO fragrances (
    slug, brand, name, description, gender,
    notes, top_notes, heart_notes, base_notes, occasions, climates,
    price_idr, rating, longevity_score, projection_score, source_url, source_type
) VALUES
    (
        'prada-lhomme', 'Prada', 'L''Homme',
        'A clean iris-led woody fragrance with a polished office profile.', 'men',
        ARRAY['neroli', 'iris', 'amber', 'cedar'],
        ARRAY['neroli'], ARRAY['iris'], ARRAY['amber', 'cedar'],
        ARRAY['office', 'interview', 'formal'], ARRAY['tropical', 'warm', 'mild'],
        1850000, 4.4, 4.0, 3.0, 'https://example.com/datasets/scent-demo', 'public_dataset'
    ),
    (
        'bleu-de-chanel-edp', 'Chanel', 'Bleu de Chanel Eau de Parfum',
        'A woody aromatic fragrance suited to versatile day-to-evening wear.', 'men',
        ARRAY['citrus', 'incense', 'cedar', 'amber'],
        ARRAY['citrus'], ARRAY['incense'], ARRAY['cedar', 'amber'],
        ARRAY['office', 'date', 'formal'], ARRAY['tropical', 'warm', 'mild'],
        2450000, 4.6, 4.3, 3.6, 'https://example.com/datasets/scent-demo', 'public_dataset'
    ),
    (
        'versace-pour-homme', 'Versace', 'Pour Homme',
        'A bright citrus aromatic fragrance with a casual fresh character.', 'men',
        ARRAY['citrus', 'neroli', 'cedar', 'musk'],
        ARRAY['citrus', 'neroli'], ARRAY['cedar'], ARRAY['musk'],
        ARRAY['office', 'gym', 'casual'], ARRAY['tropical', 'hot'],
        1050000, 4.2, 3.2, 2.8, 'https://example.com/datasets/scent-demo', 'public_dataset'
    ),
    (
        'dior-sauvage-edt', 'Dior', 'Sauvage Eau de Toilette',
        'A fresh aromatic amber fragrance with a high-energy profile.', 'men',
        ARRAY['bergamot', 'pepper', 'lavender', 'ambroxan'],
        ARRAY['bergamot', 'pepper'], ARRAY['lavender'], ARRAY['ambroxan'],
        ARRAY['date', 'party', 'casual'], ARRAY['tropical', 'warm'],
        1950000, 4.3, 4.1, 4.2, 'https://example.com/datasets/scent-demo', 'public_dataset'
    )
ON CONFLICT (slug) DO NOTHING;
