"""Note taxonomy for taste matching.

Canonicalizes scraped or user-written note names (including Indonesian terms)
and maps every canonical note to one or more scent families so scoring can
award family-level partial credit instead of relying on exact string matches.
"""

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


def normalize_term(value: str) -> str:
    ascii_value = (
        unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    )
    return " ".join(re.sub(r"[^a-z0-9]+", " ", ascii_value.lower()).split())


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
