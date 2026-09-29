import yaml

from .paths import PIPELINE_DIR


def load_sites() -> list[dict]:
    return yaml.safe_load((PIPELINE_DIR / "sites.yaml").read_text(encoding="utf-8"))["sites"]


def load_validation_points() -> tuple[dict, list[dict]]:
    doc = yaml.safe_load((PIPELINE_DIR / "validation_points.yaml").read_text(encoding="utf-8"))
    return doc["studies"], doc["points"]
