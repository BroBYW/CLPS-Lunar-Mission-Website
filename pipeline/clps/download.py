"""Small, resumable-safe HTTP download helper."""

from pathlib import Path

import requests

from .paths import USER_AGENT


def download(url: str, dest: Path, expected_size: int | None = None, chunk: int = 1 << 20) -> Path:
    """Download url to dest unless a complete copy already exists. Writes to a .part file first."""
    if dest.exists() and (expected_size is None or dest.stat().st_size == expected_size):
        print(f"ok   {dest.name} (already present)")
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    part = dest.with_suffix(dest.suffix + ".part")
    with requests.get(url, stream=True, timeout=60, headers={"User-Agent": USER_AGENT}) as r:
        r.raise_for_status()
        total = int(r.headers.get("Content-Length", 0)) or expected_size
        done = 0
        with open(part, "wb") as f:
            for block in r.iter_content(chunk_size=chunk):
                f.write(block)
                done += len(block)
                if total:
                    print(f"\r...  {dest.name}: {done / 1e6:7.1f} / {total / 1e6:.1f} MB", end="", flush=True)
    print()
    size = part.stat().st_size
    if expected_size is not None and size != expected_size:
        raise IOError(f"{dest.name}: got {size} bytes, expected {expected_size}")
    part.replace(dest)
    print(f"ok   {dest.name} ({size / 1e6:.1f} MB)")
    return dest
