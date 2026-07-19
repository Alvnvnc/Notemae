-- Community-consensus dupe/flanker pairs. Pairs whose slugs are not yet in the
-- catalog are skipped by the JOINs; re-run this file after ingesting
-- scraping/sources/curated-catalog-v1.json so every pair resolves.
INSERT INTO fragrance_relationships (fragrance_id, related_id, relation, confidence, source)
SELECT f.id, r.id, v.relation, v.confidence, v.source
FROM (
    VALUES
        ('armaf-club-de-nuit-intense-man', 'creed-aventus', 'clone_of', 0.90::real, 'community-consensus-v1'),
        ('afnan-supremacy-not-only-intense', 'creed-aventus', 'clone_of', 0.80::real, 'community-consensus-v1'),
        ('mancera-cedrat-boise', 'creed-aventus', 'inspired_by', 0.50::real, 'community-consensus-v1'),
        ('lattafa-khamrah', 'kilian-angels-share', 'inspired_by', 0.85::real, 'community-consensus-v1'),
        ('lattafa-asad', 'dior-sauvage-elixir', 'clone_of', 0.85::real, 'community-consensus-v1'),
        ('afnan-9pm', 'jean-paul-gaultier-ultra-male', 'clone_of', 0.85::real, 'community-consensus-v1'),
        ('lattafa-ana-abiyedh-rouge', 'maison-francis-kurkdjian-baccarat-rouge-540', 'clone_of', 0.85::real, 'community-consensus-v1'),
        ('ariana-grande-cloud', 'maison-francis-kurkdjian-baccarat-rouge-540', 'inspired_by', 0.70::real, 'community-consensus-v1'),
        ('zara-vibrant-leather', 'louis-vuitton-l-immensite', 'inspired_by', 0.75::real, 'community-consensus-v1'),
        ('dior-sauvage-elixir', 'dior-sauvage-edt', 'flanker_of', 1.00::real, 'community-consensus-v1'),
        ('lattafa-khamrah-qahwa', 'lattafa-khamrah', 'flanker_of', 1.00::real, 'community-consensus-v1')
) AS v(fragrance_slug, related_slug, relation, confidence, source)
JOIN fragrances f ON f.slug = v.fragrance_slug
JOIN fragrances r ON r.slug = v.related_slug
ON CONFLICT (fragrance_id, related_id) DO UPDATE SET
    relation = EXCLUDED.relation,
    confidence = EXCLUDED.confidence,
    source = EXCLUDED.source;
