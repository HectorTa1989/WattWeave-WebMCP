/**
 * Pure schedule arithmetic: applying actions to baselines, computing net grid
 * demand, stacking series for the chart, and generating exact inverse schedules.
 */

import { SLOTS_PER_DAY } from './time'
import type {
  EnergyAsset,
  InverseSchedule,
  PlanCandidate,
  ScheduleAction,
  SlotIndex,
} from './types'

/** Per-asset Wh after applying a set of actions. */
export function assetScheduleWh(asset: EnergyAsset, actions: ScheduleAction[]): number[] {
  const out = asset.baselineWh.slice()
  for (const action of actions) {
    if (action.assetId !== asset.id) continue
    for (const [slotStr, delta] of Object.entries(action.deltaWh)) {
      out[Number(slotStr)] += delta
    }
  }
  return out
}

/**
 * Net grid demand per slot in Wh. Solar baselines are negative and battery
 * discharge deltas are negative, so a plain sum is the net meter reading.
 */
export function computeGridWh(assets: EnergyAsset[], actions: ScheduleAction[] = []): number[] {
  const grid = new Array<number>(SLOTS_PER_DAY).fill(0)
  for (const asset of assets) {
    const wh = actions.length ? assetScheduleWh(asset, actions) : asset.baselineWh
    for (let s = 0; s < SLOTS_PER_DAY; s++) grid[s] += wh[s]
  }
  return grid
}

export interface StackedSeries {
  key: 'critical' | 'base' | 'hvac' | 'ev' | 'appliance'
  label: string
  wh: number[]
}

export interface SupplySeries {
  key: 'solar' | 'battery'
  label: string
  /** Positive Wh supplied per slot. */
  wh: number[]
}

export interface ChartSeries {
  stacks: StackedSeries[]
  supplies: SupplySeries[]
  gridWh: number[]
}

/** Build chart-ready series (consumption stacks + on-site supply bands + net line). */
export function buildChartSeries(assets: EnergyAsset[], actions: ScheduleAction[] = []): ChartSeries {
  const zero = () => new Array<number>(SLOTS_PER_DAY).fill(0)
  const stacks: StackedSeries[] = [
    { key: 'critical', label: 'Critical', wh: zero() },
    { key: 'base', label: 'Base building', wh: zero() },
    { key: 'hvac', label: 'HVAC', wh: zero() },
    { key: 'ev', label: 'EV charging', wh: zero() },
    { key: 'appliance', label: 'Appliances', wh: zero() },
  ]
  const supplies: SupplySeries[] = [
    { key: 'solar', label: 'Solar', wh: zero() },
    { key: 'battery', label: 'Battery', wh: zero() },
  ]
  const grid = zero()

  for (const asset of assets) {
    const wh = assetScheduleWh(asset, actions)
    for (let s = 0; s < SLOTS_PER_DAY; s++) grid[s] += wh[s]

    if (asset.kind === 'solar') {
      for (let s = 0; s < SLOTS_PER_DAY; s++) supplies[0].wh[s] += Math.max(0, -wh[s])
      continue
    }
    if (asset.kind === 'battery') {
      // Discharge is on-site supply; recharge is consumption folded into the
      // base stack so the stacked total always equals the meter reading.
      for (let s = 0; s < SLOTS_PER_DAY; s++) {
        if (wh[s] < 0) supplies[1].wh[s] += -wh[s]
        else if (wh[s] > 0) stacks[1].wh[s] += wh[s]
      }
      continue
    }

    const target =
      asset.criticality === 'critical'
        ? stacks[0]
        : asset.kind === 'hvac'
          ? stacks[2]
          : asset.kind === 'ev'
            ? stacks[3]
            : asset.kind === 'appliance'
              ? stacks[4]
              : stacks[1]
    for (let s = 0; s < SLOTS_PER_DAY; s++) target.wh[s] += wh[s]
  }

  return { stacks, supplies, gridWh: grid }
}

/** Merge several sparse delta maps for the same asset into one. */
export function mergeDeltas(...deltas: Array<Record<SlotIndex, number>>): Record<SlotIndex, number> {
  const out: Record<SlotIndex, number> = {}
  for (const d of deltas) {
    for (const [slot, wh] of Object.entries(d)) {
      const s = Number(slot)
      out[s] = (out[s] ?? 0) + wh
      if (out[s] === 0) delete out[s]
    }
  }
  return out
}

/** Exact inverse: negate every delta. Integer Wh in → integer Wh out. */
export function invertActions(actions: ScheduleAction[]): ScheduleAction[] {
  return actions.map((a) => ({
    assetId: a.assetId,
    type: a.type,
    summary: `Undo: ${a.summary}`,
    deltaWh: Object.fromEntries(
      Object.entries(a.deltaWh).map(([slot, wh]) => [Number(slot), -wh]),
    ),
  }))
}

export function buildInverse(candidate: PlanCandidate, restoresToVersion: number): InverseSchedule {
  return { actions: invertActions(candidate.actions), restoresToVersion }
}
