-- Note pyramid: split the flat note list into the tiers a wearer actually
-- meets over time, so the catalog can say "bergamot in the opening, vanilla
-- in the dry-down" instead of listing four notes with no order to them.
--
-- `notes` deliberately stays. It remains the ordered union of the three
-- tiers (opening first) and keeps every existing query, GIN index and v1
-- API response working unchanged. Rows ingested before this migration have
-- empty tiers and a populated `notes`; that is a valid state, and readers
-- fall back to inferring tiers from material volatility.

ALTER TABLE fragrances
    ADD COLUMN IF NOT EXISTS top_notes TEXT[] NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS heart_notes TEXT[] NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS base_notes TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN fragrances.notes IS
    'Ordered union of top_notes, heart_notes and base_notes (opening first). '
    'Populated on its own for records ingested before the pyramid existed.';

-- The pyramid is filtered on the same way `notes` is (`= ANY(...)`), and a
-- tier-scoped filter cannot use the fragrances_notes_idx GIN index.
CREATE INDEX IF NOT EXISTS fragrances_top_notes_idx
    ON fragrances USING GIN (top_notes);
CREATE INDEX IF NOT EXISTS fragrances_heart_notes_idx
    ON fragrances USING GIN (heart_notes);
CREATE INDEX IF NOT EXISTS fragrances_base_notes_idx
    ON fragrances USING GIN (base_notes);

-- Re-enrichment targets rows that have notes but no pyramid. Without this
-- index that sweep is a sequential scan over the whole catalog every run.
CREATE INDEX IF NOT EXISTS fragrances_missing_pyramid_idx
    ON fragrances (id)
    WHERE top_notes = '{}' AND heart_notes = '{}' AND base_notes = '{}';
