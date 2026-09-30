/**
 * Shared CesiumJS setup for the Moon (home page backdrop and the 3D view). Lazy-loaded: importing this
 * module pulls in Cesium. World coordinates are Moon-fixed, so MOON_ME vectors from the ephemeris map
 * straight in (metres = km × 1000).
 */

import * as Cesium from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'

export { Cesium }

export const MOON_TREK_WAC =
  'https://trek.nasa.gov/tiles/Moon/EQ/LRO_WAC_Mosaic_Global_303ppd_v02/1.0.0/default/default028mm/{z}/{y}/{x}.jpg'
export const MOON_TREK_CREDIT = 'Imagery: NASA Moon Trek, LRO WAC global mosaic (NASA/GSFC/Arizona State University)'

const EARTH_COLOR = '#5ab4ff'
const SUN_COLOR = '#ffc53d'

export interface MoonViewer {
  viewer: Cesium.Viewer
  setSun: (sunKm: ArrayLike<number>) => void
  setEarth: (earthKm: ArrayLike<number>) => void
  destroy: () => void
}

export function createMoonViewer(container: HTMLElement, opts: { interactive: boolean; showBodies: boolean }): MoonViewer {
  Cesium.Ellipsoid.default = Cesium.Ellipsoid.MOON
  const imagery = new Cesium.UrlTemplateImageryProvider({
    url: MOON_TREK_WAC,
    tilingScheme: new Cesium.GeographicTilingScheme({ ellipsoid: Cesium.Ellipsoid.MOON }),
    maximumLevel: 8,
    credit: new Cesium.Credit(MOON_TREK_CREDIT),
  })
  const viewer = new Cesium.Viewer(container, {
    baseLayer: new Cesium.ImageryLayer(imagery),
    terrainProvider: new Cesium.EllipsoidTerrainProvider({ ellipsoid: Cesium.Ellipsoid.MOON }),
    animation: false,
    timeline: false,
    baseLayerPicker: false,
    geocoder: false,
    homeButton: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    fullscreenButton: false,
    infoBox: false,
    selectionIndicator: false,
    skyBox: false,
    skyAtmosphere: false,
    requestRenderMode: true,
    maximumRenderTimeChange: Infinity,
  })
  const scene = viewer.scene
  scene.backgroundColor = Cesium.Color.BLACK
  scene.fog.enabled = false
  if (scene.sun) scene.sun.show = false
  if (scene.moon) scene.moon.show = false
  const globe = scene.globe
  globe.baseColor = Cesium.Color.fromCssColorString('#1a1916')
  globe.showGroundAtmosphere = false
  globe.dynamicAtmosphereLighting = false
  // Earth-scale defaults switch lighting off when the camera is within 10,000 km; the Moon needs it always on
  globe.lightingFadeOutDistance = 1
  globe.lightingFadeInDistance = 2
  // With lighting on from the start, the first tiles render black (their surface shaders keep the initial
  // state). Toggling lighting after the first tiles have loaded rebuilds them lit. The toggle must run
  // outside a render, and the "off" frame must actually be drawn before lighting comes back.
  globe.enableLighting = true
  const relight = () => {
    globe.enableLighting = false
    scene.requestRender()
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        globe.enableLighting = true
        scene.requestRender()
      }),
    )
  }
  const removeWatch = scene.postRender.addEventListener(() => {
    if (!globe.tilesLoaded) return
    removeWatch()
    setTimeout(relight, 50)
    setTimeout(relight, 1500)
  })
  const light = new Cesium.DirectionalLight({ direction: new Cesium.Cartesian3(-1, 0, 0), intensity: 2.2 })
  scene.light = light

  if (!opts.interactive) {
    const c = scene.screenSpaceCameraController
    c.enableInputs = false
  }

  let earth: Cesium.Entity | null = null
  let sunMarker: Cesium.Entity | null = null
  if (opts.showBodies) {
    earth = viewer.entities.add({
      position: new Cesium.ConstantPositionProperty(Cesium.Cartesian3.ZERO),
      ellipsoid: {
        radii: new Cesium.Cartesian3(6_378_137, 6_378_137, 6_356_752),
        material: Cesium.Color.fromCssColorString(EARTH_COLOR),
      },
      label: {
        text: 'Earth',
        font: '15px "Atkinson Hyperlegible Next Variable", sans-serif',
        fillColor: Cesium.Color.fromCssColorString(EARTH_COLOR),
        pixelOffset: new Cesium.Cartesian2(0, -28),
      },
    })
    sunMarker = viewer.entities.add({
      position: new Cesium.ConstantPositionProperty(Cesium.Cartesian3.ZERO),
      point: { pixelSize: 16, color: Cesium.Color.fromCssColorString(SUN_COLOR) },
      label: {
        text: 'Sun',
        font: '15px "Atkinson Hyperlegible Next Variable", sans-serif',
        fillColor: Cesium.Color.fromCssColorString(SUN_COLOR),
        pixelOffset: new Cesium.Cartesian2(0, -22),
      },
    })
  }

  const v = new Cesium.Cartesian3()
  return {
    viewer,
    setSun(sunKm) {
      Cesium.Cartesian3.normalize(new Cesium.Cartesian3(-sunKm[0], -sunKm[1], -sunKm[2]), v)
      light.direction = Cesium.Cartesian3.clone(v)
      if (sunMarker) {
        // Far enough that parallax from the site is negligible, near enough to stay inside the view frustum
        const dir = Cesium.Cartesian3.negate(v, new Cesium.Cartesian3())
        ;(sunMarker.position as Cesium.ConstantPositionProperty).setValue(Cesium.Cartesian3.multiplyByScalar(dir, 4.5e8, dir))
      }
      scene.requestRender()
    },
    setEarth(earthKm) {
      if (earth) {
        ;(earth.position as Cesium.ConstantPositionProperty).setValue(
          new Cesium.Cartesian3(earthKm[0] * 1000, earthKm[1] * 1000, earthKm[2] * 1000),
        )
        scene.requestRender()
      }
    },
    destroy() {
      if (!viewer.isDestroyed()) viewer.destroy()
    },
  }
}

/** Our LOLA hillshade of 80 S to the pole, draped over the mosaic (which streaks near the pole). */
export async function addPolarCap(viewer: Cesium.Viewer): Promise<void> {
  const provider = await Cesium.SingleTileImageryProvider.fromUrl(`${import.meta.env.BASE_URL}data/polar-cap-south.webp`, {
    rectangle: Cesium.Rectangle.fromDegrees(-180, -90, 180, -80),
    credit: new Cesium.Credit('South polar relief: LRO LOLA (NASA GSFC PGDA, Barker et al. 2023)'),
  })
  if (!viewer.isDestroyed()) {
    viewer.imageryLayers.add(new Cesium.ImageryLayer(provider))
    viewer.scene.requestRender()
  }
}

/**
 * Oblique view of the south pole with the Earth-facing meridian (0°) at the top and 90°E to the right,
 * matching the flat map. tiltDeg is the camera's angle away from straight down.
 */
export function viewSouthPole(viewer: Cesium.Viewer, distanceM: number, tiltDeg = 40): void {
  const t = Cesium.Math.toRadians(tiltDeg)
  const R = Cesium.Ellipsoid.MOON.radii.z
  viewer.camera.setView({
    destination: new Cesium.Cartesian3(-distanceM * Math.sin(t), 0, -R - distanceM * Math.cos(t)),
    orientation: {
      direction: new Cesium.Cartesian3(Math.sin(t), 0, Math.cos(t)),
      up: new Cesium.Cartesian3(Math.cos(t), 0, -Math.sin(t)),
    },
  })
}

/** Camera looking at the Moon's center from a direction given in selenographic degrees. */
export function viewFrom(viewer: Cesium.Viewer, latDeg: number, lonDeg: number, distanceM: number): void {
  const la = Cesium.Math.toRadians(latDeg)
  const lo = Cesium.Math.toRadians(lonDeg)
  const pos = new Cesium.Cartesian3(Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la))
  const direction = Cesium.Cartesian3.negate(pos, new Cesium.Cartesian3())
  const z = Cesium.Cartesian3.UNIT_Z
  const up = Cesium.Cartesian3.normalize(
    Cesium.Cartesian3.subtract(z, Cesium.Cartesian3.multiplyByScalar(direction, Cesium.Cartesian3.dot(z, direction), new Cesium.Cartesian3()), new Cesium.Cartesian3()),
    new Cesium.Cartesian3(),
  )
  viewer.camera.setView({
    destination: Cesium.Cartesian3.multiplyByScalar(pos, distanceM, new Cesium.Cartesian3()),
    orientation: { direction, up },
  })
}
