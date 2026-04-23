import json
import subprocess
import tempfile
import unittest
import zipfile
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "scripts/pack_figure_pool_zip.py"


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


class PackFigurePoolZipScriptTests(unittest.TestCase):
    def run_script(self, *args, cwd):
        return subprocess.run(
            ["python3", str(SCRIPT), *args],
            cwd=cwd,
            text=True,
            capture_output=True,
            check=False,
        )

    def test_packs_pool_json_and_portraits_into_import_zip(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            root = Path(tmp_dir)
            portrait = root / "public/figure-portraits/entrepreneurs/jack_ma.jpg"
            portrait.parent.mkdir(parents=True, exist_ok=True)
            portrait.write_bytes(b"fake-jpeg")

            source = {
                "id": "pool-1",
                "name": "Entrepreneurs",
                "description": "Internet founders",
                "origin": "imported",
                "isDefault": False,
                "createdAt": "2026-04-23T00:00:00.000Z",
                "updatedAt": "2026-04-23T00:00:00.000Z",
                "schemaVersion": 1,
                "validationSummary": {"validCount": 1, "invalidCount": 0, "errorCount": 0},
                "records": [build_record()],
            }
            input_path = root / "src/data/figure-pools/entrepreneurs.json"
            output_path = root / "src/data/figure-pools/entrepreneurs.zip"
            input_path.parent.mkdir(parents=True, exist_ok=True)
            input_path.write_text(json.dumps(source, ensure_ascii=False, indent=2))

            result = self.run_script("--input", str(input_path), "--output", str(output_path), cwd=root)

            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertTrue(output_path.exists())
            self.assertIn("Packed zip", result.stdout)

            with zipfile.ZipFile(output_path) as archive:
                self.assertIn("pool.json", archive.namelist())
                self.assertIn("portraits/jack_ma.jpg", archive.namelist())
                payload = json.loads(archive.read("pool.json"))

            self.assertEqual(payload["name"], "Entrepreneurs")
            self.assertEqual(payload["records"][0]["portrait_url"], "portraits/jack_ma.jpg")
            self.assertNotIn("id", payload)
            self.assertNotIn("origin", payload)


if __name__ == "__main__":
    unittest.main()
