/**
 * Candidate generation: three deterministic strategy templates, each built
 * from the same legal move set (steps 2–4 of the heuristic):
 *
 *   balanced      — pre-cool the auditorium, stagger EV pauses, defer the
 *                   dishwasher, use the battery only to shave the residual,
 *                   recharge gently after the rebound guard window.
 *   battery-first — hold occupant comfort exactly at baseline (no HVAC move)
 *                   and let the battery carry the window.
 *   shed-restore  — the naïve reference plan: shed hard, restore everything at
 *                   17:00. Deliberately shown so operators can SEE the rebound.
 *
 * Locked assets are never touched. Critical assets are never touched.
 */

import { kwToWhPerSlot, rangeLabel, slotLabel, slotsInRange } from '../time'
import type {
  DemandEvent,
  EnergyAsset,
  PlanCandidate,
  ScheduleAction,
  SolveInput,
} from '../types'
import { computeGridWh } from '../schedule'
import { isLocked } from './feasibility'
import { computeMetrics, scoreCandidate } from './metrics'

interface BatteryPlan {
  action: ScheduleAction | null
  rechargeAction: ScheduleAction | null
  usedWh: number
  minSocWh: number
  floorWh: number
}

function batteryAsset(input: SolveInput): EnergyAsset | null {
  const a = input.assets.find((x) => x.flex?.type === 'battery')
  return a && !isLocked(input, a) ? a : null
}

/**
 * Step 4 — dispatch the battery within power and reserve limits.
 * mode 'shave': discharge only what each window slot needs to reach
 * (limit − margin), falling back to margin 0 if power-capped.
 * mode 'dump': flat discharge across the window regardless of need (naïve).
 */
function dispatchBattery(
  input: SolveInput,
  gridPreBattery: number[],
  opts: {
    mode: 'shave' | 'dump'
    marginW: number
    dumpW?: number
    rechargeStartSlot: number
    rechargeW: number
  },
): BatteryPlan {
  const asset = batteryAsset(input)
  const event = input.event
  const empty: BatteryPlan = {
    action: null,
    rechargeAction: null,
    usedWh: 0,
    minSocWh: 0,
    floorWh: 0,
  }
  if (!asset || asset.flex?.type !== 'battery') return empty
  const spec = asset.flex
  const windowSlots = slotsInRange(event.windowStartSlot, event.windowEndSlot)
  const maxPerSlotWh = Math.round(spec.maxDischargeW / 4)
  const budgetWh = Math.max(0, spec.initialSocWh - spec.reserveFloorWh)

  const tryDispatch = (marginW: number) => {
    const delta: Record<number, number> = {}
    let remaining = budgetWh
    const targetWh = Math.round((event.limitW - marginW) / 4)
    for (const s of windowSlots) {
      const need =
        opts.mode === 'dump'
          ? Math.round((opts.dumpW ?? 0) / 4)
          : Math.max(0, gridPreBattery[s] - targetWh)
      const dis = Math.min(need, maxPerSlotWh, remaining)
      if (dis > 0) {
        delta[s] = -dis
        remaining -= dis
      }
    }
    return { delta, usedWh: budgetWh - remaining }
  }

  let { delta, usedWh } = tryDispatch(opts.marginW)
  if (opts.mode === 'shave') {
    const limitWh = Math.round(event.limitW / 4)
    const overLimit = windowSlots.some((s) => gridPreBattery[s] + (delta[s] ?? 0) > limitWh)
    if (overLimit && opts.marginW > 0) {
      ;({ delta, usedWh } = tryDispatch(0))
    }
  }
  if (usedWh === 0) return { ...empty, minSocWh: spec.initialSocWh, floorWh: spec.reserveFloorWh }

  // Recharge after rechargeStartSlot until the drawn energy is restored.
  const rechargeDelta: Record<number, number> = {}
  let toRestore = usedWh
  const perSlotCharge = Math.round(opts.rechargeW / 4)
  for (let s = opts.rechargeStartSlot; s < 96 && toRestore > 0; s++) {
    const chg = Math.min(perSlotCharge, toRestore)
    rechargeDelta[s] = chg
    toRestore -= chg
  }

  const dischargedKwh = (usedWh / 1000).toFixed(1)
  return {
    action: {
      assetId: asset.id,
      type: 'battery-discharge',
      summary: `Discharge ${dischargedKwh} kWh across ${rangeLabel(event.windowStartSlot, event.windowEndSlot)} (peak shave)`,
      deltaWh: delta,
    },
    rechargeAction: {
      assetId: asset.id,
      type: 'battery-recharge',
      summary: `Recharge ${dischargedKwh} kWh starting ${slotLabel(opts.rechargeStartSlot)} at ${opts.rechargeW / 1000} kW`,
      deltaWh: rechargeDelta,
    },
    usedWh,
    minSocWh: spec.initialSocWh - usedWh,
    floorWh: spec.reserveFloorWh,
  }
}

/** Pre-cool: shift the whole HVAC block `k` slots earlier. */
function hvacShiftAction(asset: EnergyAsset, k: number): ScheduleAction | null {
  if (asset.flex?.type !== 'shift-earlier' || k <= 0) return null
  const flex = asset.flex
  const shift = Math.min(k, flex.maxSlotsEarlier)
  const perSlot = asset.baselineWh[flex.blockStartSlot]
  const delta: Record<number, number> = {}
  for (let i = 0; i < shift; i++) {
    delta[flex.blockStartSlot - shift + i] = perSlot // new early slots
    delta[flex.blockEndSlot - shift + i] = -perSlot // cleared late slots
  }
  return {
    assetId: asset.id,
    type: 'shift-earlier',
    summary: `Pre-cool ${shift * 15} min early — run ${rangeLabel(flex.blockStartSlot - shift, flex.blockEndSlot - shift)} instead of ${rangeLabel(flex.blockStartSlot, flex.blockEndSlot)}`,
    deltaWh: delta,
  }
}

/** Naïve HVAC move: coast through the window, then boost-recover after it. */
function hvacShedRestoreAction(asset: EnergyAsset, event: DemandEvent): ScheduleAction | null {
  if (asset.flex?.type !== 'shift-earlier') return null
  const flex = asset.flex
  const perSlot = asset.baselineWh[flex.blockStartSlot]
  const delta: Record<number, number> = {}
  for (let s = event.windowStartSlot; s < Math.min(event.windowEndSlot, flex.blockEndSlot); s++) {
    delta[s] = -perSlot
  }
  delta[event.windowEndSlot] = kwToWhPerSlot(56) // boost recovery
  delta[event.windowEndSlot + 1] = perSlot
  return {
    assetId: asset.id,
    type: 'pause',
    summary: `Shed cooling ${rangeLabel(event.windowStartSlot, event.windowEndSlot)}, boost-recover at 56 kW from ${slotLabel(event.windowEndSlot)}`,
    deltaWh: delta,
  }
}

/** Pause an EV session for `pauseSlots` while checking the departure target. */
function evPauseAction(asset: EnergyAsset, pauseSlots: number[]): ScheduleAction | null {
  if (asset.flex?.type !== 'pausable' || pauseSlots.length === 0) return null
  const flex = asset.flex
  const perSlot = asset.baselineWh[flex.sessionStartSlot]
  const sessionSlots = slotsInRange(flex.sessionStartSlot, flex.sessionEndSlot)
  const neededSlots = Math.ceil(flex.minEnergyWh / perSlot)
  const maxPause = Math.min(flex.maxPauseSlots, sessionSlots.length - neededSlots)
  const legal = pauseSlots
    .filter((s) => s >= flex.sessionStartSlot && s < flex.sessionEndSlot)
    .slice(0, Math.max(0, maxPause))
  if (legal.length === 0) return null
  const delta: Record<number, number> = {}
  for (const s of legal) delta[s] = -perSlot
  return {
    assetId: asset.id,
    type: 'pause',
    summary: `Pause charging ${legal.length * 15} min (${rangeLabel(legal[0], legal[legal.length - 1] + 1)}) — departure target still met`,
    deltaWh: delta,
  }
}

/** Defer a fixed-duration appliance run to a new start slot. */
function deferAction(asset: EnergyAsset, newStartSlot: number): ScheduleAction | null {
  if (asset.flex?.type !== 'defer-after') return null
  const flex = asset.flex
  const start = Math.max(newStartSlot, flex.earliestStartSlot)
  if (start > flex.latestStartSlot) return null
  const delta: Record<number, number> = {}
  const perSlot = Math.round(flex.powerW / 4)
  const baselineStart = asset.baselineWh.findIndex((wh) => wh > 0)
  for (let i = 0; i < flex.durationSlots; i++) {
    delta[baselineStart + i] = (delta[baselineStart + i] ?? 0) - perSlot
    delta[start + i] = (delta[start + i] ?? 0) + perSlot
  }
  // Cancel out overlapping slots.
  for (const [k, v] of Object.entries(delta)) if (v === 0) delete delta[Number(k)]
  return {
    assetId: asset.id,
    type: 'defer',
    summary: `Delay cycle to ${rangeLabel(start, start + flex.durationSlots)} (after the event)`,
    deltaWh: delta,
  }
}

interface StrategySpec {
  key: PlanCandidate['strategy']
  label: string
  description: string
  build: (input: SolveInput) => { actions: ScheduleAction[]; battery: BatteryPlan }
}

function flexAssets(input: SolveInput) {
  const unlocked = (a: EnergyAsset) => !isLocked(input, a)
  return {
    hvac: input.assets.find((a) => a.flex?.type === 'shift-earlier' && unlocked(a)) ?? null,
    evs: input.assets.filter((a) => a.flex?.type === 'pausable' && unlocked(a)),
    deferrables: input.assets.filter((a) => a.flex?.type === 'defer-after' && unlocked(a)),
  }
}

const STRATEGIES: StrategySpec[] = [
  {
    key: 'balanced',
    label: 'Balanced precool + stagger',
    description:
      'Pre-cools the auditorium, staggers the two EV pauses, defers the dishwasher, and shaves the residual with the battery. Recharges only after the rebound guard window.',
    build(input) {
      const { hvac, evs, deferrables } = flexAssets(input)
      const event = input.event
      const actions: ScheduleAction[] = []
      if (hvac) {
        const a = hvacShiftAction(hvac, 2)
        if (a) actions.push(a)
      }
      evs.forEach((ev, i) => {
        const start = event.windowStartSlot + i // stagger by one slot per EV
        const a = evPauseAction(ev, slotsInRange(start, start + 3))
        if (a) actions.push(a)
      })
      for (const d of deferrables) {
        const a = deferAction(d, event.windowEndSlot + 1)
        if (a) actions.push(a)
      }
      const preBattery = computeGridWh(input.assets, actions)
      const battery = dispatchBattery(input, preBattery, {
        mode: 'shave',
        marginW: 2_000,
        rechargeStartSlot: event.windowEndSlot + event.reboundWindowSlots,
        rechargeW: 6_000,
      })
      if (battery.action) actions.push(battery.action)
      if (battery.rechargeAction) actions.push(battery.rechargeAction)
      return { actions, battery }
    },
  },
  {
    key: 'battery-first',
    label: 'Battery-forward comfort hold',
    description:
      'Leaves the auditorium schedule untouched for zero comfort impact and lets the battery carry the window. Highest battery cycling; recharges in the evening.',
    build(input) {
      const { evs, deferrables } = flexAssets(input)
      const event = input.event
      const actions: ScheduleAction[] = []
      evs.forEach((ev, i) => {
        const start = event.windowStartSlot + i
        const a = evPauseAction(ev, slotsInRange(start, start + 3))
        if (a) actions.push(a)
      })
      for (const d of deferrables) {
        const a = deferAction(d, event.windowEndSlot + 1)
        if (a) actions.push(a)
      }
      const preBattery = computeGridWh(input.assets, actions)
      const battery = dispatchBattery(input, preBattery, {
        mode: 'shave',
        marginW: 2_000,
        rechargeStartSlot: event.windowEndSlot + event.reboundWindowSlots + 4,
        rechargeW: 6_000,
      })
      if (battery.action) actions.push(battery.action)
      if (battery.rechargeAction) actions.push(battery.rechargeAction)
      return { actions, battery }
    },
  },
  {
    key: 'shed-restore',
    label: 'Naïve shed & restore',
    description:
      'The reference trap: sheds everything during the window, then restores every load and recharges the battery the moment the event ends. Cheapest on paper — and it slams the feeder with a rebound peak.',
    build(input) {
      const { evs, deferrables } = flexAssets(input)
      const event = input.event
      const actions: ScheduleAction[] = []
      const hvacAny = input.assets.find((a) => a.flex?.type === 'shift-earlier')
      if (hvacAny && !isLocked(input, hvacAny)) {
        const a = hvacShedRestoreAction(hvacAny, event)
        if (a) actions.push(a)
      }
      for (const ev of evs) {
        // Both EVs pause late and resume together at 17:00.
        const a = evPauseAction(ev, slotsInRange(event.windowStartSlot + 1, event.windowStartSlot + 4))
        if (a) actions.push(a)
      }
      for (const d of deferrables) {
        const a = deferAction(d, event.windowEndSlot + 1)
        if (a) actions.push(a)
      }
      const preBattery = computeGridWh(input.assets, actions)
      const battery = dispatchBattery(input, preBattery, {
        mode: 'dump',
        marginW: 0,
        dumpW: 20_000,
        rechargeStartSlot: event.windowEndSlot, // recharge immediately — the mistake
        rechargeW: 12_000,
      })
      if (battery.action) actions.push(battery.action)
      if (battery.rechargeAction) actions.push(battery.rechargeAction)
      return { actions, battery }
    },
  },
]

/** Steps 1–6: validate, generate, dispatch, detect rebound, score. */
export function buildCandidates(input: SolveInput): PlanCandidate[] {
  const baselineGridWh = computeGridWh(input.assets)
  const criticalOrLocked = new Set(
    input.assets.filter((a) => a.criticality === 'critical' || isLocked(input, a)).map((a) => a.id),
  )

  const out: PlanCandidate[] = []
  for (const spec of STRATEGIES) {
    const { actions, battery } = spec.build(input)
    // Defense in depth: a strategy must never emit an action for a critical or
    // locked asset. (The battery reports through `battery` and is filtered above.)
    const safeActions = actions.filter((a) => !criticalOrLocked.has(a.assetId))

    const gridWh = computeGridWh(input.assets, safeActions)
    const batterySpec = input.assets.find((a) => a.flex?.type === 'battery')?.flex
    const floorWh = batterySpec?.type === 'battery' ? batterySpec.reserveFloorWh : 0
    const initialSoc = batterySpec?.type === 'battery' ? batterySpec.initialSocWh : 0
    const metrics = computeMetrics({
      event: input.event,
      assets: input.assets,
      actions: safeActions,
      gridWh,
      baselineGridWh,
      batteryUsedWh: battery.usedWh,
      batteryMinSocWh: battery.action ? battery.minSocWh : initialSoc,
      batteryReserveFloorWh: floorWh,
    })

    const violations: string[] = []
    if (!metrics.windowCompliant) {
      violations.push(
        `window-limit: peak ${(metrics.windowPeakW / 1000).toFixed(0)} kW at ${slotLabel(metrics.windowPeakSlot)} exceeds the ${(input.event.limitW / 1000).toFixed(0)} kW event limit`,
      )
    }
    if (!metrics.reboundOk) {
      violations.push(
        `rebound-guard: post-event peak ${(metrics.reboundPeakW / 1000).toFixed(0)} kW at ${slotLabel(metrics.reboundPeakSlot)} exceeds the ${(input.event.reboundGuardW / 1000).toFixed(0)} kW rebound guard`,
      )
    }
    for (const ev of metrics.evTargets) {
      if (!ev.met) {
        violations.push(
          `ev-departure: ${ev.name} would leave with ${(ev.deliveredWh / 1000).toFixed(1)} kWh of the required ${(ev.requiredWh / 1000).toFixed(1)} kWh`,
        )
      }
    }
    if (!metrics.batteryReserveOk) {
      violations.push('battery-reserve: dispatch would breach the battery reserve floor')
    }
    if (spec.key === 'shed-restore' && safeActions.some((a) => a.type === 'pause' && a.assetId === 'hvac-auditorium')) {
      violations.push(
        'hvac-direction: auditorium cooling may only move earlier — coasting and boost-recovery runs it later than allowed',
      )
    }

    const valid = violations.length === 0
    out.push({
      id: `${spec.key}-v${input.scenarioVersion}`,
      strategy: spec.key,
      label: spec.label,
      description: spec.description,
      scenarioVersion: input.scenarioVersion,
      actions: safeActions,
      gridWh,
      metrics,
      valid,
      violations,
      score: scoreCandidate(metrics, valid, input.event),
    })
  }
  return out
}
