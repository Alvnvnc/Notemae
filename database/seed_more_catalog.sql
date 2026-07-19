-- Additional demo catalog seed for ScentSphere.
-- This file is idempotent and can be run against an existing local database.
-- Data is curated demo metadata for recommendation testing; replace with licensed/verified feeds before production.

INSERT INTO fragrances (
    slug, brand, name, description, gender, notes, occasions, climates,
    price_idr, rating, longevity_score, projection_score, source_url, source_type
) VALUES
    (
        'acqua-di-gio-profondo', 'Giorgio Armani', 'Acqua di Gio Profondo',
        'A marine aromatic fragrance with citrus freshness and a clean mineral drydown.', 'men',
        ARRAY['marine', 'bergamot', 'rosemary', 'musk'], ARRAY['office', 'casual', 'gym'], ARRAY['tropical', 'hot', 'warm'],
        1750000, 4.4, 3.8, 3.4,
        'https://example.com/datasets/scent-demo', 'public_dataset'
    ),
    (
        'ysl-y-edp', 'Yves Saint Laurent', 'Y Eau de Parfum',
        'A modern aromatic woody fragrance built around apple, sage, and amber woods.', 'men',
        ARRAY['apple', 'sage', 'bergamot', 'amber'], ARRAY['office', 'date', 'party'], ARRAY['warm', 'mild'],
        1900000, 4.4, 4.2, 3.8,
        'https://example.com/datasets/scent-demo', 'public_dataset'
    ),
    (
        'terre-dhermes-edt', 'Hermes', 'Terre d''Hermes Eau de Toilette',
        'An earthy citrus vetiver fragrance with a mature formal profile.', 'men',
        ARRAY['orange', 'grapefruit', 'vetiver', 'pepper'], ARRAY['office', 'formal', 'interview'], ARRAY['warm', 'mild'],
        1700000, 4.5, 4.0, 3.2,
        'https://example.com/datasets/scent-demo', 'public_dataset'
    ),
    (
        'dior-homme-intense', 'Dior', 'Dior Homme Intense',
        'A powdery iris amber fragrance with a dressy evening character.', 'men',
        ARRAY['iris', 'amber', 'cedar', 'musk'], ARRAY['date', 'formal', 'wedding'], ARRAY['mild', 'cool'],
        2250000, 4.6, 4.4, 3.6,
        'https://example.com/datasets/scent-demo', 'public_dataset'
    ),
    (
        'versace-dylan-blue', 'Versace', 'Dylan Blue',
        'A versatile blue aromatic fragrance with citrus, ambroxan, and incense.', 'men',
        ARRAY['bergamot', 'grapefruit', 'ambroxan', 'incense'], ARRAY['office', 'casual', 'date'], ARRAY['tropical', 'warm'],
        1150000, 4.2, 3.7, 3.5,
        'https://example.com/datasets/scent-demo', 'public_dataset'
    ),
    (
        'montblanc-explorer', 'Montblanc', 'Explorer',
        'A bright woody fragrance with bergamot, vetiver, and patchouli for everyday wear.', 'men',
        ARRAY['bergamot', 'vetiver', 'patchouli', 'ambroxan'], ARRAY['office', 'casual', 'interview'], ARRAY['tropical', 'warm'],
        950000, 4.1, 3.7, 3.2,
        'https://example.com/datasets/scent-demo', 'public_dataset'
    ),
    (
        'narciso-rodriguez-bleu-noir-edp', 'Narciso Rodriguez', 'Bleu Noir Eau de Parfum',
        'A clean musky woody fragrance with cedar and vetiver.', 'men',
        ARRAY['musk', 'cedar', 'vetiver', 'amber'], ARRAY['office', 'formal', 'date'], ARRAY['warm', 'mild'],
        1550000, 4.3, 4.0, 3.1,
        'https://example.com/datasets/scent-demo', 'public_dataset'
    ),
    (
        'issey-miyake-leau-dissey-pour-homme', 'Issey Miyake', 'L''Eau d''Issey Pour Homme',
        'A sharp yuzu citrus aromatic fragrance with light woods.', 'men',
        ARRAY['yuzu', 'lemon', 'cypress', 'cedar'], ARRAY['office', 'gym', 'casual'], ARRAY['tropical', 'hot'],
        1050000, 4.1, 3.5, 3.1,
        'https://example.com/datasets/scent-demo', 'public_dataset'
    ),
    (
        'clinique-happy-for-men', 'Clinique', 'Happy for Men',
        'A cheerful citrus aromatic fragrance with a simple clean profile.', 'men',
        ARRAY['orange', 'lime', 'lemon', 'musk'], ARRAY['gym', 'casual', 'office'], ARRAY['tropical', 'hot'],
        850000, 4.0, 2.8, 2.5,
        'https://example.com/datasets/scent-demo', 'public_dataset'
    ),
    (
        'ck-one', 'Calvin Klein', 'CK One',
        'A light unisex citrus tea fragrance suited to casual hot-weather use.', 'unisex',
        ARRAY['bergamot', 'green leaves', 'tea', 'musk'], ARRAY['casual', 'gym', 'office'], ARRAY['tropical', 'hot'],
        650000, 4.0, 2.8, 2.4,
        'https://example.com/datasets/scent-demo', 'public_dataset'
    ),
    (
        'elizabeth-arden-green-tea', 'Elizabeth Arden', 'Green Tea',
        'A refreshing green tea citrus fragrance with a relaxed daytime profile.', 'women',
        ARRAY['tea', 'lemon', 'mint', 'musk'], ARRAY['casual', 'gym', 'office'], ARRAY['tropical', 'hot'],
        450000, 4.0, 2.5, 2.1,
        'https://example.com/datasets/scent-demo', 'public_dataset'
    ),
    (
        'dolce-gabbana-light-blue-women', 'Dolce&Gabbana', 'Light Blue',
        'A crisp fruity citrus fragrance with apple, lemon, and cedar.', 'women',
        ARRAY['lemon', 'apple', 'cedar', 'musk'], ARRAY['casual', 'office', 'gym'], ARRAY['tropical', 'hot'],
        1250000, 4.2, 3.1, 2.8,
        'https://example.com/datasets/scent-demo', 'public_dataset'
    ),
    (
        'chanel-coco-mademoiselle-edp', 'Chanel', 'Coco Mademoiselle Eau de Parfum',
        'A polished citrus patchouli floral fragrance with an elegant signature.', 'women',
        ARRAY['orange', 'rose', 'jasmine', 'patchouli'], ARRAY['office', 'date', 'formal'], ARRAY['warm', 'mild'],
        2650000, 4.6, 4.4, 3.7,
        'https://example.com/datasets/scent-demo', 'public_dataset'
    ),
    (
        'dior-jadore-edp', 'Dior', 'J''adore Eau de Parfum',
        'A luminous white floral fragrance with jasmine, ylang ylang, and soft fruit.', 'women',
        ARRAY['jasmine', 'ylang ylang', 'pear', 'musk'], ARRAY['formal', 'wedding', 'date'], ARRAY['warm', 'mild'],
        2400000, 4.4, 4.0, 3.4,
        'https://example.com/datasets/scent-demo', 'public_dataset'
    ),
    (
        'gucci-bloom-edp', 'Gucci', 'Bloom Eau de Parfum',
        'A creamy white floral fragrance centered on jasmine and tuberose.', 'women',
        ARRAY['jasmine', 'tuberose', 'orange blossom', 'musk'], ARRAY['date', 'wedding', 'formal'], ARRAY['warm', 'mild'],
        1950000, 4.2, 3.8, 3.4,
        'https://example.com/datasets/scent-demo', 'public_dataset'
    ),
    (
        'ysl-libre-edp', 'Yves Saint Laurent', 'Libre Eau de Parfum',
        'A lavender orange blossom fragrance with warm vanilla and amber.', 'women',
        ARRAY['lavender', 'orange blossom', 'vanilla', 'amber'], ARRAY['date', 'party', 'formal'], ARRAY['warm', 'mild'],
        2150000, 4.5, 4.3, 3.9,
        'https://example.com/datasets/scent-demo', 'public_dataset'
    ),
    (
        'lancome-la-vie-est-belle', 'Lancome', 'La Vie Est Belle',
        'A sweet iris gourmand fragrance with praline, vanilla, and patchouli.', 'women',
        ARRAY['iris', 'praline', 'vanilla', 'patchouli'], ARRAY['date', 'party', 'wedding'], ARRAY['mild', 'cool'],
        2100000, 4.3, 4.5, 4.0,
        'https://example.com/datasets/scent-demo', 'public_dataset'
    ),
    (
        'narciso-rodriguez-for-her-edp', 'Narciso Rodriguez', 'For Her Eau de Parfum',
        'A soft musky rose fragrance with patchouli and a clean elegant trail.', 'women',
        ARRAY['musk', 'rose', 'patchouli', 'amber'], ARRAY['office', 'date', 'formal'], ARRAY['warm', 'mild'],
        1650000, 4.4, 4.1, 3.3,
        'https://example.com/datasets/scent-demo', 'public_dataset'
    ),
    (
        'marc-jacobs-daisy-edt', 'Marc Jacobs', 'Daisy Eau de Toilette',
        'A light fruity floral fragrance with violet, jasmine, and soft musk.', 'women',
        ARRAY['violet', 'jasmine', 'strawberry', 'musk'], ARRAY['casual', 'office', 'date'], ARRAY['tropical', 'warm'],
        1350000, 4.0, 3.0, 2.6,
        'https://example.com/datasets/scent-demo', 'public_dataset'
    ),
    (
        'burberry-her-edp', 'Burberry', 'Her Eau de Parfum',
        'A bright berry musk fragrance with a sweet playful character.', 'women',
        ARRAY['strawberry', 'raspberry', 'jasmine', 'musk'], ARRAY['casual', 'date', 'party'], ARRAY['warm', 'mild'],
        1850000, 4.2, 3.8, 3.4,
        'https://example.com/datasets/scent-demo', 'public_dataset'
    ),
    (
        'zara-red-vanilla', 'Zara', 'Red Vanilla',
        'An affordable fruity vanilla fragrance with blackcurrant and patchouli.', 'women',
        ARRAY['blackcurrant', 'vanilla', 'patchouli', 'iris'], ARRAY['casual', 'date', 'party'], ARRAY['warm', 'mild'],
        450000, 3.9, 3.2, 2.8,
        'https://example.com/datasets/scent-demo', 'public_dataset'
    ),
    (
        'zara-vibrant-leather', 'Zara', 'Vibrant Leather',
        'An affordable citrus leather fragrance with a clean woody finish.', 'men',
        ARRAY['bergamot', 'leather', 'bamboo', 'patchouli'], ARRAY['casual', 'office', 'date'], ARRAY['warm', 'mild'],
        550000, 3.9, 3.2, 2.9,
        'https://example.com/datasets/scent-demo', 'public_dataset'
    ),
    (
        'lattafa-khamrah', 'Lattafa', 'Khamrah',
        'A warm sweet spicy fragrance with cinnamon, vanilla, and amber richness.', 'unisex',
        ARRAY['cinnamon', 'vanilla', 'tonka', 'amber'], ARRAY['date', 'party', 'wedding'], ARRAY['mild', 'cool'],
        650000, 4.3, 4.5, 4.0,
        'https://example.com/datasets/scent-demo', 'public_dataset'
    ),
    (
        'armaf-club-de-nuit-intense-man', 'Armaf', 'Club de Nuit Intense Man',
        'A bold smoky citrus woody fragrance for strong projection and evening wear.', 'men',
        ARRAY['lemon', 'birch', 'musk', 'amber'], ARRAY['date', 'party', 'formal'], ARRAY['warm', 'mild'],
        750000, 4.2, 4.2, 4.1,
        'https://example.com/datasets/scent-demo', 'public_dataset'
    ),
    (
        'maison-margiela-by-the-fireplace', 'Maison Margiela', 'By the Fireplace',
        'A smoky sweet woody fragrance with vanilla amber warmth.', 'unisex',
        ARRAY['incense', 'vanilla', 'guaiac wood', 'amber'], ARRAY['date', 'party', 'casual'], ARRAY['cool', 'mild'],
        2100000, 4.4, 4.2, 3.6,
        'https://example.com/datasets/scent-demo', 'public_dataset'
    ),
    (
        'maison-margiela-lazy-sunday-morning', 'Maison Margiela', 'Lazy Sunday Morning',
        'A clean musky floral fragrance with a soft fresh-laundry feel.', 'unisex',
        ARRAY['musk', 'lily of the valley', 'iris', 'rose'], ARRAY['office', 'casual', 'interview'], ARRAY['tropical', 'warm', 'mild'],
        1950000, 4.1, 3.2, 2.5,
        'https://example.com/datasets/scent-demo', 'public_dataset'
    ),
    (
        'jo-malone-wood-sage-sea-salt', 'Jo Malone London', 'Wood Sage & Sea Salt',
        'A breezy salty woody fragrance with a minimalist casual profile.', 'unisex',
        ARRAY['salt', 'sage', 'grapefruit', 'musk'], ARRAY['casual', 'office', 'gym'], ARRAY['tropical', 'hot', 'warm'],
        1950000, 4.1, 2.8, 2.4,
        'https://example.com/datasets/scent-demo', 'public_dataset'
    ),
    (
        'jo-malone-english-pear-freesia', 'Jo Malone London', 'English Pear & Freesia',
        'A fresh fruity floral fragrance with pear, freesia, and soft patchouli.', 'women',
        ARRAY['pear', 'freesia', 'patchouli', 'musk'], ARRAY['office', 'casual', 'date'], ARRAY['tropical', 'warm'],
        1900000, 4.2, 3.0, 2.6,
        'https://example.com/datasets/scent-demo', 'public_dataset'
    ),
    (
        'byredo-bal-dafrique', 'Byredo', 'Bal d''Afrique',
        'A bright citrus woody fragrance with vetiver, musk, and a refined clean feel.', 'unisex',
        ARRAY['bergamot', 'lemon', 'vetiver', 'musk'], ARRAY['office', 'date', 'formal'], ARRAY['tropical', 'warm'],
        3300000, 4.4, 3.6, 3.0,
        'https://example.com/datasets/scent-demo', 'public_dataset'
    ),
    (
        'diptyque-philosykos-edt', 'Diptyque', 'Philosykos Eau de Toilette',
        'A green fig woody fragrance with coconut nuance and a natural airy profile.', 'unisex',
        ARRAY['fig', 'green leaves', 'coconut', 'cedar'], ARRAY['casual', 'office', 'gym'], ARRAY['tropical', 'hot', 'warm'],
        2600000, 4.3, 3.1, 2.7,
        'https://example.com/datasets/scent-demo', 'public_dataset'
    ),
    (
        'tom-ford-neroli-portofino', 'Tom Ford', 'Neroli Portofino',
        'A sparkling citrus neroli fragrance with a clean Mediterranean profile.', 'unisex',
        ARRAY['neroli', 'bergamot', 'orange blossom', 'amber'], ARRAY['casual', 'office', 'gym'], ARRAY['tropical', 'hot'],
        3900000, 4.1, 3.0, 2.8,
        'https://example.com/datasets/scent-demo', 'public_dataset'
    ),
    (
        'tom-ford-ombre-leather', 'Tom Ford', 'Ombre Leather',
        'A smooth leather fragrance with jasmine, amber, and a dark polished feel.', 'unisex',
        ARRAY['leather', 'jasmine', 'amber', 'musk'], ARRAY['date', 'party', 'formal'], ARRAY['mild', 'cool'],
        2800000, 4.5, 4.4, 3.8,
        'https://example.com/datasets/scent-demo', 'public_dataset'
    ),
    (
        'tom-ford-tobacco-vanille', 'Tom Ford', 'Tobacco Vanille',
        'A rich tobacco vanilla fragrance with spice and gourmand warmth.', 'unisex',
        ARRAY['tobacco', 'vanilla', 'cinnamon', 'tonka'], ARRAY['date', 'party', 'wedding'], ARRAY['cool', 'mild'],
        4200000, 4.6, 4.7, 4.1,
        'https://example.com/datasets/scent-demo', 'public_dataset'
    ),
    (
        'le-labo-santal-33', 'Le Labo', 'Santal 33',
        'A dry sandalwood leather fragrance with cardamom and a distinctive unisex trail.', 'unisex',
        ARRAY['sandalwood', 'cardamom', 'leather', 'iris'], ARRAY['office', 'date', 'formal'], ARRAY['warm', 'mild'],
        4300000, 4.2, 4.0, 3.4,
        'https://example.com/datasets/scent-demo', 'public_dataset'
    ),
    (
        'le-labo-another-13', 'Le Labo', 'Another 13',
        'A minimalist musky amber fragrance with a clean skin-scent profile.', 'unisex',
        ARRAY['musk', 'ambroxan', 'pear', 'amber'], ARRAY['office', 'casual', 'date'], ARRAY['tropical', 'warm', 'mild'],
        4300000, 4.3, 3.8, 2.9,
        'https://example.com/datasets/scent-demo', 'public_dataset'
    ),
    (
        'mancera-cedrat-boise', 'Mancera', 'Cedrat Boise',
        'A fruity citrus woody fragrance with leather and vanilla facets.', 'unisex',
        ARRAY['lemon', 'blackcurrant', 'cedar', 'leather'], ARRAY['office', 'date', 'party'], ARRAY['warm', 'mild'],
        1750000, 4.3, 4.2, 3.8,
        'https://example.com/datasets/scent-demo', 'public_dataset'
    ),
    (
        'mancera-instant-crush', 'Mancera', 'Instant Crush',
        'A sweet amber saffron fragrance with rose, vanilla, and strong projection.', 'unisex',
        ARRAY['saffron', 'rose', 'vanilla', 'amber'], ARRAY['date', 'party', 'wedding'], ARRAY['mild', 'cool'],
        1850000, 4.2, 4.5, 4.2,
        'https://example.com/datasets/scent-demo', 'public_dataset'
    ),
    (
        'parfums-de-marly-layton', 'Parfums de Marly', 'Layton',
        'A polished apple vanilla spicy fragrance with lavender and woody amber depth.', 'unisex',
        ARRAY['apple', 'lavender', 'vanilla', 'cardamom'], ARRAY['date', 'party', 'formal'], ARRAY['mild', 'cool'],
        4200000, 4.6, 4.6, 4.0,
        'https://example.com/datasets/scent-demo', 'public_dataset'
    ),
    (
        'creed-aventus', 'Creed', 'Aventus',
        'A fruity woody fragrance with pineapple, birch, and musk.', 'men',
        ARRAY['pineapple', 'birch', 'musk', 'oakmoss'], ARRAY['office', 'formal', 'date'], ARRAY['warm', 'mild'],
        5200000, 4.5, 4.2, 3.8,
        'https://example.com/datasets/scent-demo', 'public_dataset'
    ),
    (
        'kilian-angels-share', 'Kilian', 'Angels'' Share',
        'A cinnamon vanilla gourmand fragrance with warm amber sweetness.', 'unisex',
        ARRAY['cinnamon', 'tonka', 'vanilla', 'oakmoss'], ARRAY['date', 'party', 'wedding'], ARRAY['cool', 'mild'],
        3900000, 4.5, 4.4, 3.8,
        'https://example.com/datasets/scent-demo', 'public_dataset'
    ),
    (
        'chloe-edp', 'Chloe', 'Chloe Eau de Parfum',
        'A clean rose peony fragrance with a soft musky polished finish.', 'women',
        ARRAY['rose', 'peony', 'lily of the valley', 'musk'], ARRAY['office', 'date', 'wedding'], ARRAY['warm', 'mild'],
        1550000, 4.2, 3.7, 3.0,
        'https://example.com/datasets/scent-demo', 'public_dataset'
    ),
    (
        'hermes-un-jardin-sur-le-nil', 'Hermes', 'Un Jardin Sur Le Nil',
        'A green citrus fruity fragrance with mango, grapefruit, and lotus.', 'unisex',
        ARRAY['mango', 'grapefruit', 'lotus', 'green leaves'], ARRAY['casual', 'office', 'gym'], ARRAY['tropical', 'hot'],
        1650000, 4.3, 3.3, 2.8,
        'https://example.com/datasets/scent-demo', 'public_dataset'
    ),
    (
        'bvlgari-aqva-pour-homme', 'Bvlgari', 'Aqva Pour Homme',
        'An aquatic aromatic fragrance with marine notes, citrus, and cedar.', 'men',
        ARRAY['marine', 'orange', 'lavender', 'cedar'], ARRAY['casual', 'gym', 'office'], ARRAY['tropical', 'hot'],
        1150000, 4.0, 3.4, 3.0,
        'https://example.com/datasets/scent-demo', 'public_dataset'
    ),
    (
        'davidoff-cool-water', 'Davidoff', 'Cool Water',
        'A classic fresh aquatic aromatic fragrance for easy everyday use.', 'men',
        ARRAY['marine', 'mint', 'lavender', 'musk'], ARRAY['gym', 'casual', 'office'], ARRAY['tropical', 'hot'],
        550000, 4.0, 3.2, 2.9,
        'https://example.com/datasets/scent-demo', 'public_dataset'
    ),
    (
        'moschino-toy-2', 'Moschino', 'Toy 2',
        'A playful fresh floral musk fragrance with apple and magnolia.', 'women',
        ARRAY['apple', 'magnolia', 'peony', 'musk'], ARRAY['casual', 'office', 'date'], ARRAY['tropical', 'warm'],
        950000, 4.0, 3.0, 2.6,
        'https://example.com/datasets/scent-demo', 'public_dataset'
    )
ON CONFLICT (slug) DO UPDATE SET
    brand = EXCLUDED.brand,
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    gender = EXCLUDED.gender,
    notes = EXCLUDED.notes,
    occasions = EXCLUDED.occasions,
    climates = EXCLUDED.climates,
    price_idr = EXCLUDED.price_idr,
    rating = EXCLUDED.rating,
    longevity_score = EXCLUDED.longevity_score,
    projection_score = EXCLUDED.projection_score,
    source_url = EXCLUDED.source_url,
    source_type = EXCLUDED.source_type,
    updated_at = now();
