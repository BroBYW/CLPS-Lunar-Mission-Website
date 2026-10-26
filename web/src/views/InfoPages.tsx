import type { ReactNode } from 'react'

function Page({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 lg:px-6">
      <h2 className="font-display text-3xl font-medium">{title}</h2>
      <div className="mt-6 space-y-8 leading-relaxed text-bright/90 [&_a]:text-bright [&_a]:underline [&_a]:decoration-regolith [&_a]:underline-offset-2 hover:[&_a]:decoration-bright [&_h3]:font-display [&_h3]:text-xl [&_h3]:font-medium [&_li]:mt-1.5 [&_p]:mt-3 [&_p]:max-w-[68ch] [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5">
        {children}
      </div>
    </main>
  )
}

export function AboutPage() {
  return (
    <Page title="About the method">
      <section>
        <h3>What the tool computes</h3>
        <p>
          For each site and moment it answers two questions: how much of the Sun's disk is above the local terrain, and is
          Earth's center above it? Everything else, from the panorama to the battery estimate, follows from those two answers.
        </p>
      </section>
      <section>
        <h3>Sun and Earth positions</h3>
        <p>
          NASA JPL's SPICE toolkit (through SpiceyPy) gives the apparent positions of the Sun and Earth seen from the Moon's
          center, every hour from 2024 to 2031. They are corrected for light travel time and stellar aberration and expressed
          in the lunar mean-Earth/polar-axis frame (MOON_ME) that LOLA topography uses, with the DE440 ephemeris. The browser
          interpolates between hours and subtracts the site's position, then converts to azimuth and elevation in the local
          east-north-up frame.
        </p>
      </section>
      <section>
        <h3>The terrain horizon</h3>
        <p>
          From every site, 3,600 rays (one every 0.1° of azimuth) run 300 km across LRO LOLA elevation maps: 10 m resolution
          near the site, then 20 m, 80 m and 240 m farther out. Each ray records the highest elevation angle, computed on a
          1737.4 km sphere so the Moon's curvature is exact. Observers stand 2 m (a lander) or 10 m (a mast) above the ground.
        </p>
      </section>
      <section>
        <h3>Sunlight, Earth and the metrics</h3>
        <ul>
          <li>
            <strong>Sunlight</strong> is the time-averaged share of the Sun's disk above the terrain. The disk is cut into 32
            strips and each is compared with the horizon beneath it. During lunar eclipses, the part of the Sun covered by
            Earth is removed too.
          </li>
          <li>
            <strong>Darkness</strong> means at most a chosen share of the Sun is visible, 0% by default. The longest darkness is
            the longest unbroken stretch of it.
          </li>
          <li>
            <strong>Earth in view</strong> means Earth's center clears the terrain by a chosen margin, 0° by default. The
            longest blackout is the longest stretch without it.
          </li>
          <li>
            <strong>Windows</strong> are the stretches with both sunlight and Earth in view. Metrics use 10-minute steps.
          </li>
          <li>
            <strong>Power</strong> assumes a vertical panel turning to face the Sun: 1361 W/m² × (1 AU / distance)² ×
            efficiency × area × visible share × cos(elevation). The battery estimate simulates charge and discharge through
            the whole range, starting full, and reports the deepest discharge.
          </li>
        </ul>
      </section>
      <section>
        <h3>Planning tools</h3>
        <ul>
          <li>
            <strong>Find dates</strong> scores a mission starting on every day of a year at every site, with the definitions
            above but from hourly samples, so its numbers can differ slightly from the Plan view's 10-minute ones. A window
            meets your limits when its sunlight and Earth-in-view shares are high enough and its longest darkness short
            enough.
          </li>
          <li>
            <strong>Mast height</strong> uses horizon masks computed the same way for observers 2, 5, 10, 20, 30 and 50 m above
            the ground, stored to 0.01°. The height needed for a sunlight target is interpolated in a straight line between
            them.
          </li>
          <li>
            <strong>Deep Space Network contact</strong> needs Earth above the site's skyline and the Moon at least 10° above the
            horizon of one of NASA's three complexes (Goldstone, Madrid, Canberra). The Moon's elevation at each is computed
            hourly with SPICE (Earth's IAU orientation, WGS84 ellipsoid) and interpolated.
          </li>
          <li>
            <strong>Drop a pin</strong> casts a horizon in your browser for any point south of 82°S, from a 480 m grid of the
            LOLA maps, with the same geometry as the site masks. Close terrain is smoothed at that scale: at the listed sites a
            pin's sunlight is usually within 5 points of the 10 m result.
          </li>
          <li>
            <strong>Past landings</strong> replay IM-1 Odysseus and IM-2 Athena at their published landing points and times.
            The 10 m maps can't show a crater a few metres across or a tipped lander, so the numbers describe the ground
            around them.
          </li>
          <li>
            <strong>Listen</strong> plays the skyline as sound, clockwise from north over 8 seconds. The pitch rises over two
            octaves from the lowest horizon to the highest, east sounds to the right, and chimes mark the Sun and Earth: bright
            when visible, low and muffled when hidden.
          </li>
          <li>
            <strong>Rover drive</strong> moves a rover at a steady speed along the waypoints you click on the 3D terrain. Every
            10 minutes it looks along the terrain toward the Sun and toward the Earth from its position, with a camera 2 m up.
            At the sites themselves this agrees with the horizon masks 99.8% of the time. Farther out the terrain is coarser,
            as in the 3D view.
          </li>
          <li>
            <strong>3D print</strong> files are the 3D view's terrain grids, every second point, as a watertight solid in
            millimetres. Heights are measured from the reference sphere, so the Moon's curvature is taken out.
          </li>
        </ul>
      </section>
      <section>
        <h3>The 3D views</h3>
        <p>
          Around each site, the 3D view draws LOLA terrain from six nested grids: 7.5 m spacing to 1.5 km (from the 10 m
          map), 30 m to 6 km, 120 m to 24 km, 240 m to 48 km, 600 m to 120 km and 1.5 km to 300 km. It is lit by the Sun
          at the time shown. Shadows come from
          the terrain itself: along lines toward the Sun, a point is lit when no terrain between it and the Sun rises past
          the line to the Sun's center, so a ridge 300 km away can shade the site, as in the horizon masks. The Earth is
          drawn at its true position and size, lit by the Sun and turned to the right time of day. The Sun is drawn in its
          true direction at its true size, with a glow so it stays visible.
        </p>
        <p>
          The maps stop at 10 m, so when you stand on the ground, the detail near your feet is decorative: craters up to
          about 11 m across (many small ones, few large, most worn down, about one in ten fresh with bright ejecta), a
          gentle bumpiness, and faint light and dark patches. It only shapes the shading, to show how a low Sun catches a
          real regolith surface. It is not in the data, and it changes no shadow or number.
        </p>
      </section>
      <section>
        <h3>How we checked it</h3>
        <ul>
          <li>Sun and Earth directions match NASA JPL Horizons to within 0.00001°, and the browser matches the Python pipeline to within 0.0001°.</li>
          <li>
            Sunlight at published points on the Connecting ridge and Shackleton rim matches Gläser et al. (2014, 2018) to within
            1.5 percentage points, and the longest darkness to within about 2 hours.
          </li>
          <li>During the total lunar eclipse of 3 March 2026, the sites lose the Sun at times that fit NASA's eclipse contact times.</li>
        </ul>
        <p>
          The full validation, with every number and how to reproduce it, is in VALIDATION.md in the{' '}
          <a href="https://github.com/BroBYW/CLPS-Lunar-Mission-Website">project repository</a>.
        </p>
      </section>
      <section>
        <h3>Limitations</h3>
        <ul>
          <li>
            <strong>Terrain detail.</strong> Features smaller than about 20 m, boulders and the lander itself are not modelled.
            Ground-level results depend strongly on map resolution, which is why the tool uses 2 m and 10 m observers.
          </li>
          <li>
            <strong>Map artifacts.</strong> Near the pole, LOLA maps interpolate between laser tracks, and small artifacts can
            shift a horizon locally.
          </li>
          <li>
            <strong>Approximate points.</strong> Points for Artemis regions are approximate: the highest ground inside each
            region's footprint, not a chosen landing spot. NASA publishes footprints, not points.
          </li>
          <li>
            <strong>Earth contact is geometric.</strong> The Deep Space Network check knows where the dishes are, not their
            schedules, other missions, antenna patterns or link budgets.
          </li>
          <li>
            <strong>Earth as a disk.</strong> Earth is a solid disk 6,378 km in radius. The faint red light its atmosphere
            bends into the shadow during eclipses is ignored.
          </li>
          <li>
            <strong>Dates.</strong> Dates run from 2024 to 2030. Times are UTC; leap seconds after mid-2027 are assumed not to
            occur.
          </li>
          <li>
            <strong>Power model.</strong> It ignores dust, temperature, panel ageing and battery losses.
          </li>
          <li>
            <strong>3D terrain.</strong> Beyond 1.5 km the 3D view is coarser than the maps behind the horizon masks (grids of
            30 m to 1.5 km against maps of 10 m to 240 m), so its skyline can differ from the computed one by a fraction of
            a degree.
            The thin line in the standing view is the computed horizon that every number uses. Shadowed ground gets a faint
            fill light so its shape stays visible; in reality it is darker. The small craters and surface texture near your
            feet are decorative.
          </li>
        </ul>
      </section>
    </Page>
  )
}

export function CreditsPage() {
  return (
    <Page title="Credits">
      <section>
        <h3>Data</h3>
        <ul>
          <li>
            Ephemerides and frames: <a href="https://naif.jpl.nasa.gov/">NASA JPL NAIF</a> SPICE kernels (DE440,
            moon_pa_de440, moon_de440_250416.tf, pck00011, naif0012). Checked against{' '}
            <a href="https://ssd.jpl.nasa.gov/horizons/">JPL Horizons</a> and NAIF WebGeocalc.
          </li>
          <li>
            Topography: LRO Lunar Orbiter Laser Altimeter maps from the{' '}
            <a href="https://pgda.gsfc.nasa.gov/products/90">NASA Goddard Planetary Geodynamics Data Archive</a> (Barker et al.
            2023) and the <a href="https://pds-geosciences.wustl.edu/">PDS Geosciences Node</a>. Illumination maps from PGDA
            product 69 (Mazarico et al. 2011 method).
          </li>
          <li>
            Imagery: <a href="https://trek.nasa.gov/moon/">NASA Moon Trek</a> (NASA/JPL-Caltech), LRO WAC global mosaic (LROC
            team, NASA/GSFC/Arizona State University).
          </li>
          <li>
            Home page Moon: <a href="https://svs.gsfc.nasa.gov/14959/">Moon 3D Models for Web, AR, and Animation</a> (NASA
            Scientific Visualization Studio, ID 14959), made from LRO imagery and topography. Credit: NASA&apos;s Goddard
            Space Flight Center. Its relief comes from the LOLA global elevation map (LDEM_16, PDS Geosciences Node).
          </li>
          <li>
            Earth texture: <a href="https://www.naturalearthdata.com/">Natural Earth</a> II by Tom Patterson (public domain),
            the copy bundled with CesiumJS.
          </li>
          <li>
            Sites:{' '}
            <a href="https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/">NASA Artemis</a>{' '}
            candidate regions and their footprints (via Moon Trek), LROC NAC region mosaics and landing images, the{' '}
            <a href="https://planetarynames.wr.usgs.gov/">IAU Gazetteer of Planetary Nomenclature</a> (USGS), and the VIPER
            mission-area paper (Planetary Science Journal). Landings: IM-1 Odysseus from{' '}
            <a href="https://www.nasa.gov/missions/lro/nasas-lro-images-intuitive-machines-odysseus-lander/">NASA</a> and{' '}
            <a href="https://lroc.im-ldi.com/images/1360">LROC</a>; IM-2 Athena from <a href="https://lroc.im-ldi.com/images/1408">LROC</a>,{' '}
            <a href="https://spacepolicyonline.com/news/im-2-mission-ends-one-day-after-lunar-landing/">SpacePolicyOnline</a> and{' '}
            <a href="https://spaceflightnow.com/2025/03/07/intuitive-machines-im-2-mission-ends-with-lander-on-its-side-on-the-moon/">Spaceflight Now</a>.
          </li>
          <li>
            Deep Space Network complexes: positions of the 70 m antennas at Goldstone, Madrid and Canberra (
            <a href="https://www.nasa.gov/communicating-with-missions/dsn/">NASA DSN</a>).
          </li>
          <li>
            Validation literature: Bussey et al. 2010, Mazarico et al. 2011, Speyerer and Robinson 2013, Gläser et al. 2014 and
            2018, Bryant 2009. Eclipse times from the <a href="https://eclipse.gsfc.nasa.gov/">NASA eclipse site</a> (F. Espenak).
          </li>
        </ul>
      </section>
      <section>
        <h3>Software</h3>
        <ul>
          <li>Web: React, Vite, TypeScript, Tailwind CSS, Zustand (MIT); d3-scale and d3-time-format (ISC); Comlink and CesiumJS (Apache-2.0).</li>
          <li>Pipeline: SpiceyPy and pyproj (MIT); NumPy, SciPy and rasterio (BSD); Matplotlib; Pillow.</li>
          <li>Fonts: Jost and Atkinson Hyperlegible Next (SIL Open Font License), self-hosted through Fontsource.</li>
        </ul>
      </section>
      <section>
        <h3>About this project</h3>
        <p>
          Built for the NASA Space Apps Challenge 2026, challenge "CLPS Lunar Mission Browser". This is an independent project:
          it is not endorsed by NASA and uses no NASA logos or insignia. The code is released under the MIT License. Parts of the
          code and documentation were written with an AI assistant (Claude, by Anthropic), as disclosed in AI_USAGE.md.
        </p>
      </section>
    </Page>
  )
}
