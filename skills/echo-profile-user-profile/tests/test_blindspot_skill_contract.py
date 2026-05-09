import json
import re
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[3]
SKILL_PATH = REPO_ROOT / "skills/echo-profile-user-profile/SKILL.md"
SCHEMA_PATH = REPO_ROOT / "skills/echo-profile-user-profile/references/profile-output-schema.md"
OPENAI_YAML_PATH = REPO_ROOT / "skills/echo-profile-user-profile/agents/openai.yaml"
OBSERVER_POOL_PATH = REPO_ROOT / "skills/echo-profile-user-profile/references/observer-pool.json"
OBSERVERS_DIR = REPO_ROOT / "skills/echo-profile-user-profile/observers"

EXPECTED_OBSERVERS = [
    "andrej-karpathy-perspective",
    "elon-musk-perspective",
    "feynman-perspective",
    "ilya-sutskever-perspective",
    "munger-perspective",
    "naval-perspective",
    "paul-graham-perspective",
    "steve-jobs-perspective",
    "taleb-perspective",
    "x-mastery-mentor",
    "zhang-yiming-perspective",
]


class BlindspotSkillContractTests(unittest.TestCase):
    def test_skill_is_blindspot_oriented(self):
        text = SKILL_PATH.read_text()

        self.assertIn("# EchoProfile Blindspot Profile", text)
        self.assertIn("blindspot-oriented profile", text)
        self.assertIn("blindspot hypotheses", text)
        self.assertIn("hidden cost", text)
        self.assertIn("alternative explanation", text)
        self.assertIn("next verification", text)
        self.assertNotIn("## 适配建议", text)
        self.assertNotIn("assistantAdaptation", text)

    def test_default_output_uses_second_person_blindspot_template(self):
        text = SKILL_PATH.read_text()

        required_phrases = [
            "# 你的盲点画像",
            "## 摘要",
            "## 数据基础与可信度",
            "## 最值得验证的盲点假设",
            "## 协作盲点",
            "## 决策盲点",
            "## 认知盲点",
            "## 成长盲点",
            "### 1. 你可能",
            "可能被你忽略的代价",
            "反向解释",
            "下次如何验证",
        ]

        for phrase in required_phrases:
            self.assertIn(phrase, text)

        self.assertRegex(text, r"Use second person")
        self.assertNotRegex(text, r"Default to first person|Use first person")

    def test_schema_uses_blindspot_fields_not_old_profile_fields(self):
        text = SCHEMA_PATH.read_text()
        json_block = re.search(r"```json\n(?P<json>[\s\S]*?)\n```", text)
        self.assertIsNotNone(json_block, "Expected schema reference to include a JSON block")

        schema = json.loads(json_block.group("json"))
        self.assertIn("topBlindspotHypotheses", schema)
        self.assertIn("observerLens", schema)
        self.assertIn("categories", schema)
        self.assertIn("lowConfidenceObservations", schema)
        self.assertIn("doNotInfer", schema)
        self.assertNotIn("workStyle", schema)
        self.assertNotIn("assistantAdaptation", schema)

        observer_lens = schema["observerLens"]
        for key in ["enabled", "slug", "displayName", "skillPath", "focus", "limitations"]:
            self.assertIn(key, observer_lens)

        hypothesis = schema["topBlindspotHypotheses"][0]
        for key in [
            "hypothesis",
            "category",
            "observedPattern",
            "hiddenCost",
            "supportingEvidence",
            "alternativeExplanation",
            "evidenceStrength",
            "nextVerification",
            "observerComment",
        ]:
            self.assertIn(key, hypothesis)

    def test_agent_metadata_matches_blindspot_positioning(self):
        text = OPENAI_YAML_PATH.read_text()

        self.assertIn("EchoProfile Blindspot Profile", text)
        self.assertIn("blindspot", text)
        self.assertNotIn("Generate a profile from collected AI history", text)

    def test_observer_pool_includes_all_nuwa_perspective_skills(self):
        pool = json.loads(OBSERVER_POOL_PATH.read_text())
        observers = pool["observers"]
        slugs = [observer["slug"] for observer in observers]

        self.assertEqual(slugs, EXPECTED_OBSERVERS)
        for observer in observers:
            skill_path = observer["skillPath"]
            self.assertEqual(skill_path, f"observers/{observer['slug']}/SKILL.md")
            self.assertTrue((REPO_ROOT / "skills/echo-profile-user-profile" / skill_path).is_file())
            self.assertGreater(observer["displayName"], "")
            self.assertGreater(observer["aliases"], [])

    def test_observer_skills_are_full_perspective_skills(self):
        for slug in EXPECTED_OBSERVERS:
            text = (OBSERVERS_DIR / slug / "SKILL.md").read_text()
            self.assertIn("---", text, f"{slug} should keep skill frontmatter")
            self.assertTrue(
                any(keyword in text for keyword in ["思维", "心智", "模型", "操作系统"]),
                f"{slug} should keep the full perspective skill content",
            )
            self.assertTrue(
                any(keyword in text for keyword in ["角色", "导师", "视角", "身份"]),
                f"{slug} should keep role/perspective instructions",
            )
            self.assertGreater(len(text), 5000, f"{slug} should not be a short distilled observer card")

    def test_skill_documents_observer_lens_mode(self):
        text = SKILL_PATH.read_text()

        self.assertIn("## Observer Lens Mode", text)
        self.assertIn("references/observer-pool.json", text)
        self.assertIn("observers/<slug>/SKILL.md", text)
        self.assertIn("Do not summarize or re-distill the observer skill before using it.", text)
        self.assertIn("Resolve observer-relative files from the selected observer directory.", text)
        self.assertIn("If the user does not specify an observer, show the observer selection list", text)


if __name__ == "__main__":
    unittest.main()
