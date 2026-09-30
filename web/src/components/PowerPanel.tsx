import { useId, useMemo } from 'react'
import { analyzePower } from '../lib/battery.ts'
import type { Metrics } from '../lib/metrics.ts'
import type { Series } from '../lib/series.ts'
import { useApp } from '../state/store.ts'

const kwh = (wh: number) => (wh >= 10_000 ? `${(wh / 1000).toFixed(0)} kWh` : wh >= 1000 ? `${(wh / 1000).toFixed(1)} kWh` : `${wh.toFixed(0)} Wh`)

function Field({ label, value, unit, min, max, step, onChange }: { label: string; value: number; unit: string; min: number; max: number; step: number; onChange: (v: number) => void }) {
  const id = useId()
  return (
    <div>
      <label htmlFor={id} className="block text-xs text-dust">
        {label}
      </label>
      <div className="mt-1 flex items-baseline gap-1">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(e) => {
            const v = Number(e.target.value)
            if (Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v)))
          }}
          className="w-24 rounded-sm border border-regolith bg-sky px-2 py-1 text-sm tabular"
        />
        <span className="text-xs text-dust">{unit}</span>
      </div>
    </div>
  )
}

export function PowerPanel({ series, metrics }: { series: Series | null; metrics: Metrics | null }) {
  const power = useApp((s) => s.power)
  const setPower = useApp((s) => s.setPower)
  const result = useMemo(
    () => (series && metrics ? analyzePower(series, power, metrics.longestDark.hours) : null),
    [series, metrics, power],
  )

  return (
    <section aria-label="Power and battery">
      <h3 className="font-display text-lg font-medium">Power and battery</h3>
      <p className="mt-1 max-w-prose text-xs text-dust">
        A vertical panel that turns to face the Sun: power = 1361 W/m² × (1 AU / distance)² × efficiency × area × visible
        share of the Sun × cos(Sun elevation).
      </p>
      <div className="mt-3 flex flex-wrap gap-4">
        <Field label="Panel area" value={power.areaM2} unit="m²" min={0.1} max={50} step={0.1} onChange={(areaM2) => setPower({ areaM2 })} />
        <Field label="Efficiency" value={Math.round(power.efficiency * 100)} unit="%" min={1} max={50} step={1} onChange={(v) => setPower({ efficiency: v / 100 })} />
        <Field label="Load" value={power.loadW} unit="W" min={1} max={10_000} step={5} onChange={(loadW) => setPower({ loadW })} />
        <Field label="Usable battery depth" value={Math.round(power.depthOfDischarge * 100)} unit="%" min={10} max={100} step={5} onChange={(v) => setPower({ depthOfDischarge: v / 100 })} />
      </div>
      {result && (
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm md:grid-cols-4">
          <div>
            <dt className="text-xs text-dust">Full-Sun output</dt>
            <dd className="font-display text-lg tabular">{result.peakW.toFixed(0)} W</dd>
          </div>
          <div>
            <dt className="text-xs text-dust">Energy per day, average and worst</dt>
            <dd className="font-display text-lg tabular">
              {kwh(result.meanDailyWh)} <span className="text-dust">/ {kwh(result.minDailyWh)}</span>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-dust">Battery needed (simulated)</dt>
            <dd className="font-display text-lg tabular">{kwh(result.requiredNameplateWh)}</dd>
            <dd className="text-xs text-dust">{kwh(result.requiredWh)} usable</dd>
          </div>
          <div>
            <dt className="text-xs text-dust">Load × longest darkness</dt>
            <dd className="font-display text-lg tabular">{kwh(result.simpleWh)}</dd>
            <dd className="text-xs text-dust">simple estimate, no partial sunlight</dd>
          </div>
        </dl>
      )}
      {result?.deficitGrows && (
        <p role="status" className="mt-3 max-w-prose text-sm text-alert">
          Average output ({result.meanW.toFixed(0)} W) is below the load ({power.loadW} W), so the battery drains over the
          whole range. Enlarge the panel or cut the load; a longer date range needs an ever larger battery.
        </p>
      )}
      <p className="mt-3 max-w-prose text-xs text-dust">
        The simulation starts with a full battery and steps through every 10 minutes, charging from surplus and
        discharging on deficit. It reports the deepest discharge.
      </p>
    </section>
  )
}
