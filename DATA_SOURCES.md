# Data sources

Everything the app shows comes from the sources below. File names, sizes and parameters were verified on 29 Sep 2026. The derived files in `web/public/data/` are produced by the scripts in `pipeline/scripts/`. Raw elevation maps and SPICE kernels are downloaded by those scripts and never committed.

## Ephemeris: NASA NAIF SPICE

The kernels come from the [NAIF generic kernels](https://naif.jpl.nasa.gov/pub/naif/generic_kernels/) (NASA/JPL Navigation and Ancillary Information Facility).

| File | Size | Role |
|---|---|---|
| `lsk/naif0012.tls` | 5,257 B | Leap seconds. Current until at least 2027-07-01; later dates assume no new leap seconds. |
| `pck/pck00011.tpc` | 131,226 B | Body radii (Moon: 1737.4 km sphere) |
| `spk/planets/de440s.bsp` | 32,726,016 B | Sun, Earth and Moon positions (DE440, 1849–2150) |
| `pck/moon_pa_de440_200625.bpc` | 12,863,488 B | Lunar orientation, DE440 principal-axis frame (1550–2650) |
| `fk/satellites/moon_de440_250416.tf` | 19,478 B | Lunar frames. `MOON_ME` is an alias of `MOON_ME_DE440_ME421`, the mean-Earth/polar-axis frame that LOLA products use. |

Software: [SpiceyPy](https://github.com/AndrewAnnex/SpiceyPy) 8.2.0 (MIT), which bundles CSPICE N0067.

Citations:
- Acton, C. H. (1996), Ancillary data services of NASA's Navigation and Ancillary Information Facility, *Planetary and Space Science* 44, 65–70.
- Park, R. S., et al. (2021), The JPL Planetary and Lunar Ephemerides DE440 and DE441, *Astronomical Journal* 161, 105.
- Annex, A. M., et al. (2020), SpiceyPy: a Pythonic wrapper for the SPICE Toolkit, *Journal of Open Source Software* 5(46), 2050.

## Validation references

- [JPL Horizons API](https://ssd-api.jpl.nasa.gov/doc/horizons.html), with a topocentric observer on the Moon (`CENTER='coord@301'`). The pipeline sends requests one at a time, caches the responses in `pipeline/validation/cache/` and sets its own User-Agent.
- [NAIF WebGeocalc API](https://wgc2.jpl.nasa.gov/webgeocalc/documents/api-info.html), used as a second reference.

## Topography: LRO LOLA

All of these maps are LOLA heights in metres above the 1737.4 km sphere, in a south polar stereographic projection (`+proj=stere +lat_0=-90 +lat_ts=-90 +lon_0=0 +R=1737400`) and the DE421 mean-Earth frame.

| Product | Resolution and extent | How we use it |
|---|---|---|
| PGDA `LDEM_83S_10MPP_ADJ.TIF` ([product 90](https://pgda.gsfc.nasa.gov/products/90)) | 10 m, ±216.4 km, 5.1 GB cloud-optimized GeoTIFF | ±30 km window around each site, read over HTTP range requests |
| PGDA `LDEM_80S_80MPP_ADJ.TIF` | 80 m, ±304 km, 189 MB | Far terrain, downloaded whole |
| PGDA `LDEM_60S_240MPP_ADJ.TIF` | 240 m, ±931.2 km, 219 MB | Farthest terrain, downloaded whole |
| PGDA `AVGVISIB_85S_060M_201608.TIF` and `..._EARTH.TIF` ([product 69](https://pgda.gsfc.nasa.gov/products/69)) | 60 m, 85°S to the pole | Validation of illumination and Earth visibility; optional map overlay |
| PDS [LOLA polar GDRs](https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/) | 5–240 m | Backup only |

**Derived terrain for the 3D views** (`pipeline/scripts/terrain_patches.py`, `web/public/data/terrain/`): for each site, three 401 × 401 height grids centred on it, sampled from the same tiers as the horizon masks. They are 30 m spacing to ±6 km (point samples), 240 m to ±48 km (mean of 3 × 3 samples per node) and 1.5 km to ±300 km (mean of 5 × 5). About 400 kB per site, 5.3 MB in all. They are cropped, downsampled grids, not the raw maps.

Citations:
- Smith, D. E., et al. (2010), The Lunar Orbiter Laser Altimeter investigation on the Lunar Reconnaissance Orbiter mission, *Space Science Reviews* 150, 209–241.
- Barker, M. K., et al. (2023), *Planetary Science Journal* 4, 183, doi:10.3847/PSJ/acf3e1. Data: doi:10.60903/gsfcpgda-lola-spole.
- Barker, M. K., et al. (2021), *Planetary and Space Science*, doi:10.1016/j.pss.2020.105119 (5 m site maps).
- Mazarico, E., et al. (2011), Illumination conditions of the lunar polar regions using LOLA topography, *Icarus* 211, 1066–1081, doi:10.1016/j.icarus.2010.10.030.

## Imagery

- [NASA Moon Trek](https://trek.nasa.gov/moon/) (NASA/JPL-Caltech Solar System Treks). The WMTS layers used are the global `LRO_WAC_Mosaic_Global_303ppd_v02` and the south polar `LRO_LOLA_ClrShade_SPole75_30mp_v04` and `LRO_NAC_Mosaic_SPole85.5_1mp`. Layer metadata says "Use_Constraints: None". Credits: LOLA Instrument Team (NASA GSFC), the LROC Team (NASA/GSFC/Arizona State University), and NASA's Lunar Mapping and Modeling Project.
- Earth texture for the 3D views: [Natural Earth](https://www.naturalearthdata.com/) II by Tom Patterson (public domain), the level-2 tiles bundled with CesiumJS, stitched into one 1024 × 512 image by `pipeline/scripts/earth_texture.py`.
- 3D views render with [CesiumJS](https://cesium.com/platform/cesiumjs/) 1.145 (Apache-2.0), using the Moon ellipsoid and the Moon Trek WAC mosaic. No Cesium ion content is used, so no token is needed.
- Optional Cesium Moon (Cesium ion asset 2684829), not enabled by default. If an ion token is configured, credit it as "NASA and the USGS Astrogeology Science Center", plus the Cesium ion logo.

## Sites

The list, with each site's source and its exact or approximate label, is in `pipeline/sites.yaml`; the points actually used are in `pipeline/sites_resolved.json`. For a region, the approximate point is the highest LOLA point inside its footprint. The footprints are the 2022 list served by Moon Trek, which covers six of the nine 2024 regions. Where a region has no footprint, the point is the highest within 7.5 km of its LROC mosaic center. The USGS data release with the 2024 footprints blocks automated downloads (HTTP 403), so Slater Plain is on hold until someone downloads that file by hand.

- Artemis candidate landing regions:
  - [NASA, Oct 2024](https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/)
  - [NASA, May 2026: Artemis III becomes an Earth-orbit test and Artemis IV the first landing](https://www.nasa.gov/missions/artemis/artemis-3/nasa-outlines-preliminary-artemis-iii-mission-plans/)
  - Official footprints: USGS data release, McClernan (2024), [doi:10.5066/P1MEQ6UK](https://www.usgs.gov/data/down-selected-artemis-iii-candidate-landing-site-navigational-grids)
  - Polygons served by [Moon Trek](https://trek.nasa.gov/moon/trekarcgis2/rest/services/A3_Named_regions_SP/MapServer/0)
- [LROC NAC region-of-interest mosaics](https://pds.lroc.im-ldi.com/data/LRO-L-LROC-5-RDR-V1.0/LROLRC_2001/DATA/BDR/NAC_ROI/): mosaic centers used as region anchors.
- [IAU Gazetteer of Planetary Nomenclature](https://planetarynames.wr.usgs.gov/) (USGS): feature centers.
- IM-2 Athena landing site: [LROC](https://lroc.im-ldi.com/images/1408).
- VIPER mission area: *Planetary Science Journal*, [doi:10.3847/PSJ/ae061a](https://iopscience.iop.org/article/10.3847/PSJ/ae061a). Re-manifest on Blue Origin: [NASA](https://www.nasa.gov/news-release/nasa-selects-blue-origin-to-deliver-viper-rover-to-moons-south-pole/).
- ESA Leibnitz β Plateau region of interest: [arXiv:1208.5587](https://arxiv.org/abs/1208.5587), Table 2.

## Illumination literature (validation)

- Bussey, D. B. J., et al. (2010), Illumination conditions of the south pole of the Moon derived using Kaguya topography, *Icarus* 208, 558–564. [PDF](https://spudislunarresources.nss.org/Bibliography/p/98.pdf)
- Mazarico, E., et al. (2011), *Icarus* 211, 1066–1081 (see above).
- Speyerer, E. J., and M. S. Robinson (2013), Persistently illuminated regions at the lunar poles: Ideal sites for future exploration, *Icarus* 222, 122–136. [LEAG 2014 summary](https://www.hou.usra.edu/meetings/leag2014/pdf/3066.pdf)
- Gläser, P., et al. (2014), Illumination conditions at the lunar south pole using high resolution Digital Terrain Models from LOLA, *Icarus* 243, 78–90. [EPSC abstract with spot coordinates](https://elib.dlr.de/94242/1/EPSC2014-136-1.pdf)
- Gläser, P., et al. (2018), Illumination conditions at the lunar poles: Implications for future exploration, *Planetary and Space Science* 162, 170–178. [NTRS copy](https://ntrs.nasa.gov/api/citations/20170007365/downloads/20170007365.pdf)
- Bryant, S. (2009), Lunar pole illumination and communications maps computed from GSSR elevation data, *IPN Progress Report* 42-176. [PDF](https://ipnpr.jpl.nasa.gov/progress_report/42-176/176C.pdf)
