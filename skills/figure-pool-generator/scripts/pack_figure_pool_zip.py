#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
import zipfile
from pathlib import Path

from figure_pool_tools import build_import_payload, load_pool, resolve_project_path, validate_records


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Pack an EchoProfile figure pool JSON and portraits into an import zip.")
    parser.add_argument("--input", required=True, help="Path to the source figure pool JSON")
    parser.add_argument("--output", required=True, help="Path to the output zip file")
    parser.add_argument(
        "--project-root",
        default=".",
        help="Project root used to resolve /figure-portraits/... paths (default: current directory)",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    input_path = Path(args.input).resolve()
    output_path = Path(args.output).resolve()
    project_root = Path(args.project_root).resolve()

    try:
        pool = load_pool(input_path)
    except Exception as exc:  # pragma: no cover - CLI guard
        print(f"Failed to load figure pool: {exc}", file=sys.stderr)
        return 1

    errors = validate_records(pool.records, project_root, input_path)
    if errors:
        print(f"Refusing to pack invalid figure pool: {input_path}", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1

    payload = build_import_payload(pool)
    portrait_count = 0

    for record in payload["records"]:
        portrait_url = str(record["portrait_url"])
        portrait_path = resolve_project_path(project_root, portrait_url, input_path)
        if portrait_path is None:
            print(f"Unable to resolve portrait for {record.get('slug', '<unknown>')}: {portrait_url}", file=sys.stderr)
            return 1
        record["portrait_url"] = f"portraits/{portrait_path.name}"

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("pool.json", json.dumps(payload, ensure_ascii=False, indent=2))
        for original_record in pool.records:
            portrait_path = resolve_project_path(project_root, str(original_record["portrait_url"]), input_path)
            if portrait_path is None:
                print(
                    f"Unable to resolve portrait for {original_record.get('slug', '<unknown>')}: {original_record.get('portrait_url')}",
                    file=sys.stderr,
                )
                return 1
            archive.write(portrait_path, arcname=f"portraits/{portrait_path.name}")
            portrait_count += 1

    print(f"Packed zip: output={output_path} records={len(payload['records'])} portraits={portrait_count}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
