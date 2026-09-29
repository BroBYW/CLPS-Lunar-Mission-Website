"""Download the NAIF SPICE kernels listed in clps/kernels.py (about 45.7 MB)."""

from clps.download import download
from clps.kernels import KERNELS, NAIF_BASE, kernel_path


def main() -> None:
    for rel, size in KERNELS:
        download(NAIF_BASE + rel, kernel_path(rel), expected_size=size)


if __name__ == "__main__":
    main()
