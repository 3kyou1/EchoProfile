import json
import subprocess
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "scripts/validate_figure_pool.py"


def build_record(**overrides):
    record = {
        "slug": "jack_ma",
        "name": "Jack Ma",
        "localized_names": {"zh": "马云"},
        "portrait_url": "/figure-portraits/entrepreneurs/jack_ma.jpg",
        "quote_en": "Today is hard, tomorrow is harder.",
        "quote_zh": "今天很残酷，明天更残酷。",
        "core_traits": "Narrative force, platform instinct, salesmanship",
        "thinking_style": "Sees momentum early and turns attention into leverage.",
        "temperament_tags": "Showman, operator, recruiter",
        "temperament_summary": "Runs hot, sells the future, pulls people into motion.",
        "loading_copy_zh": "正在接入他的造势节奏...",
        "loading_copy_en": "Tuning into his momentum...",
        "bio_zh": "中国互联网企业家，阿里巴巴创始人之一。",
        "bio_en": "Chinese internet entrepreneur and co-founder of Alibaba.",
        "achievements_zh": ["创办阿里巴巴", "推动支付宝生态"],
        "achievements_en": ["Co-founded Alibaba", "Helped scale Alipay's ecosystem"],
    }
    record.update(overrides)
    return record


class ValidateFigurePoolScriptTests(unittest.TestCase):
    def run_script(self, *args, cwd):
        return subprocess.run(
            ["python3", str(SCRIPT), *args],
            cwd=cwd,
            text=True,
            capture_output=True,
            check=False,
        )

    def test_accepts_valid_pool_with_existing_local_portrait(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            root = Path(tmp_dir)
            portrait = root / "public/figure-portraits/entrepreneurs/jack_ma.jpg"
            portrait.parent.mkdir(parents=True, exist_ok=True)
            portrait.write_bytes(b"fake-jpeg")

            pool = {
                "name": "Entrepreneurs",
                "description": "Internet founders",
                "records": [build_record()],
            }
            input_path = root / "src/data/figure-pools/entrepreneurs.json"
            input_path.parent.mkdir(parents=True, exist_ok=True)
            input_path.write_text(json.dumps(pool, ensure_ascii=False, indent=2))

            result = self.run_script("--input", str(input_path), cwd=root)

            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("Validation passed", result.stdout)
            self.assertIn("records=1", result.stdout)

    def test_rejects_duplicate_slug_and_missing_portrait(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            root = Path(tmp_dir)
            pool = {
                "name": "Entrepreneurs",
                "records": [
                    build_record(),
                    build_record(name="Jack Ma Copy"),
                ],
            }
            input_path = root / "src/data/figure-pools/entrepreneurs.json"
            input_path.parent.mkdir(parents=True, exist_ok=True)
            input_path.write_text(json.dumps(pool, ensure_ascii=False, indent=2))

            result = self.run_script("--input", str(input_path), cwd=root)

            self.assertNotEqual(result.returncode, 0)
            self.assertIn("duplicate slug", result.stderr.lower())
            self.assertIn("missing portrait", result.stderr.lower())


if __name__ == "__main__":
    unittest.main()
