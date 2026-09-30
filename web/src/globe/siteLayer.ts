/**
 * Sites on the 3D Moon, styled like the list and the flat map: a filled dot for a published point, a ring for
 * an approximate point, dashed outlines for region footprints. Labels show for the selected site, for the
 * site under the pointer, and for every site once the camera is close enough for them not to crowd.
 */

import type { Site } from '../data/load.ts'
import { Cesium } from './moonViewer.ts'

const BRIGHT = Cesium.Color.fromCssColorString('#ede9e1')
const SKY = Cesium.Color.fromCssColorString('#000000')
const LABEL_FONT = '13px "Atkinson Hyperlegible Next Variable", sans-serif'

export interface SiteLayer {
  select: (id: string) => void
  /** Hide the markers (for the terrain views, which draw the site themselves). */
  show: (visible: boolean) => void
  destroy: () => void
}

export function addSiteLayer(
  viewer: Cesium.Viewer,
  sites: Site[],
  opts: { onSelect: (id: string) => void; labelsWithinM?: number; selected?: string },
): SiteLayer {
  const labelsWithin = opts.labelsWithinM ?? 450_000
  const byId = new Map<string, Cesium.Entity>()
  const footprints: Cesium.Entity[] = []
  let selected = opts.selected ?? ''
  let hovered = ''

  for (const s of sites) {
    if (s.footprint_lonlat) {
      footprints.push(
        viewer.entities.add({
          polyline: {
            positions: Cesium.Cartesian3.fromDegreesArray(s.footprint_lonlat.flat()),
            clampToGround: true,
            width: 1.5,
            material: new Cesium.PolylineDashMaterialProperty({ color: BRIGHT.withAlpha(0.55), dashLength: 10 }),
          },
        }),
      )
    }
    byId.set(
      s.id,
      viewer.entities.add({
        id: `site-${s.id}`,
        name: s.name,
        position: Cesium.Cartesian3.fromDegrees(s.lon, s.lat, 0),
        point: {
          pixelSize: 9,
          color: s.kind === 'exact' ? BRIGHT : SKY,
          outlineColor: BRIGHT,
          outlineWidth: 2,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        },
        label: {
          text: s.name,
          font: LABEL_FONT,
          fillColor: BRIGHT,
          outlineColor: SKY,
          outlineWidth: 4,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          horizontalOrigin: Cesium.HorizontalOrigin.LEFT,
          verticalOrigin: Cesium.VerticalOrigin.CENTER,
          pixelOffset: new Cesium.Cartesian2(11, 0),
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        },
      }),
    )
  }

  const restyle = () => {
    for (const [id, e] of byId) {
      const isSel = id === selected
      const always = isSel || id === hovered
      e.point!.pixelSize = new Cesium.ConstantProperty(isSel ? 15 : 9)
      e.point!.outlineWidth = new Cesium.ConstantProperty(isSel ? 3 : 2)
      e.label!.distanceDisplayCondition = new Cesium.ConstantProperty(
        new Cesium.DistanceDisplayCondition(0, always ? Number.POSITIVE_INFINITY : labelsWithin),
      )
      e.label!.font = new Cesium.ConstantProperty(isSel ? `600 ${LABEL_FONT}` : LABEL_FONT)
    }
    viewer.scene.requestRender()
  }

  const siteAt = (pos: Cesium.Cartesian2): string | null => {
    const picked = viewer.scene.pick(pos) as { id?: Cesium.Entity } | undefined
    const id = picked?.id?.id
    return typeof id === 'string' && id.startsWith('site-') ? id.slice(5) : null
  }

  const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas)
  handler.setInputAction((e: { position: Cesium.Cartesian2 }) => {
    const id = siteAt(e.position)
    if (id) opts.onSelect(id)
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK)
  handler.setInputAction((e: { endPosition: Cesium.Cartesian2 }) => {
    const id = siteAt(e.endPosition) ?? ''
    if (id !== hovered) {
      hovered = id
      viewer.canvas.style.cursor = id ? 'pointer' : ''
      restyle()
    }
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE)

  restyle()
  return {
    select(id) {
      selected = id
      restyle()
    },
    show(visible) {
      for (const e of [...byId.values(), ...footprints]) e.show = visible
      viewer.scene.requestRender()
    },
    destroy() {
      handler.destroy()
      if (viewer.isDestroyed()) return
      for (const e of [...byId.values(), ...footprints]) viewer.entities.remove(e)
    },
  }
}
