/**
 * Hard-constraint feasibility analysis.
 *
 * Before generating candidates the solver computes, per event-window slot, an
 * upper bound on how much load the *unlocked* flexible assets plus the battery
 * could remove. If even that bound leaves a slot above the limit, the
 * constraint set is impossible and we explain exactly why — including which
 * locked asset would help most if unlocked.
 */

import { slotLabel, slotsInRange, whPerSlotToW } from '../time'
import type { DemandEvent, EnergyAsset, InfeasibilityReport, SolveInput } from '../types'
import { computeGridWh } from '../schedule'

export function isLocked(input: SolveInput, asset: EnergyAsset): boolean {
  return Boolean(asset.permanentlyLocked) || input.lockedAssetIds.includes(asset.id)
}

/** Max Wh removable from `slot` by one asset's flexibility (ignoring cross-slot budgets). */
function slotReliefWh(asset: EnergyAsset, slot: number, event: DemandEvent): number {
  const flex = asset.flex
  if (!flex) return 0
  switch (flex.type) {
    case 'shift-earlier': {
      // Shifting a contiguous run earlier by up to k slots clears only the last
      // k slots of the run.
      const clearedFrom = flex.blockEndSlot - flex.maxSlotsEarlier
      return slot >= clearedFrom && slot < flex.blockEndSlot ? asset.baselineWh[slot] : 0
    }
    case 'pausable':
      return slot >= flex.sessionStartSlot && slot < flex.sessionEndSlot
        ? asset.baselineWh[slot]
        : 0
    case 'defer-after':
      return asset.baselineWh[slot] > 0 && flex.earliestStartSlot >= event.windowEndSlot
        ? asset.baselineWh[slot]
        : 0
    case 'battery':
      return Math.round(flex.maxDischargeW / 4)
  }
}

/** Cross-slot budget for one asset across the whole window (pause limits, battery energy). */
function windowReliefBudgetWh(asset: EnergyAsset, event: DemandEvent): number {
  const flex = asset.flex
  if (!flex) return 0
  const windowSlots = slotsInRange(event.windowStartSlot, event.windowEndSlot)
  switch (flex.type) {
    case 'shift-earlier':
    case 'defer-after':
      return windowSlots.reduce((acc, s) => acc + slotReliefWh(asset, s, event), 0)
    case 'pausable': {
      const perSlot = asset.baselineWh[flex.sessionStartSlot]
      return flex.maxPauseSlots * perSlot
    }
    case 'battery':
      return Math.max(0, flex.initialSocWh - flex.reserveFloorWh)
  }
}

export function analyzeFeasibility(input: SolveInput): InfeasibilityReport | null {
  const { event } = input
  const baseline = computeGridWh(input.assets)
  const windowSlots = slotsInRange(event.windowStartSlot, event.windowEndSlot)
  const limitWh = Math.round(event.limitW / 4)

  const unlockedFlex = input.assets.filter((a) => a.flex && !isLocked(input, a))
  const lockedFlex = input.assets.filter((a) => a.flex && isLocked(input, a))

  // Per-slot power bound.
  const hotSlots: InfeasibilityReport['hotSlots'] = []
  for (const slot of windowSlots) {
    let relief = 0
    for (const asset of unlockedFlex) relief += slotReliefWh(asset, slot, event)
    const residual = baseline[slot] - relief
    if (residual > limitWh) {
      hotSlots.push({ slot, label: slotLabel(slot), excessW: whPerSlotToW(residual - limitWh) })
    }
  }
  hotSlots.sort((a, b) => b.excessW - a.excessW || a.slot - b.slot)

  // Whole-window energy bound.
  const excessWh = windowSlots.reduce((acc, s) => acc + Math.max(0, baseline[s] - limitWh), 0)
  const budgetWh = unlockedFlex.reduce((acc, a) => acc + windowReliefBudgetWh(a, event), 0)
  const shortfallWh = Math.max(0, excessWh - budgetWh)

  if (hotSlots.length === 0 && shortfallWh === 0) return null

  const suggestions: string[] = []
  const ranked = lockedFlex
    .map((a) => ({ asset: a, relief: windowReliefBudgetWh(a, event) }))
    .filter((x) => x.relief > 0)
    .sort((a, b) => b.relief - a.relief)
  for (const { asset, relief } of ranked.slice(0, 3)) {
    suggestions.push(
      `Unlock “${asset.name}” to free up to ${(relief / 1000).toFixed(1)} kWh inside the event window.`,
    )
  }
  if (suggestions.length === 0) {
    suggestions.push(
      'All flexible assets are already available — the target itself is out of reach for this building. Contact the utility to renegotiate the limit.',
    )
  }

  const worst = hotSlots[0]
  const reason = worst
    ? `Even using every unlocked flexible asset at its limit, demand at ${worst.label} stays ` +
      `${(worst.excessW / 1000).toFixed(1)} kW above the ${(event.limitW / 1000).toFixed(0)} kW target.`
    : `The window needs ${(shortfallWh / 1000).toFixed(1)} kWh more relief than the unlocked assets and battery can provide.`

  return { reason, hotSlots, shortfallWh, suggestions }
}
