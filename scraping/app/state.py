import json
from pathlib import Path


class IngestionState:
    def __init__(self, path: str):
        self.path = Path(path)
        self.processed_files: list[str] = []
        self.category_pages: dict[str, int] = {}
        self.dump_line: int = 0
        self.enriched_slugs: list[str] = []
        self.load()

    @property
    def last_cursor(self) -> str | None:
        return self.processed_files[-1] if self.processed_files else None

    def load(self) -> None:
        try:
            payload = json.loads(self.path.read_text(encoding="utf-8"))
            self.processed_files = list(payload.get("processed_files", []))[-100:]
            self.category_pages = {
                str(tag): int(page)
                for tag, page in dict(payload.get("category_pages", {})).items()
            }
            self.dump_line = int(payload.get("dump_line", 0))
            self.enriched_slugs = [
                str(slug) for slug in payload.get("enriched_slugs", [])
            ][-5000:]
        except (FileNotFoundError, json.JSONDecodeError, OSError, TypeError, ValueError):
            self.processed_files = []
            self.category_pages = {}
            self.dump_line = 0
            self.enriched_slugs = []

    def mark_processed(self, filenames: list[str]) -> None:
        for filename in filenames:
            if filename not in self.processed_files:
                self.processed_files.append(filename)
        self.processed_files = self.processed_files[-100:]
        self.save()

    def set_category_page(self, tag: str, page: int) -> None:
        self.category_pages[tag] = page
        self.save()

    def set_dump_line(self, line: int) -> None:
        self.dump_line = line
        self.save()

    def mark_enriched(self, slugs: list[str]) -> None:
        for slug in slugs:
            if slug not in self.enriched_slugs:
                self.enriched_slugs.append(slug)
        self.enriched_slugs = self.enriched_slugs[-5000:]
        self.save()

    def save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary_path = self.path.with_suffix(".tmp")
        temporary_path.write_text(
            json.dumps(
                {
                    "processed_files": self.processed_files,
                    "category_pages": self.category_pages,
                    "dump_line": self.dump_line,
                    "enriched_slugs": self.enriched_slugs,
                },
                indent=2,
            ),
            encoding="utf-8",
        )
        temporary_path.replace(self.path)
