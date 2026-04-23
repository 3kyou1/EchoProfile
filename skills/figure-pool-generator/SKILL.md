---
name: figure-pool-generator
description: Use when generating or refreshing an EchoProfile figure pool JSON or zip for a user-specified theme, especially for named groups such as scientists, entrepreneurs, investors, or region/era-biased rosters.
---

# Figure Pool Generator

## Overview

This is an EchoProfile project skill for building a usable first-pass figure pool, not a generic research essay. The output must land as local project assets that match the repo's current `FigurePool` expectations and zip import/export behavior.

Default target:

- One themed pool
- Usually `30-50` people unless the user gives a tighter range
- Strongly differentiated人物气质，不要把所有人写成同一种腔调
- Local portraits with consistent dimensions
- A repo-local JSON source file
- A compatible zip package when the user asks for importable output

## When To Use

Use this when the user asks to:

- create a new人物池 / 候选池 / figure pool
- refresh or expand an existing themed pool
- generate a JSON file or zip import package for a group of people
- bias the pool toward a country, era, industry, school, or temperament

Do not use this for:

- editing one or two existing records only
- generic biography writing unrelated to EchoProfile
- unrelated asset download tasks

## Project Context To Read First

Before producing anything, inspect the current project reality instead of assuming the schema:

- Pool system design: `docs/superpowers/specs/2026-04-23-figure-pool-design.md`
- Material guidance: `docs/superpowers/specs/2026-04-23-figure-pool-material-guidelines-design.md`
- Generator design: `docs/superpowers/specs/2026-04-23-figure-pool-generator-skill-design.md`
- Zip implementation reference: `.worktrees/figure-pools/src/services/figurePoolService.ts`
- Zip behavior tests: `.worktrees/figure-pools/src/test/figurePoolService.test.ts`

If the code and docs disagree, follow the code that currently implements import/export.

## Output Locations

Prefer these paths unless the user asks otherwise:

- Source JSON: `src/data/figure-pools/<pool-slug>.json`
- Portraits: `public/figure-portraits/<pool-slug>/`
- Import zip: `src/data/figure-pools/<pool-slug>.zip`

Use ASCII filenames and stable slugs.

## Required Record Fields

Each record must satisfy the current figure-pool schema expectations:

- `slug`
- `name`
- `localized_names` when a stable localized form is available
- `portrait_url`
- `quote_en`
- `quote_zh`
- `core_traits`
- `thinking_style`
- `temperament_tags`
- `temperament_summary`
- `loading_copy_zh`
- `loading_copy_en`
- `bio_zh`
- `bio_en`
- `achievements_zh`
- `achievements_en`

Treat missing portraits, empty required strings, empty achievements arrays, and duplicate `slug` values as hard blockers.

## Bundled Tools

Use the bundled scripts instead of rewriting one-off validation or packing logic each time:

- Validate a source pool: `python3 skills/figure-pool-generator/scripts/validate_figure_pool.py --input src/data/figure-pools/<pool-slug>.json`
- Pack an import zip: `python3 skills/figure-pool-generator/scripts/pack_figure_pool_zip.py --input src/data/figure-pools/<pool-slug>.json --output src/data/figure-pools/<pool-slug>.zip`

Both scripts resolve `/figure-portraits/...` paths against the repo `public/` directory by default. If you run them outside the repo root, add `--project-root /path/to/EchoProfile`.

## Workflow

### 1. Normalize the ask

Extract the real constraints from the user request:

- theme and boundary
- target count
- must-include people
- must-exclude people
- country / era / industry weighting
- tone requirements for the copy
- whether zip output is required

If the user gives a final roster, treat it as authoritative. Do not silently add back excluded people.

### 2. Confirm the active schema and zip format

Check the current implementation before writing files:

- `FigureRecord` field expectations
- whether the repo currently stores a full `FigurePool` object or only import payloads
- zip layout

Current zip behavior from the worktree implementation:

- zip root contains `pool.json`
- portraits live under `portraits/`
- `pool.json` record `portrait_url` values must be rewritten to `portraits/<filename>`

The zip payload is an import payload, not an internal storage snapshot.

### 3. Build the roster

Default roster size is `30-50`.

Selection rules:

- prioritize representative, high-signal people
- preserve internal variety; do not stack near-duplicates
- favor people with enough public material to fill all fields well
- prefer the user's weighting, e.g. more Chinese and US internet founders
- if a topic is too narrow, keep quality first and explicitly note compromises

### 4. Write the records

Write for product use, not encyclopedia completeness.

Field guidance:

- `quote_zh` / `quote_en`: short, independently readable, temperament-bearing
- `bio_zh` / `bio_en`: concise display copy, not resume dump
- `achievements_*`: `2-4` clear, high-recognition items
- `core_traits`: compressed trait summary
- `thinking_style`: observer notes about how this person tends to think or operate
- `temperament_summary`: one compact summary of energy, rhythm, and style
- `loading_copy_*`: short, vivid loading text tied to the person

When the user asks for more vivid writing:

- increase scene sense, era texture, and strategic flavor
- keep people distinct from each other
- avoid machine-flat parallel phrasing
- for Chinese internet founders, allow stronger江湖感、流量格局、时代气
- still keep fields concise enough for UI display

Do not make every record stylistically uniform unless the user explicitly asks for consistency.

### 5. Download and normalize portraits

Portrait rules:

- prefer high-resolution, clean single-person photos
- store locally under `public/figure-portraits/<pool-slug>/`
- filename should align with `slug`
- keep dimensions consistent across the pool
- avoid broken hotlinks; the repo should own the asset locally

If network is restricted, request approval before downloading.

### 6. Write the JSON source

Create the repo-local source file under `src/data/figure-pools/`.

If the current in-repo convention uses a full pool object, keep that source shape there. If the user only needs importable output, you may author directly as an import payload.

At minimum, ensure the file is internally consistent:

- pool name and description match the theme
- record count is correct
- all portrait paths resolve to local assets
- all required fields are present

### 7. Export the zip when needed

When the user asks for a zip, package it to match the implemented importer:

- create `pool.json` at zip root
- rewrite every record `portrait_url` to `portraits/<filename>`
- include portrait files under `portraits/`
- do not include internal runtime metadata that the importer/exporter does not expect

Mirror `.worktrees/figure-pools/src/services/figurePoolService.ts` and its tests, not a guessed format.

## Validation

Do not claim completion without fresh checks.

Minimum checks:

- validator script passes
- record count matches expectation
- portrait files exist locally
- no duplicate slugs
- packer script succeeds
- zip contains `pool.json`
- zip portrait count matches record count
- `pool.json` inside the zip uses `portraits/` paths

Useful commands:

```bash
python3 skills/figure-pool-generator/scripts/validate_figure_pool.py --input src/data/figure-pools/<pool-slug>.json
python3 skills/figure-pool-generator/scripts/pack_figure_pool_zip.py --input src/data/figure-pools/<pool-slug>.json --output src/data/figure-pools/<pool-slug>.zip
python3 - <<'PY'
import json, zipfile
from pathlib import Path
z = zipfile.ZipFile(Path("src/data/figure-pools/<pool-slug>.zip"))
payload = json.loads(z.read("pool.json"))
print("entries", len(z.namelist()))
print("records", len(payload["records"]))
print("portrait_entries", sum(1 for n in z.namelist() if n.startswith("portraits/")))
PY
```

## Reporting Back

When finished, report:

- JSON path
- portrait directory
- zip path if created
- final record count
- any user-requested inclusions/exclusions honored
- any compromises, weak records, or missing assets

Keep the report factual. Do not say it is complete unless the validation commands were run successfully in the current turn.
