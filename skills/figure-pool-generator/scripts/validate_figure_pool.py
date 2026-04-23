#!/usr/bin/env python3
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from figure_pool_tools import load_pool, validate_records


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Validate an EchoProfile figure pool JSON file.")
    parser.add_argument("--input", required=True, help="Path to the source figure pool JSON")
    parser.add_argument(
        "--project-root",
        default=".",
        help="Project root used to resolve /figure-portraits/... paths (default: current directory)",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    input_path = Path(args.input).resolve()
    project_root = Path(args.project_root).resolve()

    try:
        pool = load_pool(input_path)
    except Exception as exc:  # pragma: no cover - CLI guard
        print(f"Failed to load figure pool: {exc}", file=sys.stderr)
        return 1

    errors = validate_records(pool.records, project_root, input_path)
    if errors:
        print(f"Validation failed for {input_path}", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1

    print(f"Validation passed: records={len(pool.records)} errors=0 input={input_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
