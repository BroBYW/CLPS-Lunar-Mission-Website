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
const LABEL_FONT = '15px "Atkinson Hyperlegible Next Variable", sans-serif'
const EARTH_RADII = new Cesium.Cartesian3(6_378_137, 6_378_137, 6_356_752.3142)
const R_SUN_M = 695_700_000
/** The Sun is drawn this far from the camera (beyond the Earth), in its true direction. */
const SUN_DRAW_M = 4.5e8
/** Share of the Sun image's half-width taken by the disk; the rest is glow. */
const SUN_DISK = 0.14
/** The disk keeps its true angular size (0.53°) but never shrinks below this radius, in pixels. */
const SUN_MIN_PX = 2.5

// Natural Earth II lit by the Sun: day side, a soft terminator, a dark night side and a thin blue limb
const EARTH_SOURCE = /* glsl */ `
czm_material czm_getMaterial(czm_materialInput materialInput) {
  czm_material m = czm_getDefaultMaterial(materialInput);
  vec3 n = normalize(materialInput.normalEC);
  vec3 v = normalize(materialInput.positionToEyeEC);
  float d = dot(n, czm_lightDirectionEC);
  vec3 c = texture(image, materialInput.st).rgb;
  float day = smoothstep(-0.06, 0.2, d);
  float limb = pow(1.0 - max(dot(n, v), 0.0), 2.5) * smoothstep(-0.25, 0.3, d);
  m.diffuse = vec3(0.0);
  m.emission = c * (0.012 + 1.15 * day * (0.3 + 0.7 * max(d, 0.0))) + vec3(0.3, 0.52, 1.0) * 0.5 * limb;
  m.alpha = 1.0;
  return m;
}
`

function sunImage(): HTMLCanvasElement {
  const size = 256
  const r = size / 2
  const disk = r * SUN_DISK
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')!
  const glow = ctx.createRadialGradient(r, r, disk * 0.9, r, r, r)
  glow.addColorStop(0, 'rgba(255, 228, 176, 0.85)')
  glow.addColorStop(0.08, 'rgba(255, 214, 150, 0.4)')
  glow.addColorStop(0.3, 'rgba(255, 196, 110, 0.12)')
  glow.addColorStop(1, 'rgba(255, 180, 80, 0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, size, size)
  // Limb darkening
  const face = ctx.createRadialGradient(r, r, 0, r, r, disk)
  face.addColorStop(0, '#fffdf7')
  face.addColorStop(0.75, '#fff2d2')
  face.addColorStop(1, '#ffd98f')
  ctx.fillStyle = face
  ctx.beginPath()
  ctx.arc(r, r, disk, 0, Math.PI * 2)
  ctx.fill()
  return c
}

export interface MoonViewer {
  viewer: Cesium.Viewer
  /** Sun position relative to the Moon, MOON_ME km (the first three ephemeris values). */
  setSun: (sunKm: ArrayLike<number>) => void
  /** Earth position relative to the Moon, MOON_ME km, and the time (UTC ms) for its rotation. */
  setEarth: (earthKm: ArrayLike<number>, timeMs: number) => void
  /** Resolves once the Moon can be drawn: at once for the globe, after its texture loads for the model. */
  ready: Promise<void>
  destroy: () => void
}

/** `model`: draw the NASA SVS Moon model instead of the streamed Moon Trek globe (no polar cap, no terrain). */
export function createMoonViewer(
  container: HTMLElement,
  opts: { interactive: boolean; showBodies: boolean; model?: boolean },
): MoonViewer {
  Cesium.Ellipsoid.default = Cesium.Ellipsoid.MOON
  const imagery = new Cesium.UrlTemplateImageryProvider({
    url: MOON_TREK_WAC,
    tilingScheme: new Cesium.GeographicTilingScheme({ ellipsoid: Cesium.Ellipsoid.MOON }),
    maximumLevel: 8,
    credit: new Cesium.Credit(MOON_TREK_CREDIT),
  })
  const viewer = new Cesium.Viewer(container, {
    baseLayer: opts.model ? false : new Cesium.ImageryLayer(imagery),
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
    // Draw at the screen's own resolution (Cesium's default halves it on high-DPI screens), capped at 2×
    useBrowserRecommendedResolution: false,
  })
  viewer.resolutionScale = Math.min(1, 2 / (window.devicePixelRatio || 1))
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
    // The page may have moved on, destroying the viewer, before these timers fire
    if (viewer.isDestroyed()) return
    globe.enableLighting = false
    scene.requestRender()
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (viewer.isDestroyed()) return
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
  let ready = Promise.resolve()
  if (opts.model) {
    // The camera still works against the ellipsoid; only the globe's drawing is off
    globe.show = false
    ready = addMoonModel(viewer)
  }

  if (!opts.interactive) {
    const c = scene.screenSpaceCameraController
    c.enableInputs = false
  }

  const sunDir = new Cesium.Cartesian3(1, 0, 0)
  let sunDistM = 1.496e11
  const bodies = opts.showBodies ? addBodies(viewer, sunDir, () => sunDistM) : null

  return {
    viewer,
    ready,
    setSun(sunKm) {
      const d = Math.hypot(sunKm[0], sunKm[1], sunKm[2])
      sunDistM = d * 1000
      Cesium.Cartesian3.fromElements(sunKm[0] / d, sunKm[1] / d, sunKm[2] / d, sunDir)
      light.direction = Cesium.Cartesian3.negate(sunDir, new Cesium.Cartesian3())
      scene.requestRender()
    },
    setEarth(earthKm, timeMs) {
      bodies?.setEarth(earthKm, timeMs)
      scene.requestRender()
    },
    destroy() {
      bodies?.destroy()
      if (!viewer.isDestroyed()) viewer.destroy()
    },
  }
}

export const MOON_MODEL_CREDIT = 'Moon model: NASA SVS 14959, Moon 3D Models for Web, AR, and Animation (NASA Goddard Space Flight Center)'

/** Vertex radius of the SVS model's cube-sphere, in model units. */
const MODEL_RADIUS = 1.2719
/**
 * Rotation from the model's glTF frame to MOON_ME (north = glTF +Y, 0° meridian = glTF −Z, 90°E = glTF −X). Found by
 * matching the model's texture to the Moon Trek WAC mosaic over all 24 axis-aligned rotations: correlation 0.70
 * against 0.14 for the runner-up, best within 1° of longitude.
 */
const MODEL_ORIENTATION = new Cesium.Matrix3(0, 0, -1, -1, 0, 0, 0, 1, 0)

/** The NASA SVS Moon model with LOLA relief (public/data/moon.glb, from scripts/compress-moon-model.mjs), lunar-sized, at the center. */
async function addMoonModel(viewer: Cesium.Viewer): Promise<void> {
  const r = Cesium.Ellipsoid.MOON.radii.x / MODEL_RADIUS
  const model = await Cesium.Model.fromGltfAsync({
    url: `${import.meta.env.BASE_URL}data/moon.glb`,
    modelMatrix: Cesium.Matrix4.fromRotationTranslation(
      Cesium.Matrix3.multiplyByScalar(MODEL_ORIENTATION, r, new Cesium.Matrix3()),
      Cesium.Cartesian3.ZERO,
    ),
    // Z-up and X-forward switch off Cesium's own glTF axis correction; MODEL_ORIENTATION does it all
    upAxis: Cesium.Axis.Z,
    forwardAxis: Cesium.Axis.X,
    credit: new Cesium.Credit(MOON_MODEL_CREDIT),
    allowPicking: false,
    // Ready only with the texture, so it never shows as a plain grey ball
    incrementallyLoadTextures: false,
  })
  // No sky light in space: only the Sun lights the surface
  model.imageBasedLighting.imageBasedLightingFactor = new Cesium.Cartesian2(0, 0)
  if (viewer.isDestroyed()) return model.destroy()
  viewer.scene.primitives.add(model)
  // The model loads during renders, which request-render mode only runs on demand
  const tick = viewer.clock.onTick.addEventListener(() => viewer.scene.requestRender())
  await new Promise<void>((resolve) => model.readyEvent.addEventListener(() => resolve()))
  tick()
  viewer.scene.requestRender()
}

const t1 = new Cesium.Cartesian3()
const t2 = new Cesium.Cartesian3()
const t3 = new Cesium.Cartesian3()

/** Orthonormal axes from two directions (first along a, second along a × b), as columns; false if nearly parallel. */
function triad(a: Cesium.Cartesian3, b: Cesium.Cartesian3, out: Cesium.Matrix3): boolean {
  Cesium.Cartesian3.normalize(a, t1)
  Cesium.Cartesian3.cross(t1, Cesium.Cartesian3.normalize(b, t3), t2)
  if (Cesium.Cartesian3.magnitude(t2) < 0.02) return false
  Cesium.Cartesian3.normalize(t2, t2)
  Cesium.Cartesian3.cross(t1, t2, t3)
  Cesium.Matrix3.setColumn(out, 0, t1, out)
  Cesium.Matrix3.setColumn(out, 1, t2, out)
  Cesium.Matrix3.setColumn(out, 2, t3, out)
  return true
}

/**
 * The Earth as a textured, Sun-lit sphere at its true position, turning with the time, and the Sun as a glowing
 * disk drawn in its true direction from wherever the camera is (so it lines up with the skyline when standing).
 */
function addBodies(viewer: Cesium.Viewer, sunDir: Cesium.Cartesian3, sunDist: () => number) {
  const scene = viewer.scene
  const earthPos = new Cesium.Cartesian3(3.8e8, 0, 0)
  const earth = scene.primitives.add(
    new Cesium.Primitive({
      geometryInstances: new Cesium.GeometryInstance({
        geometry: new Cesium.EllipsoidGeometry({
          radii: EARTH_RADII,
          stackPartitions: 64,
          slicePartitions: 128,
          vertexFormat: Cesium.MaterialAppearance.MaterialSupport.TEXTURED.vertexFormat,
        }),
      }),
      appearance: new Cesium.MaterialAppearance({
        material: new Cesium.Material({
          fabric: { uniforms: { image: `${import.meta.env.BASE_URL}data/earth.jpg` }, source: EARTH_SOURCE },
          translucent: false,
        }),
        materialSupport: Cesium.MaterialAppearance.MaterialSupport.TEXTURED,
        flat: true,
        faceForward: false,
        translucent: false,
        closed: true,
      }),
      modelMatrix: Cesium.Matrix4.fromTranslation(earthPos),
      asynchronous: false,
      allowPicking: false,
    }),
  ) as Cesium.Primitive

  const billboards = scene.primitives.add(new Cesium.BillboardCollection()) as Cesium.BillboardCollection
  const sun = billboards.add({ image: sunImage(), width: 1, height: 1, position: new Cesium.Cartesian3() })
  const labels = scene.primitives.add(new Cesium.LabelCollection()) as Cesium.LabelCollection
  const labelStyle = {
    font: LABEL_FONT,
    verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
    outlineColor: Cesium.Color.BLACK,
    outlineWidth: 3,
    style: Cesium.LabelStyle.FILL_AND_OUTLINE,
  }
  const earthLabel = labels.add({
    ...labelStyle,
    text: 'Earth',
    fillColor: Cesium.Color.fromCssColorString(EARTH_COLOR),
    position: earthPos,
    eyeOffset: new Cesium.Cartesian3(0, 0, -1.2 * EARTH_RADII.x),
  })
  const sunLabel = labels.add({
    ...labelStyle,
    text: 'Sun',
    fillColor: Cesium.Color.fromCssColorString(SUN_COLOR),
    position: new Cesium.Cartesian3(),
    eyeOffset: new Cesium.Cartesian3(0, 0, -0.01 * SUN_DRAW_M),
  })

  const p = new Cesium.Cartesian3()
  const remove = scene.preRender.addEventListener(() => {
    const cam = viewer.camera
    Cesium.Cartesian3.add(cam.positionWC, Cesium.Cartesian3.multiplyByScalar(sunDir, SUN_DRAW_M, p), p)
    sun.position = p
    sunLabel.position = p
    // Sized in pixels from the angular radius: true size, with a floor so it never vanishes
    const fovy = (cam.frustum as Cesium.PerspectiveFrustum).fovy || Math.PI / 3
    const pxPerRad = viewer.canvas.clientHeight / fovy
    const diskPx = Math.max(SUN_MIN_PX, Math.asin(Math.min(1, R_SUN_M / sunDist())) * pxPerRad)
    sun.width = sun.height = (2 * diskPx) / SUN_DISK
    // Labels sit just above each disk, whatever the zoom
    sunLabel.pixelOffset = new Cesium.Cartesian2(0, -(diskPx * 2.2 + 6))
    const earthRadius = Math.asin(Math.min(1, EARTH_RADII.x / Cesium.Cartesian3.distance(earthPos, cam.positionWC)))
    earthLabel.pixelOffset = new Cesium.Cartesian2(0, -(earthRadius * pxPerRad + 6))
  })

  const icrfToMoon = Cesium.Matrix3.clone(Cesium.Matrix3.IDENTITY)
  const temeToEarth = new Cesium.Matrix3()
  const rot = new Cesium.Matrix3()
  const frameI = new Cesium.Matrix3()
  const frameM = new Cesium.Matrix3()
  const moonI = new Cesium.Cartesian3()
  const sunI = new Cesium.Cartesian3()
  return {
    setEarth(earthKm: ArrayLike<number>, timeMs: number) {
      Cesium.Cartesian3.fromElements(earthKm[0] * 1000, earthKm[1] * 1000, earthKm[2] * 1000, earthPos)
      const jd = Cesium.JulianDate.fromDate(new Date(timeMs))
      // ICRF to Moon-fixed, from the Sun and Earth directions known in both frames: Cesium's approximate
      // positions (within 0.2° of the ephemeris here) and the ephemeris itself. Cesium's own Moon-fixed model
      // disagrees with MOON_ME by tens of degrees. When the two directions nearly line up (eclipses), the
      // last good rotation is kept.
      Cesium.Simon1994PlanetaryPositions.computeMoonPositionInEarthInertialFrame(jd, moonI)
      Cesium.Simon1994PlanetaryPositions.computeSunPositionInEarthInertialFrame(jd, sunI)
      Cesium.Cartesian3.subtract(sunI, moonI, sunI)
      Cesium.Cartesian3.negate(moonI, moonI)
      if (triad(moonI, sunI, frameI) && triad(earthPos, sunDir, frameM)) {
        Cesium.Matrix3.multiply(frameM, Cesium.Matrix3.transpose(frameI, frameI), icrfToMoon)
      }
      // Earth-fixed to TEME, treated as ICRF (the 0.4° difference is invisible at this size)
      Cesium.Transforms.computeTemeToPseudoFixedMatrix(jd, temeToEarth)
      Cesium.Matrix3.multiply(icrfToMoon, Cesium.Matrix3.transpose(temeToEarth, rot), rot)
      earth.modelMatrix = Cesium.Matrix4.fromRotationTranslation(rot, earthPos, earth.modelMatrix)
      earthLabel.position = earthPos
    },
    destroy() {
      remove()
    },
  }
}

/**
 * Our LOLA hillshade of 80 S to the pole, draped over the mosaic (which streaks near the pole). It comes as a western
 * and an eastern half, 4096 × 2048 each, as no texture may be wider than 4096 px on some phones.
 */
export async function addPolarCap(viewer: Cesium.Viewer): Promise<void> {
  const credit = new Cesium.Credit('South polar relief: LRO LOLA (NASA GSFC PGDA, Barker et al. 2023)')
  const halves = [
    ['w', -180, 0],
    ['e', 0, 180],
  ] as const
  const providers = await Promise.all(
    halves.map(([half, west, east]) =>
      Cesium.SingleTileImageryProvider.fromUrl(`${import.meta.env.BASE_URL}data/polar-cap-south-${half}.webp`, {
        rectangle: Cesium.Rectangle.fromDegrees(west, -90, east, -80),
        credit,
      }),
    ),
  )
  if (!viewer.isDestroyed()) {
    for (const provider of providers) viewer.imageryLayers.add(new Cesium.ImageryLayer(provider))
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
