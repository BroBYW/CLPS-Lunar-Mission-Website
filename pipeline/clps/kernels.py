"""NAIF generic kernels used by the pipeline (verified 2026-09-29, see DATA_SOURCES.md)."""

from pathlib import Path

import spiceypy as sp

from .paths import KERNEL_DIR

NAIF_BASE = "https://naif.jpl.nasa.gov/pub/naif/generic_kernels/"

# (path under NAIF_BASE, size in bytes)
KERNELS: list[tuple[str, int]] = [
    ("lsk/naif0012.tls", 5_257),
    ("pck/pck00011.tpc", 131_226),
    ("spk/planets/de440s.bsp", 32_726_016),
    ("pck/moon_pa_de440_200625.bpc", 12_863_488),
    ("fk/satellites/moon_de440_250416.tf", 19_478),
]


def kernel_path(rel: str) -> Path:
    return KERNEL_DIR / Path(rel).name


def load_kernels() -> None:
    """Load every kernel by absolute path (meta-kernel relative paths depend on the cwd)."""
    for rel, _ in KERNELS:
        path = kernel_path(rel)
        if not path.exists():
            raise FileNotFoundError(f"{path} is missing. Run: uv run python scripts/fetch_kernels.py")
        sp.furnsh(str(path))


def kernel_names() -> list[str]:
    return [Path(rel).name for rel, _ in KERNELS]
