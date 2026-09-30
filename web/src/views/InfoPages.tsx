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
          center, every hour from 2026 to 2031. They are corrected for light travel time and stellar aberration and expressed
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
        <h3>How we checked it</h3>
        <ul>
          <li>Sun and Earth directions match NASA JPL Horizons to within 0.00001°, and the browser matches the Python pipeline to within 0.0001°.</li>
          <li>
            Sunlight at published points on the Connecting ridge and Shackleton rim matches Gläser et al. (2014, 2018) to within
            1.5 percentage points, and the longest darkness to within about 2 hours.
          </li>
          <li>During the total lunar eclipse of 3 March 2026, the sites lose the Sun at times that fit NASA's eclipse contact times.</li>
        </ul>
        <p>The full validation, with every number and how to reproduce it, is in VALIDATION.md in the project repository.</p>
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
            <strong>Earth visibility is geometric.</strong> It doesn't check whether a Deep Space Network antenna on Earth
            can see the Moon at that moment, or model antenna patterns and link budgets.
          </li>
          <li>
            <strong>Earth as a disk.</strong> Earth is a solid disk 6,378 km in radius. The faint red light its atmosphere
            bends into the shadow during eclipses is ignored.
          </li>
          <li>
            <strong>Dates.</strong> Dates run from 2026 to 2030. Times are UTC; leap seconds after mid-2027 are assumed not to
            occur.
          </li>
          <li>
            <strong>Power model.</strong> It ignores dust, temperature, panel ageing and battery losses.
          </li>
          <li>
            <strong>3D ground view.</strong> It draws the computed skyline as a wall 4 km away. It is a faithful horizon, not
            a terrain model.
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
            Sites:{' '}
            <a href="https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/">NASA Artemis</a>{' '}
            candidate regions and their footprints (via Moon Trek), LROC NAC region mosaics and landing images, the{' '}
            <a href="https://planetarynames.wr.usgs.gov/">IAU Gazetteer of Planetary Nomenclature</a> (USGS), and the VIPER
            mission-area paper (Planetary Science Journal).
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
