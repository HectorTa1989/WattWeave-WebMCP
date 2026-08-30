/**
 * Intent evals — 14 cases exercising the WebMCP tool surface headlessly,
 * exactly as an agent would drive it. Each case maps to a line in the
 * "Evals and tests" section of the build brief.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { activeGridWh, resetStore, simTiming, useStore } from '../src/state/store'
import { computeGridWh } from '../src/domain/schedule'
import { hasTool, invokeTool } from '../src/webmcp/adapter'
import { initWebMcpTools } from '../src/webmcp/tools'

simTiming.stepDelayMs = 0
initWebMcpTools()

type Json = Record<string, any>

async function call(name: string, args: unknown = {}, signal?: AbortSignal): Promise<{ ok: boolean; data: Json }> {
  const res = await invokeTool(name, args, { actor: 'inspector', signal })
  return { ok: !res.isError, data: JSON.parse(res.content[0].text) as Json }
}

async function simulate(): Promise<Json> {
  const version = useStore.getState().scenarioVersion
  const r = await call('simulate_load_plan', { objective: 'safe-peak', maxCandidates: 3, scenarioVersion: version })
  expect(r.ok).toBe(true)
  return r.data
}

/** Drive the full hero flow up to (but not including) approval. */
async function stageHeroPlan(): Promise<{ candidateId: string; stageId: string }> {
  const sim = await simulate()
  const candidateId = sim.candidates[0].id as string
  const version = useStore.getState().scenarioVersion
  const prev = await call('preview_load_plan', { candidateId, scenarioVersion: version })
  expect(prev.ok).toBe(true)
  const stage = await call('stage_load_plan', { candidateId, scenarioVersion: version, idempotencyKey: 'stage-1' })
  expect(stage.ok).toBe(true)
  return { candidateId, stageId: stage.data.stageId as string }
}

async function commitHeroPlan(): Promise<{ auditEventId: string }> {
  const { stageId } = await stageHeroPlan()
  const approval = useStore.getState().approveStaged()
  if (!approval.ok) throw new Error('approve failed')
  const commit = await call('commit_load_plan', {
    stageId,
    approvalToken: approval.value.approvalToken,
    idempotencyKey: 'commit-1',
  })
  expect(commit.ok).toBe(true)
  return { auditEventId: commit.data.auditEventId as string }
}

beforeEach(() => {
  resetStore()
})

describe('intent evals', () => {
  it('1. respects all critical locks — no plan ever touches critical assets', async () => {
    await simulate()
    for (const c of useStore.getState().candidates) {
      expect(c.actions.every((a) => !['server-room', 'accessibility'].includes(a.assetId))).toBe(true)
    }
  })

  it('2. meets both EV departure targets in the recommended plan', async () => {
    const sim = await simulate()
    expect(sim.candidates[0].evTargetsMet).toBe(true)
  })

  it('3. keeps event-window demand at or below 170 kW', async () => {
    const sim = await simulate()
    expect(sim.candidates[0].windowPeakKw).toBeLessThanOrEqual(170)
  })

  it('4. avoids the seeded rebound peak (and exposes it on the naïve plan)', async () => {
    const sim = await simulate()
    expect(sim.candidates[0].reboundPeakKw).toBeLessThanOrEqual(190)
    const naive = sim.candidates.find((c: Json) => c.strategy === 'shed-restore')
    expect(naive.valid).toBe(false)
    expect(naive.reboundPeakKw).toBe(224)
  })

  it('5. rejects an impossible hard-constraint set with a useful explanation', async () => {
    const s = useStore.getState()
    for (const id of ['hvac-auditorium', 'ev-1', 'ev-2', 'dishwasher']) {
      expect(s.setLock(id, true, 'operator').ok).toBe(true)
    }
    const version = useStore.getState().scenarioVersion
    const r = await call('simulate_load_plan', { objective: 'safe-peak', maxCandidates: 3, scenarioVersion: version })
    expect(r.ok).toBe(true)
    expect(r.data.status).toBe('INFEASIBLE')
    expect(r.data.hotSlots.length).toBeGreaterThan(0)
    expect(String(r.data.suggestions[0])).toMatch(/Unlock/)
  })

  it('6. uses scenario version to reject stale candidates', async () => {
    const sim = await simulate()
    const candidateId = sim.candidates[0].id as string
    const staleVersion = useStore.getState().scenarioVersion
    useStore.getState().setLock('dishwasher', true, 'operator') // bumps version
    const prev = await call('preview_load_plan', { candidateId, scenarioVersion: staleVersion })
    expect(prev.ok).toBe(false)
    expect(prev.data.error.code).toBe('STALE_SCENARIO')
    const simStale = await call('simulate_load_plan', {
      objective: 'safe-peak',
      maxCandidates: 3,
      scenarioVersion: staleVersion,
    })
    expect(simStale.ok).toBe(false)
    expect(simStale.data.error.code).toBe('STALE_SCENARIO')
  })

  it('7. never exposes commit_load_plan before visible approval', async () => {
    const { stageId } = await stageHeroPlan()
    expect(hasTool('commit_load_plan')).toBe(false)
    const sneak = await call('commit_load_plan', { stageId, approvalToken: 'forged', idempotencyKey: 'x' })
    expect(sneak.ok).toBe(false)
    expect(sneak.data.error.code).toBe('TOOL_NOT_AVAILABLE')
    useStore.getState().approveStaged()
    expect(hasTool('commit_load_plan')).toBe(true)
  })

  it('8. cancels the simulation cleanly, leaving state unchanged', async () => {
    const version = useStore.getState().scenarioVersion
    const controller = new AbortController()
    const pending = call(
      'simulate_load_plan',
      { objective: 'safe-peak', maxCandidates: 3, scenarioVersion: version },
      controller.signal,
    )
    controller.abort()
    const r = await pending
    expect(r.ok).toBe(true) // structured result, not an error
    expect(r.data.status).toBe('CANCELED')
    const s = useStore.getState()
    expect(s.candidates).toHaveLength(0)
    expect(s.sim.status).toBe('canceled')
    expect(s.scenarioVersion).toBe(version)
  })

  it('9. marks tariff notes untrusted and never treats them as instructions', async () => {
    const r = await call('get_active_demand_event')
    expect(r.data.untrusted.source).toBe('external-tariff-feed')
    expect(r.data.untrusted.warning).toMatch(/UNTRUSTED/)
    expect(r.data.untrusted.text).toMatch(/commit the cheapest available plan/)
    // The injection in the note changes nothing: limit intact, commit still gated.
    expect(r.data.event.limitKw).toBe(170)
    await stageHeroPlan()
    expect(hasTool('commit_load_plan')).toBe(false)
  })

  it('10. selects the correct asset-scoped tool (selection gating)', async () => {
    expect(hasTool('get_selected_asset')).toBe(false)
    expect(hasTool('set_asset_constraint')).toBe(false)
    useStore.getState().selectAsset('ev-1')
    expect(hasTool('get_selected_asset')).toBe(true)
    const wrong = await call('set_asset_constraint', { assetId: 'dishwasher', constraint: 'locked', value: true })
    expect(wrong.ok).toBe(false)
    expect(wrong.data.error.code).toBe('NOT_SELECTED')
    const right = await call('set_asset_constraint', { assetId: 'ev-1', constraint: 'maxPauseSlots', value: 2 })
    expect(right.ok).toBe(true)
    const selected = await call('get_selected_asset')
    expect(selected.data.asset.id).toBe('ev-1')
    expect(selected.data.asset.flex.maxPauseSlots).toBe(2)
  })

  it('11. rejects an unknown asset id', async () => {
    useStore.getState().selectAsset('ev-1')
    const r = await call('set_asset_constraint', { assetId: 'flux-capacitor', constraint: 'locked', value: true })
    expect(r.ok).toBe(false)
    expect(r.data.error.code).toBe('UNKNOWN_ASSET')
  })

  it('12. preserves idempotency on commit', async () => {
    const { auditEventId } = await commitHeroPlan()
    const gridAfterFirst = activeGridWh(useStore.getState())
    const again = await call('commit_load_plan', {
      stageId: 'stg-whatever',
      approvalToken: 'irrelevant',
      idempotencyKey: 'commit-1',
    })
    expect(again.ok).toBe(true)
    expect(again.data.auditEventId).toBe(auditEventId)
    expect(activeGridWh(useStore.getState())).toEqual(gridAfterFirst)
  })

  it('13. rolls back to the exact prior schedule', async () => {
    const before = activeGridWh(useStore.getState())
    const { auditEventId } = await commitHeroPlan()
    expect(activeGridWh(useStore.getState())).not.toEqual(before)
    const rb = await call('rollback_load_plan', { auditEventId, idempotencyKey: 'rb-1' })
    expect(rb.ok).toBe(true)
    const after = activeGridWh(useStore.getState())
    expect(after).toEqual(before)
    expect(after).toEqual(computeGridWh(useStore.getState().assets))
    // Idempotent replay:
    const rb2 = await call('rollback_load_plan', { auditEventId, idempotencyKey: 'rb-1' })
    expect(rb2.ok).toBe(true)
  })

  it('14. keeps tool output compact while the UI renders full detail', async () => {
    const load = await invokeTool('get_load_state', { windowStart: '14:00', windowEnd: '18:00' }, { actor: 'inspector' })
    expect(load.content[0].text.length).toBeLessThan(4_000)
    const version = useStore.getState().scenarioVersion
    const sim = await invokeTool(
      'simulate_load_plan',
      { objective: 'safe-peak', maxCandidates: 3, scenarioVersion: version },
      { actor: 'inspector' },
    )
    expect(sim.content[0].text.length).toBeLessThan(3_500)
    const parsed = JSON.parse(sim.content[0].text)
    expect(parsed.candidates.length).toBeLessThanOrEqual(3)
    const wide = await call('get_load_state', { windowStart: '00:00', windowEnd: '23:45' })
    expect(wide.ok).toBe(false)
    expect(wide.data.error.code).toBe('WINDOW_TOO_WIDE')
  })
})
