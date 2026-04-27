import re
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[3]
SKILL_PATH = REPO_ROOT / "skills/figure-pool-generator/SKILL.md"


class SkillReferenceTests(unittest.TestCase):
    def test_skill_document_is_written_in_chinese(self):
        text = SKILL_PATH.read_text()

        english_headings = [
            "## Overview",
            "## When To Use",
            "## Project Context To Read First",
            "## Output Locations",
            "## Required Record Fields",
            "## Bundled Tools",
            "## Workflow",
            "## Validation",
            "## Reporting Back",
        ]

        remaining = [heading for heading in english_headings if heading in text]
        self.assertEqual(remaining, [], f"Expected Chinese headings, found English headings: {remaining}")

    def test_skill_does_not_depend_on_unpublished_superpowers_docs(self):
        text = SKILL_PATH.read_text()

        self.assertNotIn(
            "docs/superpowers/specs/",
            text,
            "Skill should not depend on local-only superpowers specs that are not pushed with the skill",
        )

    def test_zip_output_uses_project_zip_folder(self):
        text = SKILL_PATH.read_text()

        self.assertIn("导入 zip：`zip/<pool-slug>.zip`", text)
        self.assertIn("--output zip/<pool-slug>.zip", text)

    def test_project_context_paths_exist(self):
        text = SKILL_PATH.read_text()
        section = text.split("## 先读取的项目上下文", 1)[1].split("## ", 1)[0]
        paths = [
            value
            for value in re.findall(r"`([^`]+)`", section)
            if not any(character.isspace() for character in value)
        ]

        self.assertGreater(paths, [], "Expected project context section to list paths in backticks")
        missing = [path for path in paths if not (REPO_ROOT / path).exists()]

        self.assertEqual(missing, [], f"Project context references missing paths: {missing}")


if __name__ == "__main__":
    unittest.main()
