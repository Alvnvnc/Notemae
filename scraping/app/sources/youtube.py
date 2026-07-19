"""YouTube discovery adapter.

Uses the official YouTube Data API v3 (search.list) within its documented
quota to find fragrance review videos. Video titles are only treated as
*candidates*: an LLM extraction step turns them into (brand, name) pairs with
a confidence score, and only high-confidence products that are not already in
the catalog are submitted. The video URL is kept as the record's source URL.

Requires YOUTUBE_API_KEY; the run endpoint refuses to start without it.
search.list costs 100 quota units per call (default project quota: 10,000/day).
"""

from typing import Any

import httpx

from ..models import SourceRecord


SOURCE_NAME = "YouTube fragrance reviews"
SEARCH_URL = "https://www.googleapis.com/youtube/v3/search"


async def search_videos(
    client: httpx.AsyncClient,
    api_key: str,
    query: str,
    max_results: int,
) -> list[dict[str, str]]:
    """Return [{video_id, title, channel}] for one search query."""
    response = await client.get(
        SEARCH_URL,
        params={
            "key": api_key,
            "part": "snippet",
            "q": query,
            "type": "video",
            "maxResults": max(1, min(max_results, 50)),
            "relevanceLanguage": "id",
            "safeSearch": "none",
        },
    )
    response.raise_for_status()
    videos: list[dict[str, str]] = []
    for item in response.json().get("items", []):
        video_id = (item.get("id") or {}).get("videoId", "")
        snippet = item.get("snippet") or {}
        title = str(snippet.get("title", "")).strip()
        if video_id and title:
            videos.append(
                {
                    "video_id": video_id,
                    "title": title,
                    "channel": str(snippet.get("channelTitle", "")).strip(),
                }
            )
    return videos


def to_source_record(
    candidate: dict[str, Any], video: dict[str, str]
) -> SourceRecord:
    return SourceRecord(
        source_name=SOURCE_NAME,
        source_type="official_api",
        source_url=f"https://www.youtube.com/watch?v={video['video_id']}",
        source_record_id=None,
        terms_confirmed=True,
        brand=candidate["brand"],
        name=candidate["name"],
        description=f'Mentioned in YouTube fragrance review: "{video["title"]}"',
        gender=candidate["gender"],
    )
