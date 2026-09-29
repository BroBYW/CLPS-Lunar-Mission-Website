"""LOLA elevation maps (PGDA, Barker et al. 2023). Heights are metres above the 1737.4 km sphere."""

from .paths import USER_AGENT

PGDA_20MPP = "https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/"
PGDA_10M_URL = PGDA_20MPP + "LDEM_83S_10MPP_ADJ.TIF"  # 10 m/px, +-216.4 km, 5.1 GB COG (windows only)
PGDA_80M_URL = PGDA_20MPP + "LDEM_80S_80MPP_ADJ.TIF"  # 80 m/px, +-304 km, 189 MB
PGDA_240M_URL = PGDA_20MPP + "LDEM_60S_240MPP_ADJ.TIF"  # 240 m/px, +-931.2 km, 219 MB

GDAL_HTTP_ENV = {
    "GDAL_DISABLE_READDIR_ON_OPEN": "EMPTY_DIR",
    "CPL_VSIL_CURL_ALLOWED_EXTENSIONS": ".TIF,.tif",
    "GDAL_HTTP_USERAGENT": USER_AGENT,
    "GDAL_HTTP_MAX_RETRY": "4",
    "GDAL_HTTP_RETRY_DELAY": "2",
    "VSI_CACHE": "TRUE",
}
