"""Note taxonomy for taste matching.

Canonicalizes scraped or user-written note names (including Indonesian terms)
and describes every canonical note along three axes, so scoring can award
graded partial credit instead of relying on exact string matches:

* families   -- the scent family or families the note belongs to
* traits     -- the character words it contributes (sweet, warm, fresh, ...)
* neighbours -- notes that read as close substitutes for it
* volatility -- which pyramid tier the raw material naturally lands in

Unknown spellings fall back to fuzzy correction, which is what turns a typed
"bergamont" into ``bergamot`` before any scoring happens.
"""

import difflib
import re
import unicodedata


# canonical note -> scent families it belongs to
NOTE_FAMILIES: dict[str, tuple[str, ...]] = {
    # citrus
    "bergamot": ("citrus",),
    "lemon": ("citrus",),
    "orange": ("citrus",),
    "mandarin": ("citrus",),
    "lime": ("citrus",),
    "grapefruit": ("citrus",),
    "yuzu": ("citrus",),
    "petitgrain": ("citrus", "green"),
    "lemongrass": ("citrus", "green"),
    "neroli": ("citrus", "floral", "white floral"),
    "citrus": ("citrus",),
    # floral
    "rose": ("floral",),
    "jasmine": ("floral", "white floral"),
    "iris": ("floral", "powdery"),
    "violet": ("floral", "powdery"),
    "peony": ("floral",),
    "lily": ("floral", "white floral"),
    "lily of the valley": ("floral",),
    "magnolia": ("floral", "white floral"),
    "geranium": ("floral", "aromatic"),
    "ylang ylang": ("floral", "white floral"),
    "tuberose": ("floral", "white floral"),
    "orange blossom": ("floral", "white floral"),
    "freesia": ("floral",),
    "frangipani": ("floral", "white floral"),
    "gardenia": ("floral", "white floral"),
    "heliotrope": ("floral", "powdery"),
    "osmanthus": ("floral", "fruity"),
    "lotus": ("floral", "aquatic"),
    "floral": ("floral",),
    # woody
    "cedar": ("woody",),
    "sandalwood": ("woody",),
    "vetiver": ("woody", "green"),
    "oud": ("woody", "amber"),
    "patchouli": ("woody", "amber"),
    "guaiac wood": ("woody",),
    "teak": ("woody",),
    "cypress": ("woody", "green"),
    "pine": ("woody", "green"),
    "oakmoss": ("woody", "green"),
    "birch": ("woody", "leather"),
    "woody": ("woody",),
    # amber / resinous
    "amber": ("amber",),
    "ambroxan": ("amber", "musky"),
    "labdanum": ("amber",),
    "benzoin": ("amber", "gourmand"),
    "incense": ("amber",),
    "myrrh": ("amber",),
    "opoponax": ("amber",),
    "styrax": ("amber",),
    "resin": ("amber",),
    # gourmand
    "vanilla": ("gourmand", "amber"),
    "tonka": ("gourmand", "amber"),
    "caramel": ("gourmand",),
    "chocolate": ("gourmand",),
    "coffee": ("gourmand",),
    "praline": ("gourmand",),
    "honey": ("gourmand",),
    "sugar": ("gourmand",),
    "almond": ("gourmand",),
    "hazelnut": ("gourmand",),
    "milk": ("gourmand",),
    "sweet": ("gourmand",),
    # spicy
    "pepper": ("spicy",),
    "cardamom": ("spicy",),
    "cinnamon": ("spicy", "gourmand"),
    "clove": ("spicy",),
    "nutmeg": ("spicy",),
    "ginger": ("spicy",),
    "saffron": ("spicy", "amber"),
    "star anise": ("spicy",),
    # aromatic
    "lavender": ("aromatic",),
    "mint": ("aromatic", "green"),
    "rosemary": ("aromatic", "green"),
    "sage": ("aromatic",),
    "basil": ("aromatic", "green"),
    "thyme": ("aromatic",),
    "artemisia": ("aromatic",),
    "aromatic": ("aromatic",),
    # aquatic
    "marine": ("aquatic",),
    "salt": ("aquatic",),
    "rain": ("aquatic",),
    "aquatic": ("aquatic",),
    # green
    "grass": ("green",),
    "green leaves": ("green",),
    "tea": ("green",),
    "bamboo": ("green",),
    "fig": ("green", "fruity"),
    "galbanum": ("green",),
    "green": ("green",),
    # fruity
    "apple": ("fruity",),
    "pear": ("fruity",),
    "peach": ("fruity",),
    "apricot": ("fruity",),
    "plum": ("fruity",),
    "blackcurrant": ("fruity",),
    "pineapple": ("fruity",),
    "mango": ("fruity",),
    "coconut": ("fruity", "gourmand"),
    "cherry": ("fruity", "gourmand"),
    "strawberry": ("fruity",),
    "raspberry": ("fruity",),
    "lychee": ("fruity",),
    "melon": ("fruity", "aquatic"),
    "fruity": ("fruity",),
    # musky / animalic
    "musk": ("musky",),
    "ambrette": ("musky",),
    # leather
    "leather": ("leather",),
    "suede": ("leather",),
    "tobacco": ("leather", "amber"),
}

# canonical note -> character words it contributes to a profile.
# The first trait is the dominant one; profile summaries lead with it.
NOTE_TRAITS: dict[str, tuple[str, ...]] = {
    # citrus
    "bergamot": ("fresh", "citrusy", "bright"),
    "lemon": ("fresh", "citrusy", "sharp"),
    "orange": ("fresh", "citrusy", "juicy"),
    "mandarin": ("fresh", "citrusy", "soft"),
    "lime": ("fresh", "citrusy", "sharp"),
    "grapefruit": ("fresh", "citrusy", "tart"),
    "yuzu": ("fresh", "citrusy", "bright"),
    "petitgrain": ("fresh", "green", "bitter"),
    "lemongrass": ("fresh", "green", "sharp"),
    "neroli": ("fresh", "floral", "clean"),
    "citrus": ("fresh", "citrusy"),
    # floral
    "rose": ("floral", "romantic", "elegant"),
    "jasmine": ("floral", "elegant", "sensual"),
    "iris": ("powdery", "elegant", "cool"),
    "violet": ("powdery", "floral", "soft"),
    "peony": ("floral", "soft", "fresh"),
    "lily": ("floral", "clean", "elegant"),
    "lily of the valley": ("floral", "clean", "fresh"),
    "magnolia": ("floral", "creamy", "fresh"),
    "geranium": ("floral", "green", "sharp"),
    "ylang ylang": ("floral", "sensual", "creamy"),
    "tuberose": ("floral", "sensual", "rich"),
    "orange blossom": ("floral", "clean", "sweet"),
    "freesia": ("floral", "fresh", "soft"),
    "frangipani": ("floral", "tropical", "creamy"),
    "gardenia": ("floral", "creamy", "sensual"),
    "heliotrope": ("powdery", "sweet", "soft"),
    "osmanthus": ("floral", "fruity", "soft"),
    "lotus": ("floral", "aquatic", "clean"),
    "floral": ("floral",),
    # woody
    "cedar": ("woody", "dry", "clean"),
    "sandalwood": ("woody", "creamy", "warm"),
    "vetiver": ("woody", "earthy", "dry"),
    "oud": ("woody", "rich", "smoky"),
    "patchouli": ("woody", "earthy", "dark"),
    "guaiac wood": ("woody", "smoky", "dry"),
    "teak": ("woody", "dry"),
    "cypress": ("woody", "green", "dry"),
    "pine": ("green", "woody", "cool"),
    "oakmoss": ("earthy", "green", "dry"),
    "birch": ("smoky", "woody", "dry"),
    "woody": ("woody",),
    # amber / resinous
    "amber": ("warm", "sweet", "rich"),
    "ambroxan": ("warm", "clean", "mineral"),
    "labdanum": ("warm", "rich", "dark"),
    "benzoin": ("sweet", "warm", "creamy"),
    "incense": ("smoky", "dry", "spiritual"),
    "myrrh": ("smoky", "warm", "bitter"),
    "opoponax": ("warm", "sweet", "smoky"),
    "styrax": ("warm", "smoky", "rich"),
    "resin": ("warm", "rich"),
    # gourmand
    "vanilla": ("sweet", "warm", "creamy"),
    "tonka": ("sweet", "warm", "creamy"),
    "caramel": ("sweet", "warm", "rich"),
    "chocolate": ("sweet", "rich", "warm"),
    "coffee": ("bitter", "rich", "warm"),
    "praline": ("sweet", "creamy", "warm"),
    "honey": ("sweet", "warm", "animalic"),
    "sugar": ("sweet",),
    "almond": ("sweet", "creamy", "soft"),
    "hazelnut": ("sweet", "creamy", "warm"),
    "milk": ("creamy", "soft", "sweet"),
    "sweet": ("sweet",),
    # spicy
    "pepper": ("spicy", "sharp", "dry"),
    "cardamom": ("spicy", "fresh", "warm"),
    "cinnamon": ("spicy", "warm", "sweet"),
    "clove": ("spicy", "warm", "sharp"),
    "nutmeg": ("spicy", "warm", "soft"),
    "ginger": ("spicy", "fresh", "sharp"),
    "saffron": ("spicy", "rich", "leathery"),
    "star anise": ("spicy", "sweet", "cool"),
    # aromatic
    "lavender": ("herbal", "clean", "cool"),
    "mint": ("cool", "fresh", "sharp"),
    "rosemary": ("herbal", "green", "sharp"),
    "sage": ("herbal", "dry", "cool"),
    "basil": ("herbal", "green", "fresh"),
    "thyme": ("herbal", "dry", "sharp"),
    "artemisia": ("herbal", "bitter", "cool"),
    "aromatic": ("herbal",),
    # aquatic
    "marine": ("aquatic", "fresh", "airy"),
    "salt": ("mineral", "aquatic", "dry"),
    "rain": ("aquatic", "clean", "airy"),
    "aquatic": ("aquatic", "fresh"),
    # green
    "grass": ("green", "fresh"),
    "green leaves": ("green", "fresh"),
    "tea": ("green", "clean", "soft"),
    "bamboo": ("green", "clean", "airy"),
    "fig": ("green", "creamy", "fruity"),
    "galbanum": ("green", "bitter", "sharp"),
    "green": ("green",),
    # fruity
    "apple": ("fruity", "fresh", "juicy"),
    "pear": ("fruity", "fresh", "soft"),
    "peach": ("fruity", "sweet", "soft"),
    "apricot": ("fruity", "sweet", "soft"),
    "plum": ("fruity", "sweet", "rich"),
    "blackcurrant": ("fruity", "tart", "sharp"),
    "pineapple": ("fruity", "tropical", "juicy"),
    "mango": ("fruity", "tropical", "sweet"),
    "coconut": ("creamy", "tropical", "sweet"),
    "cherry": ("fruity", "sweet", "rich"),
    "strawberry": ("fruity", "sweet", "juicy"),
    "raspberry": ("fruity", "tart", "sweet"),
    "lychee": ("fruity", "sweet", "soft"),
    "melon": ("fruity", "juicy", "fresh"),
    "fruity": ("fruity", "sweet"),
    # musky / animalic
    "musk": ("clean", "soft", "sensual"),
    "ambrette": ("musky", "soft", "powdery"),
    # leather
    "leather": ("leathery", "dry", "sensual"),
    "suede": ("leathery", "soft", "powdery"),
    "tobacco": ("warm", "dry", "rich"),
}

# canonical note -> the pyramid tier the raw material naturally occupies.
#
# This is a property of the material, not of any one perfume: bergamot is
# volatile enough that it is gone within the hour no matter who blends it,
# while oud is still there the next morning. A perfumer can overdose a
# material to push it later than usual, so a catalog record that states its
# own tiers always wins; this table only fills the gap for the (many) legacy
# records that were ingested as a flat note list.
NOTE_VOLATILITY: dict[str, str] = {
    # top -- the opening, minutes to roughly an hour
    "apple": "top",
    "aquatic": "top",
    "aromatic": "top",
    "artemisia": "top",
    "bamboo": "top",
    "basil": "top",
    "bergamot": "top",
    "blackcurrant": "top",
    "cardamom": "top",
    "citrus": "top",
    "fruity": "top",
    "galbanum": "top",
    "ginger": "top",
    "grapefruit": "top",
    "grass": "top",
    "green": "top",
    "green leaves": "top",
    "lavender": "top",
    "lemon": "top",
    "lemongrass": "top",
    "lime": "top",
    "lychee": "top",
    "mandarin": "top",
    "mango": "top",
    "marine": "top",
    "melon": "top",
    "mint": "top",
    "neroli": "top",
    "orange": "top",
    "pear": "top",
    "pepper": "top",
    "petitgrain": "top",
    "pineapple": "top",
    "rain": "top",
    "raspberry": "top",
    "rosemary": "top",
    "sage": "top",
    "salt": "top",
    "star anise": "top",
    "strawberry": "top",
    "tea": "top",
    "thyme": "top",
    "yuzu": "top",
    # heart -- the body of the scent, roughly one to four hours
    "apricot": "heart",
    "cherry": "heart",
    "cinnamon": "heart",
    "clove": "heart",
    "coconut": "heart",
    "cypress": "heart",
    "fig": "heart",
    "floral": "heart",
    "frangipani": "heart",
    "freesia": "heart",
    "gardenia": "heart",
    "geranium": "heart",
    "heliotrope": "heart",
    "iris": "heart",
    "jasmine": "heart",
    "lily": "heart",
    "lily of the valley": "heart",
    "lotus": "heart",
    "magnolia": "heart",
    "nutmeg": "heart",
    "orange blossom": "heart",
    "osmanthus": "heart",
    "peach": "heart",
    "peony": "heart",
    "pine": "heart",
    "plum": "heart",
    "rose": "heart",
    "saffron": "heart",
    "tuberose": "heart",
    "violet": "heart",
    "ylang ylang": "heart",
    # base -- the dry-down, still readable after four hours
    "almond": "base",
    "amber": "base",
    "ambrette": "base",
    "ambroxan": "base",
    "benzoin": "base",
    "birch": "base",
    "caramel": "base",
    "cedar": "base",
    "chocolate": "base",
    "coffee": "base",
    "guaiac wood": "base",
    "hazelnut": "base",
    "honey": "base",
    "incense": "base",
    "labdanum": "base",
    "leather": "base",
    "milk": "base",
    "musk": "base",
    "myrrh": "base",
    "oakmoss": "base",
    "opoponax": "base",
    "oud": "base",
    "patchouli": "base",
    "praline": "base",
    "resin": "base",
    "sandalwood": "base",
    "styrax": "base",
    "suede": "base",
    "sugar": "base",
    "sweet": "base",
    "teak": "base",
    "tobacco": "base",
    "tonka": "base",
    "vanilla": "base",
    "vetiver": "base",
    "woody": "base",
}

# Ordered most volatile first. Every consumer that iterates tiers uses this
# so "top, heart, base" reads the same way everywhere, including the order
# notes are flattened into the legacy ``notes`` column.
TIERS: tuple[str, ...] = ("top", "heart", "base")

# How a tier reads in an explanation. The wearer experiences a timeline, not
# a diagram, so the prose says "opening" rather than "top notes".
TIER_LABELS = {
    "top": "opening",
    "heart": "heart",
    "base": "dry-down",
}

# Curated substitutes: notes a wearer who asked for the key would usually
# accept in its place. Declared one-way for brevity and closed symmetrically
# at import time, so "tonka -> vanilla" also implies "vanilla -> tonka".
_NEIGHBOUR_SEED: dict[str, tuple[str, ...]] = {
    "bergamot": ("lemon", "mandarin", "neroli", "petitgrain"),
    "lemon": ("lime", "yuzu", "grapefruit", "lemongrass"),
    "orange": ("mandarin", "orange blossom", "lemon"),
    "mandarin": ("orange", "yuzu"),
    "lime": ("yuzu", "grapefruit"),
    "grapefruit": ("yuzu", "blackcurrant"),
    "neroli": ("orange blossom", "petitgrain", "magnolia"),
    "rose": ("peony", "geranium", "violet"),
    "jasmine": ("tuberose", "gardenia", "ylang ylang", "orange blossom"),
    "iris": ("violet", "suede", "heliotrope"),
    "violet": ("heliotrope", "iris"),
    "lily": ("lily of the valley", "magnolia", "freesia"),
    "tuberose": ("gardenia", "frangipani"),
    "osmanthus": ("apricot", "peach", "tea"),
    "cedar": ("cypress", "vetiver", "sandalwood"),
    "sandalwood": ("cedar", "milk", "benzoin"),
    "vetiver": ("oakmoss", "cypress", "patchouli"),
    "oud": ("patchouli", "labdanum", "incense"),
    "patchouli": ("oakmoss", "vetiver"),
    "guaiac wood": ("birch", "incense", "cedar"),
    "pine": ("cypress", "rosemary"),
    "amber": ("labdanum", "benzoin", "vanilla"),
    "ambroxan": ("musk", "amber", "salt"),
    "labdanum": ("styrax", "opoponax", "benzoin"),
    "benzoin": ("vanilla", "tonka", "styrax"),
    "incense": ("myrrh", "styrax", "guaiac wood"),
    "myrrh": ("opoponax", "styrax"),
    "vanilla": ("tonka", "benzoin", "caramel", "praline"),
    "tonka": ("almond", "praline", "caramel"),
    "caramel": ("praline", "honey", "sugar"),
    "chocolate": ("coffee", "praline", "hazelnut"),
    "coffee": ("chocolate", "tobacco"),
    "almond": ("hazelnut", "praline", "milk"),
    "milk": ("coconut", "sandalwood"),
    "pepper": ("cardamom", "ginger", "clove"),
    "cardamom": ("ginger", "nutmeg"),
    "cinnamon": ("clove", "nutmeg", "star anise"),
    "clove": ("nutmeg", "star anise"),
    "saffron": ("leather", "nutmeg"),
    "lavender": ("sage", "rosemary", "artemisia"),
    "mint": ("basil", "lemongrass"),
    "rosemary": ("thyme", "sage", "basil"),
    "marine": ("salt", "rain", "melon"),
    "salt": ("rain", "marine"),
    "tea": ("bamboo", "green leaves", "osmanthus"),
    "grass": ("green leaves", "galbanum"),
    "fig": ("coconut", "green leaves"),
    "apple": ("pear", "melon"),
    "peach": ("apricot", "plum", "osmanthus"),
    "plum": ("cherry", "raspberry"),
    "blackcurrant": ("raspberry", "grapefruit"),
    "pineapple": ("mango", "melon"),
    "mango": ("lychee", "pineapple"),
    "coconut": ("milk", "frangipani"),
    "cherry": ("almond", "plum"),
    "strawberry": ("raspberry", "cherry"),
    "lychee": ("peony", "raspberry"),
    "musk": ("ambrette", "ambroxan", "suede"),
    "leather": ("suede", "tobacco", "birch"),
    "suede": ("iris", "musk"),
    "tobacco": ("leather", "honey", "coffee"),
}

# raw or Indonesian spelling -> canonical note
NOTE_SYNONYMS: dict[str, str] = {
    "vanila": "vanilla",
    "vanili": "vanilla",
    "tonka bean": "tonka",
    "cocoa": "chocolate",
    "cacao": "chocolate",
    "cokelat": "chocolate",
    "coklat": "chocolate",
    "kopi": "coffee",
    "espresso": "coffee",
    "madu": "honey",
    "kelapa": "coconut",
    "mangga": "mango",
    "apel": "apple",
    "stroberi": "strawberry",
    "teh": "tea",
    "matcha": "tea",
    "oudh": "oud",
    "agarwood": "oud",
    "gaharu": "oud",
    "cendana": "sandalwood",
    "sandal wood": "sandalwood",
    "cedarwood": "cedar",
    "melati": "jasmine",
    "jasmin": "jasmine",
    "mawar": "rose",
    "nilam": "patchouli",
    "patchouly": "patchouli",
    "akar wangi": "vetiver",
    "vetyver": "vetiver",
    "kayu manis": "cinnamon",
    "cengkeh": "clove",
    "cengkih": "clove",
    "pala": "nutmeg",
    "jahe": "ginger",
    "lada": "pepper",
    "merica": "pepper",
    "jeruk": "orange",
    "jeruk nipis": "lime",
    "sitrun": "lemon",
    "citron": "lemon",
    "bergamota": "bergamot",
    "sereh": "lemongrass",
    "serai": "lemongrass",
    "kemenyan": "incense",
    "frankincense": "incense",
    "olibanum": "incense",
    "ambergris": "amber",
    "ambre": "amber",
    "ambar": "amber",
    "musc": "musk",
    "vetivert": "vetiver",
    "aprikot": "apricot",
    "ambroxide": "ambroxan",
    "cetalox": "ambroxan",
    "white musk": "musk",
    "kasturi": "musk",
    "kulit": "leather",
    "tembakau": "tobacco",
    "muguet": "lily of the valley",
    "orris": "iris",
    "orris root": "iris",
    "sea notes": "marine",
    "sea salt": "salt",
    "salty": "salt",
    "laut": "marine",
    "ozonic": "marine",
    "calone": "marine",
    "bunga jeruk": "orange blossom",
    "daun hijau": "green leaves",
    "rumput": "grass",
}

# user-facing family words (English + Indonesian) -> canonical family
FAMILY_ALIASES: dict[str, str] = {
    "fresh": "fresh",
    "segar": "fresh",
    "clean": "fresh",
    "woody": "woody",
    "kayu": "woody",
    "floral": "floral",
    "bunga": "floral",
    "white floral": "white floral",
    "aromatic": "aromatic",
    "fougere": "aromatic",
    "amber": "amber",
    "oriental": "amber",
    "resinous": "amber",
    "gourmand": "gourmand",
    "sweet": "gourmand",
    "manis": "gourmand",
    "dessert": "gourmand",
    "spicy": "spicy",
    "pedas": "spicy",
    "rempah": "spicy",
    "citrus": "citrus",
    "aquatic": "aquatic",
    "marine": "aquatic",
    "green": "green",
    "hijau": "green",
    "fruity": "fruity",
    "buah": "fruity",
    "musky": "musky",
    "leather": "leather",
    "powdery": "powdery",
    "powder": "powdery",
}

# "fresh" is an umbrella family: any of these implies a fresh character
FRESH_MEMBER_FAMILIES = frozenset({"citrus", "aromatic", "aquatic", "green"})

_MULTI_WORD_CANONICALS = sorted(
    (note for note in NOTE_FAMILIES if " " in note), key=len, reverse=True
)


def _symmetric_neighbours() -> dict[str, frozenset[str]]:
    """Close ``_NEIGHBOUR_SEED`` under symmetry, dropping unknown notes.

    Substitutability runs both ways, so declaring each pair once keeps the
    seed table readable without making the lookup direction-sensitive.
    """
    pairs: dict[str, set[str]] = {}
    for note, neighbours in _NEIGHBOUR_SEED.items():
        if note not in NOTE_FAMILIES:
            continue
        for neighbour in neighbours:
            if neighbour not in NOTE_FAMILIES or neighbour == note:
                continue
            pairs.setdefault(note, set()).add(neighbour)
            pairs.setdefault(neighbour, set()).add(note)
    return {note: frozenset(values) for note, values in pairs.items()}


NOTE_NEIGHBOURS: dict[str, frozenset[str]] = _symmetric_neighbours()

# every spelling the fuzzy corrector may snap an unknown term onto
_KNOWN_TERMS = tuple(sorted(set(NOTE_FAMILIES) | set(NOTE_SYNONYMS)))
# below this length a single edit changes too large a share of the word for
# the match to be trustworthy ("rose" vs "rosé" is fine, "oud" vs "out" is not)
_FUZZY_MIN_LENGTH = 5
_FUZZY_CUTOFF = 0.82


def normalize_term(value: str) -> str:
    ascii_value = (
        unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    )
    return " ".join(re.sub(r"[^a-z0-9]+", " ", ascii_value.lower()).split())


def fuzzy_correction(term: str) -> str | None:
    """Snap a misspelled note onto the closest known spelling.

    Users type "bergamont" or "sandlewood"; scoring only ever sees exact
    canonical names, so an uncorrected typo silently scores as an unknown
    note. Applied only after every exact and substring route has failed.
    """
    if len(term) < _FUZZY_MIN_LENGTH:
        return None
    matches = difflib.get_close_matches(term, _KNOWN_TERMS, n=1, cutoff=_FUZZY_CUTOFF)
    if not matches:
        return None
    match = matches[0]
    return NOTE_SYNONYMS.get(match, match)


def canonical_note(raw: str) -> str:
    term = normalize_term(raw)
    if term in NOTE_SYNONYMS:
        return NOTE_SYNONYMS[term]
    if term in NOTE_FAMILIES:
        return term
    for canonical in _MULTI_WORD_CANONICALS:
        if canonical in term:
            return canonical
    tokens = set(term.split())
    for synonym, canonical in NOTE_SYNONYMS.items():
        if " " not in synonym and synonym in tokens:
            return canonical
    for canonical in NOTE_FAMILIES:
        if " " not in canonical and canonical in tokens:
            return canonical
    corrected = fuzzy_correction(term)
    if corrected:
        return corrected
    # a multi-word phrase may still hide one correctable token ("bergamont oil")
    for token in term.split():
        corrected = fuzzy_correction(token)
        if corrected:
            return corrected
    return term


def canonical_notes(notes: list[str] | tuple[str, ...]) -> list[str]:
    seen: list[str] = []
    for note in notes:
        canonical = canonical_note(note)
        if canonical and canonical not in seen:
            seen.append(canonical)
    return seen


def families_for_note(note: str) -> frozenset[str]:
    return frozenset(NOTE_FAMILIES.get(canonical_note(note), ()))


def family_profile(notes: list[str] | set[str] | tuple[str, ...]) -> set[str]:
    families: set[str] = set()
    for note in notes:
        families.update(NOTE_FAMILIES.get(canonical_note(note), ()))
    if families & FRESH_MEMBER_FAMILIES:
        families.add("fresh")
    return families


def traits_for_note(note: str) -> frozenset[str]:
    return frozenset(NOTE_TRAITS.get(canonical_note(note), ()))


def trait_profile(notes: list[str] | set[str] | tuple[str, ...]) -> set[str]:
    traits: set[str] = set()
    for note in notes:
        traits.update(NOTE_TRAITS.get(canonical_note(note), ()))
    return traits


def similar_notes(note: str) -> frozenset[str]:
    return NOTE_NEIGHBOURS.get(canonical_note(note), frozenset())


def is_known_note(note: str) -> bool:
    return canonical_note(note) in NOTE_FAMILIES


def volatility_of(note: str) -> str | None:
    """The tier this material naturally occupies, or None if unclassified."""
    return NOTE_VOLATILITY.get(canonical_note(note))


def normalize_pyramid(
    tiers: dict[str, list[str] | tuple[str, ...] | None],
) -> dict[str, list[str]]:
    """Canonicalize stated tiers and give every note exactly one home.

    A source that lists the same material twice (amber in both heart and
    base is a common way to say "it lingers") would otherwise let that note
    earn credit on two routes. Ties go to the more volatile tier, matching
    the order the wearer meets the note.
    """
    pyramid: dict[str, list[str]] = {tier: [] for tier in TIERS}
    placed: set[str] = set()
    for tier in TIERS:
        for note in canonical_notes(list(tiers.get(tier) or ())):
            if note in placed:
                continue
            placed.add(note)
            pyramid[tier].append(note)
    return pyramid


def infer_pyramid(notes: list[str] | tuple[str, ...]) -> dict[str, list[str]]:
    """Sort a flat note list into tiers using material volatility.

    Only for records ingested before the pyramid existed. Notes with no
    entry in ``NOTE_VOLATILITY`` land in the heart, which is where an
    unclassified material is least likely to mislead: calling it an opening
    note promises it fades, calling it a base note promises it lasts.
    """
    pyramid: dict[str, list[str]] = {tier: [] for tier in TIERS}
    for note in canonical_notes(list(notes)):
        pyramid[NOTE_VOLATILITY.get(note, "heart")].append(note)
    return pyramid


def resolve_pyramid(
    notes: list[str] | tuple[str, ...],
    top: list[str] | None = None,
    heart: list[str] | None = None,
    base: list[str] | None = None,
) -> tuple[dict[str, list[str]], bool]:
    """Best available pyramid for one record, plus whether it was stated.

    Callers need the flag as much as the tiers: an inferred pyramid is a
    reasonable default to rank and render with, but it must never be
    narrated to the wearer as if the catalog had said it.
    """
    stated = normalize_pyramid({"top": top, "heart": heart, "base": base})
    if any(stated.values()):
        # a stated pyramid still may not mention every note on the record
        missing = [
            note
            for note in canonical_notes(list(notes))
            if not any(note in tier_notes for tier_notes in stated.values())
        ]
        for note in missing:
            stated[NOTE_VOLATILITY.get(note, "heart")].append(note)
        return stated, True
    return infer_pyramid(notes), False


def flatten_pyramid(pyramid: dict[str, list[str]]) -> list[str]:
    """Collapse tiers back into the flat ``notes`` list, opening first."""
    flat: list[str] = []
    for tier in TIERS:
        for note in pyramid.get(tier) or ():
            if note not in flat:
                flat.append(note)
    return flat


def stated_pyramid(
    top: list[str] | None, heart: list[str] | None, base: list[str] | None
) -> dict[str, list[str]] | None:
    """The pyramid to show a language model, or None if there isn't one.

    Deliberately never falls back to inference. An inferred pyramid is fine
    to rank and sort with, but handing one to a model that will narrate it
    as "opens on bergamot" turns a guess into a claim.
    """
    if not (top or heart or base):
        return None
    return {"top": list(top or ()), "heart": list(heart or ()), "base": list(base or ())}


def tier_index(pyramid: dict[str, list[str]]) -> dict[str, str]:
    """Reverse the pyramid into note -> tier for O(1) lookups while scoring."""
    return {
        note: tier for tier in TIERS for note in (pyramid.get(tier) or ())
    }


def note_entry(note: str) -> dict[str, object]:
    """The public record for one note, as served by ``GET /v1/notes``."""
    canonical = canonical_note(note)
    families = NOTE_FAMILIES.get(canonical, ())
    return {
        "name": canonical,
        "family": families[0] if families else None,
        "families": list(families),
        "traits": list(NOTE_TRAITS.get(canonical, ())),
        "similar_notes": sorted(NOTE_NEIGHBOURS.get(canonical, frozenset())),
        "volatility": NOTE_VOLATILITY.get(canonical),
        "known": canonical in NOTE_FAMILIES,
    }


def note_database() -> list[dict[str, object]]:
    return [note_entry(note) for note in sorted(NOTE_FAMILIES)]


def canonical_family(raw: str) -> str | None:
    return FAMILY_ALIASES.get(normalize_term(raw))


def expand_avoided(avoid_terms: list[str] | tuple[str, ...]) -> tuple[set[str], set[str]]:
    """Split avoid terms into (avoided canonical notes, avoided families).

    A family term such as "manis"/"sweet" bans the whole family; a note term
    bans that canonical note only.
    """
    avoided_notes: set[str] = set()
    avoided_families: set[str] = set()
    for term in avoid_terms:
        family = canonical_family(term)
        note = canonical_note(term)
        if note in NOTE_FAMILIES and normalize_term(term) not in FAMILY_ALIASES:
            avoided_notes.add(note)
        elif family:
            avoided_families.add(family)
        else:
            avoided_notes.add(note)
    return avoided_notes, avoided_families


def note_conflicts(
    candidate_notes: list[str] | set[str],
    avoided_notes: set[str],
    avoided_families: set[str],
) -> set[str]:
    conflicts: set[str] = set()
    for note in candidate_notes:
        canonical = canonical_note(note)
        if canonical in avoided_notes:
            conflicts.add(canonical)
            continue
        note_families = set(NOTE_FAMILIES.get(canonical, ()))
        if note_families & FRESH_MEMBER_FAMILIES:
            note_families.add("fresh")
        if note_families & avoided_families:
            conflicts.add(canonical)
    return conflicts
