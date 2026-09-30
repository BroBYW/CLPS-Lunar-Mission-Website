import { useId } from 'react'
import { GROUP_LABELS, GROUP_ORDER } from '../data/groups.ts'
import type { Site } from '../data/load.ts'

/** A labelled drop-down of the sites, grouped as in the site list. */
export function SitePicker({
  label,
  sites,
  value,
  onChange,
  allowNone = false,
  className = '',
}: {
  label: string
  sites: Site[]
  value: string
  onChange: (id: string) => void
  allowNone?: boolean
  className?: string
}) {
  const id = useId()
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-xs text-dust">
        {label}
      </label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 w-full rounded-sm border border-regolith bg-sky px-2 py-1.5 text-sm">
        {allowNone && <option value="">None</option>}
        {GROUP_ORDER.map((g) => (
          <optgroup key={g} label={GROUP_LABELS[g]}>
            {sites
              .filter((s) => s.group === g)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </optgroup>
        ))}
      </select>
    </div>
  )
}
