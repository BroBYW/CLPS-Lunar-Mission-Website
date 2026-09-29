"""M0 check: read a 1 km window of the PGDA 10 m COG over HTTP without downloading the 5 GB file."""

import numpy as np
import rasterio
from rasterio.windows import from_bounds

from clps.dem import GDAL_HTTP_ENV, PGDA_10M_URL
from clps.geometry import polar_stereo


def main() -> None:
    x, y = polar_stereo(np.array(-89.4398), np.array(-137.17))  # Connecting ridge (Gläser C1)
    x, y = float(x), float(y)
    with rasterio.Env(**GDAL_HTTP_ENV), rasterio.open("/vsicurl/" + PGDA_10M_URL) as ds:
        print("crs:      ", ds.crs.to_proj4())
        print("size:     ", ds.width, "x", ds.height, "res", ds.res, ds.dtypes[0], "nodata", ds.nodata)
        print("bounds:   ", ds.bounds)
        print("overviews:", ds.overviews(1))
        win = from_bounds(x - 500, y - 500, x + 500, y + 500, ds.transform)
        a = ds.read(1, window=win)
    print("window:   ", a.shape, f"height range {np.nanmin(a):.1f} .. {np.nanmax(a):.1f} m")


if __name__ == "__main__":
    main()
