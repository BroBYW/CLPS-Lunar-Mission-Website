import type { SiteGroup } from './load.ts'

export const GROUP_LABELS: Record<SiteGroup, string> = {
  artemis: 'Artemis candidate regions',
  illumination: 'High-illumination points',
  clps: 'CLPS landing sites',
  contrast: 'Permanent shadow',
  pin: 'Dropped pin',
}

export const GROUP_ORDER: SiteGroup[] = ['pin', 'illumination', 'artemis', 'clps', 'contrast']
