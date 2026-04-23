from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any


REQUIRED_STRING_FIELDS = [
    "slug",
    "name",
    "portrait_url",
    "quote_en",
    "quote_zh",
    "core_traits",
    "thinking_style",
    "temperament_tags",
    "temperament_summary",
    "loading_copy_zh",
    "loading_copy_en",
    "bio_zh",
    "bio_en",
]

REQUIRED_ARRAY_FIELDS = [
    "achievements_zh",
    "achievements_en",
]

REMOTE_PREFIXES = ("http://", "https://", "data:", "blob:")


@dataclass
class LoadedPool:
    source_path: Path
    name: str
    description: str | None
    records: list[dict[str, Any]]
    source_data: Any


def load_pool(input_path: Path) -> LoadedPool:
    source_data = json.loads(input_path.read_text())

    if isinstance(source_data, list):
        records = source_data
        name = input_path.stem
        description = None
    elif isinstance(source_data, dict) and isinstance(source_data.get("records"), list):
        records = source_data["records"]
        name = normalize_string(source_data.get("name")) or input_path.stem
        description = normalize_string(source_data.get("description")) or None
    else:
        raise ValueError("Input JSON must be a FigurePool-like object or a records array")

    normalized_records = []
    for record in records:
        if not isinstance(record, dict):
            raise ValueError("Each record must be a JSON object")
        normalized_records.append(dict(record))

    return LoadedPool(
        source_path=input_path,
        name=name,
        description=description,
        records=normalized_records,
        source_data=source_data,
    )


def normalize_string(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ""


def resolve_project_path(project_root: Path, portrait_url: str, input_path: Path) -> Path | None:
    portrait_url = normalize_string(portrait_url)
    if not portrait_url:
        return None

    if portrait_url.startswith(REMOTE_PREFIXES):
        return None

    if portrait_url.startswith("/"):
        return project_root / "public" / portrait_url.lstrip("/")

    relative = Path(portrait_url)
    if relative.parts and relative.parts[0] == "public":
        return project_root / relative

    candidate_from_input = input_path.parent / relative
    if candidate_from_input.exists():
        return candidate_from_input

    candidate_from_root = project_root / relative
    if candidate_from_root.exists():
        return candidate_from_root

    return candidate_from_root


def validate_records(records: list[dict[str, Any]], project_root: Path, input_path: Path) -> list[str]:
    errors: list[str] = []
    slug_counts: dict[str, int] = {}

    for index, record in enumerate(records):
        slug = normalize_string(record.get("slug"))
        if slug:
            slug_counts[slug] = slug_counts.get(slug, 0) + 1

        for field in REQUIRED_STRING_FIELDS:
            if not normalize_string(record.get(field)):
                errors.append(f"record[{index}] {field} is required")

        for field in REQUIRED_ARRAY_FIELDS:
            value = record.get(field)
            if not isinstance(value, list) or not value or any(not normalize_string(item) for item in value):
                errors.append(f"record[{index}] {field} must contain at least one non-empty item")

        portrait_url = normalize_string(record.get("portrait_url"))
        portrait_path = resolve_project_path(project_root, portrait_url, input_path)
        if portrait_url.startswith(REMOTE_PREFIXES):
            errors.append(f"record[{index}] missing portrait local asset for remote portrait_url: {portrait_url}")
        elif portrait_path is None or not portrait_path.exists():
            errors.append(f"record[{index}] missing portrait local asset: {portrait_url}")

    for slug, count in sorted(slug_counts.items()):
        if count > 1:
            errors.append(f"duplicate slug: {slug}")

    return errors


def build_import_payload(pool: LoadedPool) -> dict[str, Any]:
    return {
        "name": pool.name,
        "description": pool.description,
        "records": [dict(record) for record in pool.records],
    }

