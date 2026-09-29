from pathlib import Path

PIPELINE_DIR = Path(__file__).resolve().parents[1]
REPO_DIR = PIPELINE_DIR.parent
KERNEL_DIR = PIPELINE_DIR / "kernels"
RAW_DIR = PIPELINE_DIR / "raw"
VALIDATION_DIR = PIPELINE_DIR / "validation"
WEB_DATA_DIR = REPO_DIR / "web" / "public" / "data"
FIXTURE_DIR = REPO_DIR / "web" / "src" / "lib" / "__fixtures__"

USER_AGENT = "CLPS-Lunar-Mission-Browser/0.1 (NASA Space Apps 2026 data pipeline)"
