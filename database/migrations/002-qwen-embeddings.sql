-- Apply only to a database created before Qwen text-embedding-v4 was configured.
-- Existing embeddings are discarded because vector dimensions cannot be converted.
UPDATE fragrances SET document_embedding = NULL;
ALTER TABLE fragrances
    ALTER COLUMN document_embedding TYPE VECTOR(1024)
    USING NULL;
