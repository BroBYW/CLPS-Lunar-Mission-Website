"""Ephemeris generation (SPICE) and the browser-equivalent reader (float32 file + linear interpolation)."""

import json
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import spiceypy as sp

from .paths import WEB_DATA_DIR

START_UTC = "2026-01-01T00:00:00"
END_UTC = "2031-01-01T00:00:00"
STEP_S = 3600
FRAME, ABCORR, OBSERVER = "MOON_ME", "LT+S", "MOON"

EPHEMERIS_BIN = WEB_DATA_DIR / "ephemeris.bin"
EPHEMERIS_JSON = WEB_DATA_DIR / "ephemeris.json"


def utc_grid(start: str = START_UTC, end: str = END_UTC, step_s: int = STEP_S) -> np.ndarray:
    t0, t1 = np.datetime64(start, "s"), np.datetime64(end, "s")
    n = int((t1 - t0) / np.timedelta64(step_s, "s")) + 1
    return t0 + np.arange(n) * np.timedelta64(step_s, "s")


def utc_to_et(times: np.ndarray) -> np.ndarray:
    """datetime64 (UTC) -> ephemeris time (TDB seconds past J2000), leap seconds from the LSK."""
    return np.array([sp.str2et(str(t.astype("datetime64[ms]"))) for t in np.atleast_1d(times)])


def body_vectors(ets: np.ndarray, target: str) -> np.ndarray:
    """Moon-centered apparent position of target in MOON_ME (km), shape (N, 3). Kernels must be loaded."""
    pos, _ = sp.spkpos(target, np.atleast_1d(ets), FRAME, ABCORR, OBSERVER)
    return np.atleast_2d(np.asarray(pos, dtype=np.float64))


def ms_since_epoch(times: np.ndarray) -> np.ndarray:
    return np.atleast_1d(times).astype("datetime64[ms]").astype(np.int64).astype(np.float64)


@dataclass
class Ephemeris:
    """Mirror of web/src/lib/astro.ts Ephemeris: float32 samples, float64 linear interpolation."""

    t0_ms: float
    step_ms: float
    data: np.ndarray  # (count, 6) float32: sun xyz, earth xyz (km)

    @classmethod
    def load(cls, bin_path: Path = EPHEMERIS_BIN, json_path: Path = EPHEMERIS_JSON) -> "Ephemeris":
        meta = json.loads(json_path.read_text())
        data = np.fromfile(bin_path, dtype="<f4").reshape(meta["count"], 6)
        t0 = float(np.datetime64(meta["t0_utc"].rstrip("Z"), "ms").astype(np.int64))
        return cls(t0_ms=t0, step_ms=meta["step_s"] * 1000.0, data=data)

    def sample(self, t_ms: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        """Interpolated (sun, earth) vectors, each (N, 3) float64, for UTC milliseconds since 1970."""
        t_ms = np.atleast_1d(np.asarray(t_ms, dtype=np.float64))
        count = self.data.shape[0]
        f = np.clip((t_ms - self.t0_ms) / self.step_ms, 0.0, count - 1.0)
        k = np.minimum(np.floor(f).astype(np.int64), count - 2)
        w = (f - k)[:, None]
        a = self.data[k].astype(np.float64)
        b = self.data[k + 1].astype(np.float64)
        v = a + w * (b - a)
        return v[:, 0:3], v[:, 3:6]
