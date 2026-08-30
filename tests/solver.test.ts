import { describe, expect, it } from 'vitest'
import { labelToSlot, peakW, whPerSlotToW } from '../src/domain/time'
import { seedAssets, seedEvent } from '../src/domain/seed'
import { computeGridWh, invertActions } from '../src/domain/schedule'
import { solve, solveWithProgress } from '../src/domain/solver/solver'
import type { SolveInput } from '../src/domain/types'

const CRITICAL_IDS = ['server-room', 'accessibility']

function heroInput(overrides: Partial<SolveInput> = {}): SolveInput {
  const assets = seedAssets()
  return {
    assets,
    lockedAssetIds: CRITICAL_IDS,
    event: seedEvent(),
    scenarioVersion: 1,
    objective: 'safe-peak',
    maxCandidates: 3,
    ...overrides,
  }
}

describe('seed scenario', () => {
  it('baseline peaks at exactly 212 kW in the 16:15 slot', () => {
    const grid = computeGridWh(seedAssets())
    const p = peakW(grid)
    expect(p.w).toBe(212_000)
    expect(p.slot).toBe(labelToSlot('16:15'))
  })

  it('baseline breaches the 170 kW limit across the whole event window', () => {
    const grid = computeGridWh(seedAssets())
    for (let s = 64; s < 68; s++) {
      expect(whPerSlotToW(grid[s])).toBeGreaterThan(170_000)
    }
  })
})

describe('deterministic solver — hero scenario', () => {
  const result = solve(heroInput())

  it('produces three candidates, at least one valid, deterministically ordered', () => {
    expect(result.infeasible).toBeNull()
    expect(result.candidates).toHaveLength(3)
    expect(result.candidates.filter((c) => c.valid).length).toBeGreaterThanOrEqual(2)
    expect(result.candidates[0].strategy).toBe('balanced')
    // Determinism: same input twice → identical output.
    expect(solve(heroInput())).toEqual(result)
  })

  it('best candidate keeps the window at or below 170 kW with no rebound', () => {
    const best = result.candidates[0]
    expect(best.valid).toBe(true)
    expect(best.metrics.windowPeakW).toBeLessThanOrEqual(170_000)
    expect(best.metrics.windowPeakW).toBe(168_000)
    expect(best.metrics.reboundOk).toBe(true)
    expect(best.metrics.reboundPeakW).toBeLessThanOrEqual(190_000)
  })

  it('never touches critical loads in any candidate', () => {
    for (const c of result.candidates) {
      for (const action of c.actions) {
        expect(CRITICAL_IDS).not.toContain(action.assetId)
      }
    }
  })

  it('meets both EV departure targets in every valid candidate', () => {
    for (const c of result.candidates.filter((x) => x.valid)) {
      expect(c.metrics.evTargets).toHaveLength(2)
      for (const t of c.metrics.evTargets) {
        expect(t.deliveredWh).toBeGreaterThanOrEqual(t.requiredWh)
        expect(t.met).toBe(true)
      }
    }
  })

  it('flags the naïve plan with the seeded 224 kW rebound at 17:00–17:15', () => {
    const naive = result.candidates.find((c) => c.strategy === 'shed-restore')
    expect(naive).toBeDefined()
    expect(naive!.valid).toBe(false)
    expect(naive!.metrics.reboundPeakW).toBe(224_000)
    expect(naive!.metrics.reboundPeakSlot).toBe(labelToSlot('17:00'))
    expect(naive!.violations.join(' ')).toContain('rebound-guard')
    expect(naive!.violations.join(' ')).toContain('hvac-direction')
  })

  it('respects battery power and reserve limits', () => {
    for (const c of result.candidates) {
      expect(c.metrics.batterySocAfterEventWh).toBeGreaterThanOrEqual(4_000)
      const batteryDeltas = c.actions.filter((a) => a.assetId === 'battery')
      for (const a of batteryDeltas) {
        for (const wh of Object.values(a.deltaWh)) {
          expect(Math.abs(wh)).toBeLessThanOrEqual(6_000) // 24 kW × 15 min
        }
      }
    }
    const balanced = result.candidates.find((c) => c.strategy === 'balanced')!
    expect(balanced.metrics.batteryUsedWh).toBe(10_250)
    expect(balanced.metrics.batterySocAfterEventWh).toBe(21_750)
  })

  it('shows a transparent score breakdown that sums to the total', () => {
    for (const c of result.candidates) {
      const s = c.score
      expect(s.total).toBeCloseTo(s.peakScore + s.reboundScore + s.costScore + s.comfortScore, 5)
      expect(s.hardConstraints).toBe(c.valid ? 'pass' : 'fail')
    }
  })
})

describe('locks and constraints', () => {
  it('leaves locked flexible assets untouched', () => {
    const input = heroInput({ lockedAssetIds: [...CRITICAL_IDS, 'hvac-auditorium'] })
    const result = solve(input)
    for (const c of result.candidates) {
      expect(c.actions.some((a) => a.assetId === 'hvac-auditorium')).toBe(false)
    }
  })

  it('rejects an impossible constraint set with hot slots and useful suggestions', () => {
    const input = heroInput({
      lockedAssetIds: [...CRITICAL_IDS, 'hvac-auditorium', 'ev-1', 'ev-2', 'dishwasher'],
    })
    const result = solve(input)
    expect(result.candidates).toHaveLength(0)
    expect(result.infeasible).not.toBeNull()
    expect(result.infeasible!.hotSlots.length).toBeGreaterThan(0)
    expect(result.infeasible!.hotSlots[0].label).toBe('16:15')
    expect(result.infeasible!.reason).toMatch(/above the 170 kW target/)
    expect(result.infeasible!.suggestions[0]).toMatch(/Auditorium Cooling/)
  })
})

describe('inverse schedules', () => {
  it('applying a candidate then its inverse restores the exact baseline', () => {
    const assets = seedAssets()
    const baseline = computeGridWh(assets)
    const result = solve(heroInput())
    for (const c of result.candidates) {
      const roundTrip = computeGridWh(assets, [...c.actions, ...invertActions(c.actions)])
      expect(roundTrip).toEqual(baseline)
    }
  })
})

describe('cancellation', () => {
  it('stops at the next checkpoint and returns a structured CANCELED result', async () => {
    let steps = 0
    const result = await solveWithProgress(heroInput(), {
      sleep: () => Promise.resolve(),
      shouldCancel: () => steps > 5,
      onProgress: () => {
        steps += 1
      },
    })
    expect(result.status).toBe('canceled')
    expect(steps).toBeLessThan(12) // stopped mid-sweep, not at the end
  })

  it('completes when never canceled', async () => {
    const result = await solveWithProgress(heroInput(), { sleep: () => Promise.resolve() })
    expect(result.status).toBe('done')
  })
})
