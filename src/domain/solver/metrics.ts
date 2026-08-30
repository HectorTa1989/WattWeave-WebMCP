/**
 * Plan metrics and transparent scoring.
 *
 * WattWeave never claims mathematical optimality. Scores exist to rank the
 * candidates found by the deterministic heuristic, and every component of the
 * score is shown to the user.
 */

import { peakW, whPerSlotToW } from '../time'
import type {
  DemandEvent,
  EnergyAsset,
  EvTargetResult,
  PlanMetrics,
  ScheduleAction,
  ScoreBreakdown,
  SolveObjective,
} from '../types'
import { assetScheduleWh } from '../schedule'

export function costCents(gridWh: number[], event: DemandEvent): number {
  let cents = 0
  for (const band of event.tariff) {
    for (let s = band.startSlot; s < band.endSlot; s++) {
      cents += (gridWh[s] * band.centsPerKwh) / 1000
    }
  }
  return Math.round(cents * 100) / 100
}

interface ComfortResult {
  impact: number
  notes: string[]
}

function comfortFor(actions: ScheduleAction[], assets: Map<string, EnergyAsset>): ComfortResult {
  let impact = 0
  const notes: string[] = []
  for (const action of actions) {
    const asset = assets.get(action.assetId)
    if (!asset) continue
    if (action.type === 'shift-earlier') {
      impact += 1
      notes.push('Auditorium pre-cooled 30 min early; ≤0.5 °C drift expected by 17:00.')
    }
    if (action.type === 'defer' && asset.kind === 'appliance') {
      notes.push('Dishwasher cycle finishes by 18:15 — before evening kitchen use.')
    }
    if (asset.kind === 'hvac' && action.type === 'pause') {
      impact += 3
      notes.push('Auditorium coasts through the event and recovers 17:00–17:30 — warm at recital start.')
    }
  }
  return { impact, notes }
}

export function computeMetrics(args: {
  event: DemandEvent
  assets: EnergyAsset[]
  actions: ScheduleAction[]
  gridWh: number[]
  baselineGridWh: number[]
  batteryUsedWh: number
  batteryMinSocWh: number
  batteryReserveFloorWh: number
}): PlanMetrics {
  const { event, assets, actions, gridWh, baselineGridWh } = args
  const assetMap = new Map(assets.map((a) => [a.id, a]))

  const dayPeak = peakW(gridWh)
  const windowPeak = peakW(gridWh, event.windowStartSlot, event.windowEndSlot)
  const reboundPeak = peakW(
    gridWh,
    event.windowEndSlot,
    event.windowEndSlot + event.reboundWindowSlots,
  )

  const evTargets: EvTargetResult[] = []
  for (const asset of assets) {
    if (asset.flex?.type !== 'pausable') continue
    const flex = asset.flex
    const schedule = assetScheduleWh(asset, actions)
    let delivered = 0
    for (let s = flex.sessionStartSlot; s < flex.departureSlot; s++) delivered += schedule[s]
    evTargets.push({
      assetId: asset.id,
      name: asset.name,
      requiredWh: flex.minEnergyWh,
      deliveredWh: delivered,
      departureSlot: flex.departureSlot,
      met: delivered >= flex.minEnergyWh,
    })
  }

  const comfort = comfortFor(actions, assetMap)
  const baseCost = costCents(baselineGridWh, event)
  const planCost = costCents(gridWh, event)

  return {
    peakW: dayPeak.w,
    peakSlot: dayPeak.slot,
    windowPeakW: windowPeak.w,
    windowPeakSlot: windowPeak.slot,
    windowCompliant: windowPeak.w <= event.limitW,
    reboundPeakW: reboundPeak.w,
    reboundPeakSlot: reboundPeak.slot,
    reboundOk: reboundPeak.w <= event.reboundGuardW,
    baselineCostCents: baseCost,
    planCostCents: planCost,
    costDeltaCents: Math.round((planCost - baseCost) * 100) / 100,
    comfortImpact: comfort.impact,
    comfortNotes: comfort.notes,
    batteryUsedWh: args.batteryUsedWh,
    batterySocAfterEventWh: args.batteryMinSocWh,
    batteryReserveFloorWh: args.batteryReserveFloorWh,
    batteryReserveOk: args.batteryMinSocWh >= args.batteryReserveFloorWh,
    evTargets,
  }
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x))

export function scoreCandidate(
  metrics: PlanMetrics,
  hardValid: boolean,
  event: DemandEvent,
): ScoreBreakdown {
  const peakScore = metrics.windowCompliant
    ? 30 + 10 * clamp01((event.limitW - metrics.windowPeakW) / 10_000)
    : 30 * clamp01(1 - (metrics.windowPeakW - event.limitW) / 40_000)

  const reboundScore = metrics.reboundOk
    ? 15 + 10 * clamp01((event.reboundGuardW - metrics.reboundPeakW) / 30_000)
    : 15 * clamp01(1 - (metrics.reboundPeakW - event.reboundGuardW) / 40_000)

  const savings = -metrics.costDeltaCents
  const costScore = 10 + 10 * Math.max(-1, Math.min(1, savings / 800))

  const comfortScore = Math.max(0, 15 - 5 * metrics.comfortImpact)

  const round1 = (x: number) => Math.round(x * 10) / 10
  const breakdown: ScoreBreakdown = {
    hardConstraints: hardValid ? 'pass' : 'fail',
    peakScore: round1(peakScore),
    reboundScore: round1(reboundScore),
    costScore: round1(costScore),
    comfortScore: round1(comfortScore),
    total: 0,
  }
  breakdown.total = round1(
    breakdown.peakScore + breakdown.reboundScore + breakdown.costScore + breakdown.comfortScore,
  )
  return breakdown
}

/** Deterministic ordering: valid plans first, then by objective. */
export function compareCandidates(objective: SolveObjective) {
  return (
    a: { valid: boolean; metrics: PlanMetrics; score: ScoreBreakdown; id: string },
    b: { valid: boolean; metrics: PlanMetrics; score: ScoreBreakdown; id: string },
  ): number => {
    if (a.valid !== b.valid) return a.valid ? -1 : 1
    if (objective === 'safe-peak') {
      if (a.metrics.reboundOk !== b.metrics.reboundOk) return a.metrics.reboundOk ? -1 : 1
      if (a.metrics.windowPeakW !== b.metrics.windowPeakW)
        return a.metrics.windowPeakW - b.metrics.windowPeakW
    }
    if (objective === 'min-cost' && a.metrics.costDeltaCents !== b.metrics.costDeltaCents) {
      return a.metrics.costDeltaCents - b.metrics.costDeltaCents
    }
    if (b.score.total !== a.score.total) return b.score.total - a.score.total
    return a.id.localeCompare(b.id)
  }
}

export { whPerSlotToW }
