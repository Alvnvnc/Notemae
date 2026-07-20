"""LLM-assisted enrichment for sparse catalog records.

Fills notes/occasions/climates/description for fragrances the model actually
recognizes. Every result is confidence-gated: the model must claim it knows the
exact product, and low-confidence answers are dropped instead of ingested, so
notes are never invented for obscure products (e.g. small local brands).
"""

import json
import re
from typing import Any

import httpx

from .config import settings


ALLOWED_OCCASIONS = ("casual", "date", "formal", "office", "party", "wedding")
ALLOWED_CLIMATES = ("cool", "hot", "mild", "tropical", "warm")
ALLOWED_GENDERS = ("men", "women", "unisex")

ENRICH_SYSTEM_PROMPT = (
    "You are a fragrance catalog curator. You only state facts you are "
    "confident about for the exact product asked. Reply with strict JSON only, "
    "no prose."
)

ENRICH_USER_TEMPLATE = """Product: {brand} — {name}
Existing description: {description}
Existing gender: {gender}

If and only if you recognize THIS exact fragrance product, provide catalog data.
Rules:
- If you are unsure which exact product this is, or you do not know its note
  pyramid, return {{"known": false}}. Never guess notes.
- top_notes / heart_notes / base_notes: the product's published pyramid, as
  lowercase note or accord names (e.g. "bergamot", "vanilla"). Each note
  belongs to exactly one tier; do not repeat a note across tiers. 3-10 notes
  in total across the three tiers.
- If you know the notes but genuinely do not know how they are arranged in
  the pyramid, leave heart_notes and base_notes empty and put every note in
  top_notes ONLY IF the product really is a linear composition; otherwise
  return {{"known": false}} rather than inventing an arrangement.
- occasions: subset of {occasions}.
- climates: subset of {climates}.
- gender: "men", "women" or "unisex".
- release_year: integer year or null, only if certain.
- description: one factual English sentence describing the scent character.
- confidence: 0.0-1.0, your certainty these facts describe this exact product.

Return JSON exactly like:
{{"known": true, "confidence": 0.9, "top_notes": ["..."],
"heart_notes": ["..."], "base_notes": ["..."], "occasions": ["..."],
"climates": ["..."], "gender": "unisex", "release_year": null,
"description": "..."}}"""

EXTRACT_SYSTEM_PROMPT = (
    "You extract fragrance product mentions from YouTube video titles for a "
    "catalog. Reply with strict JSON only, no prose."
)

EXTRACT_USER_TEMPLATE = """Video titles (index: title):
{titles}

Extract every distinct fragrance product explicitly named in these titles.
Rules:
- Only include entries where BOTH the brand and the product name are stated or
  unambiguous. Skip vague mentions ("this new Armaf", "3 summer picks").
- Normalize obvious abbreviations (e.g. "BR540" -> brand "Maison Francis
  Kurkdjian", name "Baccarat Rouge 540") only when unambiguous.
- confidence: 0.0-1.0 that this is a real, correctly spelled fragrance product.
- title_index: the index of one title where the product is mentioned.

Return JSON exactly like:
{{"fragrances": [{{"brand": "...", "name": "...", "gender": "unisex",
"confidence": 0.9, "title_index": 0}}]}}"""


def parse_json_reply(text: str) -> dict[str, Any] | None:
    cleaned = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL)
    cleaned = re.sub(r"^```(?:json)?|```$", "", cleaned.strip(), flags=re.MULTILINE)
    start, end = cleaned.find("{"), cleaned.rfind("}")
    if start < 0 or end <= start:
        return None
    try:
        payload = json.loads(cleaned[start : end + 1])
    except json.JSONDecodeError:
        return None
    return payload if isinstance(payload, dict) else None


async def chat_json(
    client: httpx.AsyncClient, system: str, user: str
) -> dict[str, Any] | None:
    response = await client.post(
        f"{settings.qwen_base_url.rstrip('/')}/chat/completions",
        headers={"Authorization": f"Bearer {settings.dashscope_api_key}"},
        json={
            "model": settings.qwen_model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "temperature": 0.1,
            "max_tokens": 2000,
        },
    )
    response.raise_for_status()
    content = response.json()["choices"][0]["message"]["content"]
    return parse_json_reply(content or "")


def clean_tags(values: Any, allowed: tuple[str, ...] | None, cap: int) -> list[str]:
    if not isinstance(values, list):
        return []
    cleaned: list[str] = []
    for value in values:
        tag = " ".join(str(value).lower().split())[:50]
        if not tag or tag in cleaned:
            continue
        if allowed is not None and tag not in allowed:
            continue
        cleaned.append(tag)
    return cleaned[:cap]


TIER_KEYS = ("top_notes", "heart_notes", "base_notes")
MAX_NOTES = 15


def clean_pyramid(payload: dict[str, Any]) -> dict[str, list[str]]:
    """Read the model's pyramid into tiers plus the flat union.

    A note claimed in two tiers is kept in the more volatile one, which is
    where the wearer meets it first. The flat ``notes`` list is derived here
    rather than read from the model, so the union can never disagree with
    the tiers it is supposed to summarize.

    Models still occasionally answer with the old flat ``notes`` key; that
    is accepted and simply yields empty tiers, the same state as any record
    ingested before the pyramid existed.
    """
    tiers: dict[str, list[str]] = {}
    flat: list[str] = []
    for key in TIER_KEYS:
        tier: list[str] = []
        for note in clean_tags(payload.get(key), None, MAX_NOTES):
            if note in flat:
                continue
            flat.append(note)
            tier.append(note)
        tiers[key] = tier
    if not flat:
        flat = clean_tags(payload.get("notes"), None, MAX_NOTES)
    if len(flat) > MAX_NOTES:
        surplus = set(flat[MAX_NOTES:])
        flat = flat[:MAX_NOTES]
        tiers = {
            key: [note for note in tier if note not in surplus]
            for key, tier in tiers.items()
        }
    return {"notes": flat, **tiers}


async def enrich_record(
    client: httpx.AsyncClient, record: dict[str, Any]
) -> dict[str, Any] | None:
    """Ask the LLM about one catalog record. Returns sanitized enrichment
    fields, or None when the model does not confidently know the product."""
    prompt = ENRICH_USER_TEMPLATE.format(
        brand=record["brand"],
        name=record["name"],
        description=record.get("description") or "(none)",
        gender=record.get("gender") or "unisex",
        occasions=json.dumps(list(ALLOWED_OCCASIONS)),
        climates=json.dumps(list(ALLOWED_CLIMATES)),
    )
    payload = await chat_json(client, ENRICH_SYSTEM_PROMPT, prompt)
    if not payload or payload.get("known") is not True:
        return None
    try:
        confidence = float(payload.get("confidence", 0))
    except (TypeError, ValueError):
        return None
    pyramid = clean_pyramid(payload)
    if confidence < settings.enrichment_min_confidence or len(pyramid["notes"]) < 3:
        return None

    release_year = payload.get("release_year")
    if not isinstance(release_year, int) or not 1800 <= release_year <= 2100:
        release_year = None
    gender = str(payload.get("gender", "")).lower()
    description = " ".join(str(payload.get("description", "")).split())[:2000]
    return {
        "confidence": confidence,
        **pyramid,
        "occasions": clean_tags(payload.get("occasions"), ALLOWED_OCCASIONS, 6),
        "climates": clean_tags(payload.get("climates"), ALLOWED_CLIMATES, 5),
        "gender": gender if gender in ALLOWED_GENDERS else None,
        "release_year": release_year,
        "description": description,
    }


async def extract_fragrances_from_titles(
    client: httpx.AsyncClient, titles: list[str]
) -> list[dict[str, Any]]:
    """Extract confident (brand, name) fragrance mentions from video titles."""
    numbered = "\n".join(f"{index}: {title}" for index, title in enumerate(titles))
    payload = await chat_json(
        client, EXTRACT_SYSTEM_PROMPT, EXTRACT_USER_TEMPLATE.format(titles=numbered)
    )
    if not payload:
        return []
    results: list[dict[str, Any]] = []
    for entry in payload.get("fragrances") or []:
        if not isinstance(entry, dict):
            continue
        brand = " ".join(str(entry.get("brand", "")).split())[:120]
        name = " ".join(str(entry.get("name", "")).split())[:160]
        try:
            confidence = float(entry.get("confidence", 0))
        except (TypeError, ValueError):
            continue
        title_index = entry.get("title_index")
        if not brand or not name or not isinstance(title_index, int):
            continue
        if not 0 <= title_index < len(titles):
            continue
        gender = str(entry.get("gender", "unisex")).lower()
        results.append(
            {
                "brand": brand,
                "name": name,
                "gender": gender if gender in ALLOWED_GENDERS else "unisex",
                "confidence": confidence,
                "title_index": title_index,
            }
        )
    return results
