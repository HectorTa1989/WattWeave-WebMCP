/**
 * WattWeave application store.
 *
 * One Zustand store drives both the human UI and the WebMCP tool surface, so
 * the agent always reads exactly what the operator sees: same scenario
 * version, same locks, same staged plan. State transitions are pure and
 * defensive — every mutating operation returns a structured OpResult that the
 * tool layer can serialize verbatim.
 */

import { create } from 'zustand'
import type { UserAccount } from '../billing/entitlements'
import { loadSession, saveSession, authenticate } from '../billing/auth'
import { validateLicenseKey } from '../billing/polar'
import {
  HERO_PROMPT,
  NOW_SLOT,
  PLAN_HORIZON_START,
  SCENARIO_ID,
  SCENARIO_NAME,
  seedAssets,
  seedEvent,
  seedZones,
} from '../domain/seed'
import { buildInverse, computeGridWh } from '../domain/schedule'
import type {
  AuditEvent,
  AuditEventType,
  DemandEvent,
  EnergyAsset,
  InfeasibilityReport,
  PlanCandidate,
  ScheduleVersion,
  SolveObjective,
  SolveProgress,
  StagedSchedule,
  Zone,
} from '../domain/types'
import { runSimulation } from '../sim/controller'
import { pulse } from './pulse'

export type Actor = 'operator' | 'agent'

export type OpResult<T = undefined> =
  | { ok: true; value: T }
  | { ok: false; code: string; message: string; details?: unknown }

const ok = <T,>(value: T): OpResult<T> => ({ ok: true, value })
const err = (code: string, message: string, details?: unknown): OpResult<never> => ({
  ok: false,
  code,
  message,
  details,
})

export interface SimState {
  status: 'idle' | 'running' | 'done' | 'canceled' | 'error'
  progress: number
  sweepSlot: number | null
  phase: SolveProgress['phase'] | null
  message?: string
}

export interface CommittedState {
  version: number
  candidateId: string
  candidateLabel: string
  auditEventId: string
  gridWh: number[]
  /** The applied actions, so the UI can render true per-asset composition. */
  actions: StagedSchedule['actions']
  metricsSummary: {
    windowPeakW: number
    reboundPeakW: number
    batterySocAfterEventWh: number
  }
  inverseActions: StagedSchedule['inverse']['actions']
  idempotencyKey: string
}

export interface WattWeaveState {
  scenarioId: string
  scenarioName: string
  scenarioVersion: number
  nowSlot: number
  heroPrompt: string
  event: DemandEvent
  zones: Zone[]
  assets: EnergyAsset[]
  locks: Record<string, boolean>
  selectedAssetId: string | null
  sim: SimState
  candidates: PlanCandidate[]
  infeasible: InfeasibilityReport | null
  previewCandidateId: string | null
  staged: StagedSchedule | null
  stagedIdempotencyKey: string | null
  committed: CommittedState | null
  scheduleHistory: ScheduleVersion[]
  rollbackKeys: Record<string, string> // idempotencyKey -> rollback audit id
  audit: AuditEvent[]
  user: UserAccount | null
  // ---- actions ----
  selectAsset: (id: string | null) => void
  setLock: (assetId: string, locked: boolean, actor: Actor) => OpResult<{ assetId: string; locked: boolean }>
  setConstraint: (
    assetId: string,
    constraint: 'locked' | 'maxPauseSlots' | 'earliestStartSlot' | 'maxSlotsEarlier',
    value: boolean | number,
    actor: Actor,
  ) => OpResult<{ assetId: string; constraint: string; value: boolean | number }>
  startSimulation: (
    opts: { objective: SolveObjective; maxCandidates: number; actor: Actor },
    externalSignal?: AbortSignal,
  ) => Promise<OpResult<{ candidates: PlanCandidate[]; infeasible: InfeasibilityReport | null }>>
  cancelSimulation: (actor: Actor) => OpResult<{ canceled: boolean }>
  previewPlan: (candidateId: string, actor: Actor) => OpResult<{ candidateId: string }>
  clearPreview: () => void
  stagePlan: (
    candidateId: string,
    scenarioVersion: number,
    idempotencyKey: string,
    actor: Actor,
  ) => OpResult<{ stageId: string }>
  discardStaged: (actor: Actor) => void
  approveStaged: () => OpResult<{ approvalToken: string }>
  commitPlan: (
    stageId: string,
    approvalToken: string,
    idempotencyKey: string,
    actor: Actor,
  ) => OpResult<{ auditEventId: string; committedVersion: number }>
  rollbackPlan: (
    auditEventId: string,
    idempotencyKey: string,
    actor: Actor,
  ) => OpResult<{ restoredVersion: number }>
  signIn: (email: string, password: string) => OpResult<{ user: UserAccount }>
  signOut: () => void
  activateLicense: (key: string) => Promise<OpResult<{ message: string }>>
}

let auditSeq = 0
let stageSeq = 0
let tokenSeq = 0
let currentAbort: AbortController | null = null
// Invalidates callbacks/results from simulations that were canceled or reset.
// Abort messages cross the worker boundary asynchronously, so the AbortSignal
// alone cannot prevent an older run from publishing after a newer state change.
let simulationRunEpoch = 0

/** Sweep pacing — tests set this to 0 to run simulations instantly. */
export const simTiming = { stepDelayMs: 28 }

// Dev-only handle so the demo recorder can slow the sweep down enough to film
// a mid-run cancellation. Never exposed in a production build.
if (import.meta.env.DEV && typeof window !== 'undefined') {
  ;(window as unknown as { __wattweaveSimTiming?: typeof simTiming }).__wattweaveSimTiming = simTiming
}

function makeAudit(type: AuditEventType, actor: Actor, summary: string, refId?: string): AuditEvent {
  auditSeq += 1
  return {
    id: `evt-${String(auditSeq).padStart(3, '0')}`,
    seq: auditSeq,
    at: new Date().toLocaleTimeString('en-US', { hour12: false }),
    type,
    actor,
    summary,
    refId,
  }
}

export function isAssetLocked(state: Pick<WattWeaveState, 'assets' | 'locks'>, assetId: string): boolean {
  const asset = state.assets.find((a) => a.id === assetId)
  if (!asset) return false
  return Boolean(asset.permanentlyLocked) || Boolean(state.locks[assetId])
}

export function lockedAssetIds(state: Pick<WattWeaveState, 'assets' | 'locks'>): string[] {
  return state.assets.filter((a) => isAssetLocked(state, a.id)).map((a) => a.id)
}

/** Grid demand of the schedule currently in force (baseline or committed plan). */
export function activeGridWh(state: Pick<WattWeaveState, 'assets' | 'committed'>): number[] {
  return state.committed ? state.committed.gridWh : computeGridWh(state.assets)
}

function seededLocks(assets: EnergyAsset[]): Record<string, boolean> {
  const locks: Record<string, boolean> = {}
  for (const a of assets) if (a.permanentlyLocked) locks[a.id] = true
  return locks
}

type StateData = Omit<
  WattWeaveState,
  | 'selectAsset'
  | 'setLock'
  | 'setConstraint'
  | 'startSimulation'
  | 'cancelSimulation'
  | 'previewPlan'
  | 'clearPreview'
  | 'stagePlan'
  | 'discardStaged'
  | 'approveStaged'
  | 'commitPlan'
  | 'rollbackPlan'
  | 'signIn'
  | 'signOut'
  | 'activateLicense'
>

function buildInitialState(): StateData {
  const assets = seedAssets()
  return {
    scenarioId: SCENARIO_ID,
    scenarioName: SCENARIO_NAME,
    scenarioVersion: 1,
    nowSlot: NOW_SLOT,
    heroPrompt: HERO_PROMPT,
    event: seedEvent(),
    zones: seedZones,
    assets,
    locks: seededLocks(assets),
    selectedAssetId: null,
    sim: { status: 'idle', progress: 0, sweepSlot: null, phase: null },
    candidates: [],
    infeasible: null,
    previewCandidateId: null,
    staged: null,
    stagedIdempotencyKey: null,
    committed: null,
    scheduleHistory: [],
    rollbackKeys: {},
    audit: [],
    user: loadSession(),
  }
}

/** Restore the pristine seed scenario. Used by tests and the demo reset button. */
export function resetStore(): void {
  simulationRunEpoch += 1
  const abort = currentAbort
  currentAbort = null
  abort?.abort()
  useStore.setState(buildInitialState())
}

export const useStore = create<WattWeaveState>()((set, get) => ({
  ...buildInitialState(),

  selectAsset(id) {
    if (id !== null && !get().assets.some((a) => a.id === id)) return
    set({ selectedAssetId: id })
    if (id) pulse(`asset:${id}`)
  },

  setLock(assetId, locked, actor) {
    const state = get()
    const asset = state.assets.find((a) => a.id === assetId)
    if (!asset) return err('UNKNOWN_ASSET', `No asset with id "${assetId}".`)
    if (asset.permanentlyLocked && !locked) {
      return err(
        'CRITICAL_IMMUTABLE',
        `${asset.name} is always critical and cannot be unlocked.`,
      )
    }
    if (isAssetLocked(state, assetId) === locked) {
      return ok({ assetId, locked }) // no-op, no version bump
    }
    set({
      locks: { ...state.locks, [assetId]: locked },
      scenarioVersion: state.scenarioVersion + 1,
      audit: [
        ...state.audit,
        makeAudit('lock', actor, `${locked ? 'Locked' : 'Unlocked'} ${asset.name}`),
      ],
    })
    pulse(`asset:${assetId}`)
    return ok({ assetId, locked })
  },

  setConstraint(assetId, constraint, value, actor) {
    const state = get()
    const asset = state.assets.find((a) => a.id === assetId)
    if (!asset) return err('UNKNOWN_ASSET', `No asset with id "${assetId}".`)
    if (constraint === 'locked') {
      if (typeof value !== 'boolean') return err('BAD_VALUE', 'locked expects a boolean.')
      const r = get().setLock(assetId, value, actor)
      return r.ok ? ok({ assetId, constraint, value }) : r
    }
    if (asset.criticality === 'critical') {
      return err('CRITICAL_IMMUTABLE', `${asset.name} is critical — its constraints cannot change.`)
    }
    if (typeof value !== 'number' || !Number.isInteger(value)) {
      return err('BAD_VALUE', `${constraint} expects an integer.`)
    }
    const flex = asset.flex
    let nextFlex = flex
    if (constraint === 'maxPauseSlots') {
      if (flex?.type !== 'pausable')
        return err('WRONG_ASSET_KIND', `${asset.name} does not support maxPauseSlots.`)
      if (value < 0 || value > 6) return err('BAD_VALUE', 'maxPauseSlots must be 0–6 slots.')
      nextFlex = { ...flex, maxPauseSlots: value }
    } else if (constraint === 'earliestStartSlot') {
      if (flex?.type !== 'defer-after')
        return err('WRONG_ASSET_KIND', `${asset.name} does not support earliestStartSlot.`)
      if (value < PLAN_HORIZON_START || value > flex.latestStartSlot)
        return err('BAD_VALUE', `earliestStartSlot must be between now and ${flex.latestStartSlot}.`)
      nextFlex = { ...flex, earliestStartSlot: value }
    } else if (constraint === 'maxSlotsEarlier') {
      if (flex?.type !== 'shift-earlier')
        return err('WRONG_ASSET_KIND', `${asset.name} does not support maxSlotsEarlier.`)
      if (value < 0 || value > 4) return err('BAD_VALUE', 'maxSlotsEarlier must be 0–4 slots.')
      nextFlex = { ...flex, maxSlotsEarlier: value }
    }
    set({
      assets: state.assets.map((a) => (a.id === assetId ? { ...a, flex: nextFlex } : a)),
      scenarioVersion: state.scenarioVersion + 1,
      audit: [
        ...state.audit,
        makeAudit('constraint', actor, `Set ${constraint}=${value} on ${asset.name}`),
      ],
    })
    pulse(`asset:${assetId}`)
    return ok({ assetId, constraint, value })
  },

  async startSimulation(opts, externalSignal) {
    const state = get()
    if (state.sim.status === 'running') {
      return err('SIM_RUNNING', 'A simulation is already running — cancel it first.')
    }
    const abort = new AbortController()
    const runEpoch = ++simulationRunEpoch
    currentAbort = abort
    if (externalSignal) {
      if (externalSignal.aborted) abort.abort()
      else externalSignal.addEventListener('abort', () => abort.abort(), { once: true })
    }

    const input = {
      assets: state.assets,
      lockedAssetIds: lockedAssetIds(state),
      event: state.event,
      scenarioVersion: state.scenarioVersion,
      objective: opts.objective,
      maxCandidates: opts.maxCandidates,
    }
    set({
      sim: { status: 'running', progress: 0, sweepSlot: null, phase: 'validate' },
      audit: [
        ...get().audit,
        makeAudit('simulate', opts.actor, `Simulation started (${opts.objective}, ≤${opts.maxCandidates} candidates)`),
      ],
    })
    pulse('chart-window')

    const result = await runSimulation(input, {
      signal: abort.signal,
      stepDelayMs: simTiming.stepDelayMs,
      onProgress: (p) => {
        if (runEpoch !== simulationRunEpoch || currentAbort !== abort) return
        set({ sim: { status: 'running', progress: p.pct, sweepSlot: p.sweepSlot, phase: p.phase } })
      },
    })

    // A reset or explicit cancel owns the final state synchronously. Never let
    // a late worker result overwrite that newer state.
    if (runEpoch !== simulationRunEpoch || currentAbort !== abort) {
      return err('CANCELED', 'Simulation canceled before completion. No candidates were produced and no state changed.')
    }
    currentAbort = null

    if (result.status === 'canceled') {
      set({
        sim: { status: 'canceled', progress: 0, sweepSlot: null, phase: null },
        audit: [...get().audit, makeAudit('cancel', opts.actor, 'Simulation canceled — no state changed')],
      })
      return err('CANCELED', 'Simulation canceled before completion. No candidates were produced and no state changed.')
    }
    if (result.status === 'error') {
      set({ sim: { status: 'error', progress: 0, sweepSlot: null, phase: null, message: result.message } })
      return err('SOLVER_ERROR', result.message)
    }
    if (get().scenarioVersion !== input.scenarioVersion) {
      set({ sim: { status: 'idle', progress: 0, sweepSlot: null, phase: null } })
      return err(
        'STALE_SCENARIO',
        `Constraints changed during the run (v${input.scenarioVersion} → v${get().scenarioVersion}). Re-run the simulation.`,
      )
    }
    set({
      sim: { status: 'done', progress: 1, sweepSlot: null, phase: null },
      candidates: result.candidates,
      infeasible: result.infeasible,
      previewCandidateId: null,
      audit: [
        ...get().audit,
        makeAudit(
          'simulate',
          opts.actor,
          result.infeasible
            ? 'Simulation finished: constraint set is infeasible'
            : `Simulation finished: ${result.candidates.length} candidate(s), ${result.candidates.filter((c) => c.valid).length} valid`,
        ),
      ],
    })
    pulse('candidates')
    return ok({ candidates: result.candidates, infeasible: result.infeasible })
  },

  cancelSimulation(actor) {
    if (get().sim.status !== 'running' || !currentAbort) {
      return err('NOT_RUNNING', 'No simulation is running.')
    }
    const abort = currentAbort
    simulationRunEpoch += 1
    currentAbort = null
    set({
      sim: { status: 'canceled', progress: 0, sweepSlot: null, phase: null },
      audit: [...get().audit, makeAudit('cancel', actor, 'Simulation canceled — no state changed')],
    })
    abort.abort()
    return ok({ canceled: true })
  },

  previewPlan(candidateId, actor) {
    const state = get()
    const candidate = state.candidates.find((c) => c.id === candidateId)
    if (!candidate) return err('UNKNOWN_CANDIDATE', `No candidate "${candidateId}" — run simulate_load_plan first.`)
    if (candidate.scenarioVersion !== state.scenarioVersion) {
      return err(
        'STALE_SCENARIO',
        `Candidate ${candidateId} was computed for scenario v${candidate.scenarioVersion}; the scenario is now v${state.scenarioVersion}. Re-run the simulation.`,
      )
    }
    set({
      previewCandidateId: candidateId,
      audit: [...state.audit, makeAudit('preview', actor, `Previewing “${candidate.label}”`)],
    })
    pulse('chart')
    pulse('flow')
    return ok({ candidateId })
  },

  clearPreview() {
    set({ previewCandidateId: null })
    pulse('chart')
  },

  stagePlan(candidateId, scenarioVersion, idempotencyKey, actor) {
    const state = get()
    if (state.staged && state.stagedIdempotencyKey === idempotencyKey) {
      return ok({ stageId: state.staged.stageId }) // idempotent replay
    }
    if (state.staged) {
      return err('ALREADY_STAGED', `Stage ${state.staged.stageId} is awaiting review — discard it first.`)
    }
    const candidate = state.candidates.find((c) => c.id === candidateId)
    if (!candidate) return err('UNKNOWN_CANDIDATE', `No candidate "${candidateId}".`)
    if (scenarioVersion !== state.scenarioVersion || candidate.scenarioVersion !== state.scenarioVersion) {
      return err(
        'STALE_SCENARIO',
        `Scenario is now v${state.scenarioVersion}; this candidate belongs to v${candidate.scenarioVersion}. Re-run the simulation.`,
      )
    }
    if (!candidate.valid) {
      return err('PLAN_INVALID', `“${candidate.label}” violates hard constraints and cannot be staged.`, {
        violations: candidate.violations,
      })
    }
    if (state.previewCandidateId !== candidateId) {
      return err('NOT_PREVIEWED', 'Preview the candidate first — staging freezes the previewed plan.')
    }
    stageSeq += 1
    const stageId = `stg-${String(stageSeq).padStart(3, '0')}`
    const staged: StagedSchedule = {
      stageId,
      candidateId,
      candidateLabel: candidate.label,
      scenarioVersion: state.scenarioVersion,
      actions: candidate.actions,
      gridWh: candidate.gridWh,
      metrics: candidate.metrics,
      inverse: buildInverse(candidate, state.scenarioVersion),
      approvalToken: null,
    }
    set({
      staged,
      stagedIdempotencyKey: idempotencyKey,
      audit: [...state.audit, makeAudit('stage', actor, `Staged “${candidate.label}” as ${stageId}`, stageId)],
    })
    pulse('approval')
    return ok({ stageId })
  },

  discardStaged(actor) {
    const state = get()
    if (!state.staged) return
    set({
      staged: null,
      stagedIdempotencyKey: null,
      audit: [...state.audit, makeAudit('stage', actor, `Discarded ${state.staged.stageId} without applying`)],
    })
  },

  approveStaged() {
    const state = get()
    if (!state.staged) return err('NOT_STAGED', 'Nothing is staged.')
    if (state.staged.approvalToken) return ok({ approvalToken: state.staged.approvalToken })
    tokenSeq += 1
    const token = `apv-${state.staged.stageId}-v${state.scenarioVersion}-${String(tokenSeq).padStart(3, '0')}`
    set({
      staged: { ...state.staged, approvalToken: token },
      audit: [
        ...state.audit,
        makeAudit('approve', 'operator', `Operator approved ${state.staged.stageId} — commit unlocked`, state.staged.stageId),
      ],
    })
    pulse('approval')
    return ok({ approvalToken: token })
  },

  commitPlan(stageId, approvalToken, idempotencyKey, actor) {
    const state = get()
    if (state.committed && state.committed.idempotencyKey === idempotencyKey) {
      return ok({ auditEventId: state.committed.auditEventId, committedVersion: state.committed.version }) // idempotent replay
    }
    if (!state.staged) return err('NOT_STAGED', 'Nothing is staged — stage_load_plan first.')
    if (state.staged.stageId !== stageId) {
      return err('UNKNOWN_STAGE', `Stage "${stageId}" does not match the active stage ${state.staged.stageId}.`)
    }
    if (!state.staged.approvalToken) {
      return err('NOT_APPROVED', 'The operator has not approved this schedule. Commit stays locked until they click “Approve and apply schedule”.')
    }
    if (approvalToken !== state.staged.approvalToken) {
      return err('BAD_TOKEN', 'Approval token mismatch — tokens are bound to one stage and scenario version.')
    }
    if (state.staged.scenarioVersion !== state.scenarioVersion) {
      return err('STALE_SCENARIO', 'Constraints changed after approval. Discard and re-plan.')
    }
    if (state.committed) {
      return err('ALREADY_COMMITTED', 'A plan is already committed — roll it back before committing another.')
    }
    const audit = makeAudit('commit', actor, `Committed “${state.staged.candidateLabel}” (${stageId})`, stageId)
    const committed: CommittedState = {
      version: state.scenarioVersion + 1,
      candidateId: state.staged.candidateId,
      candidateLabel: state.staged.candidateLabel,
      auditEventId: audit.id,
      gridWh: state.staged.gridWh,
      actions: state.staged.actions,
      metricsSummary: {
        windowPeakW: state.staged.metrics.windowPeakW,
        reboundPeakW: state.staged.metrics.reboundPeakW,
        batterySocAfterEventWh: state.staged.metrics.batterySocAfterEventWh,
      },
      inverseActions: state.staged.inverse.actions,
      idempotencyKey,
    }
    set({
      committed,
      staged: null,
      stagedIdempotencyKey: null,
      previewCandidateId: null,
      candidates: [],
      infeasible: null,
      scenarioVersion: state.scenarioVersion + 1,
      scheduleHistory: [
        ...state.scheduleHistory,
        {
          version: state.scenarioVersion,
          label: 'Baseline before commit',
          gridWh: activeGridWh(state),
          candidateId: null,
        },
        {
          version: state.scenarioVersion + 1,
          label: state.staged.candidateLabel,
          gridWh: state.staged.gridWh,
          candidateId: state.staged.candidateId,
        },
      ],
      audit: [...state.audit, audit],
    })
    pulse('chart')
    pulse('meter')
    pulse('audit')
    return ok({ auditEventId: audit.id, committedVersion: committed.version })
  },

  rollbackPlan(auditEventId, idempotencyKey, actor) {
    const state = get()
    const replay = state.rollbackKeys[idempotencyKey]
    if (replay) {
      return ok({ restoredVersion: state.scenarioVersion }) // idempotent replay
    }
    if (!state.committed) return err('NOTHING_COMMITTED', 'No committed plan to roll back.')
    if (state.committed.auditEventId !== auditEventId) {
      return err('UNKNOWN_AUDIT_EVENT', `No committed plan with audit id "${auditEventId}".`)
    }
    const audit = makeAudit(
      'rollback',
      actor,
      `Rolled back “${state.committed.candidateLabel}” — baseline schedule restored`,
      auditEventId,
    )
    set({
      committed: null,
      scenarioVersion: state.scenarioVersion + 1,
      rollbackKeys: { ...state.rollbackKeys, [idempotencyKey]: audit.id },
      scheduleHistory: [
        ...state.scheduleHistory,
        {
          version: state.scenarioVersion + 1,
          label: 'Baseline restored by rollback',
          gridWh: computeGridWh(state.assets),
          candidateId: null,
        },
      ],
      audit: [...state.audit, audit],
    })
    pulse('chart')
    pulse('meter')
    pulse('audit')
    return ok({ restoredVersion: state.scenarioVersion + 1 })
  },

  signIn(email, password) {
    const account = authenticate(email, password)
    if (!account) return err('BAD_CREDENTIALS', 'Email or password not recognized (demo accounts are listed below the form).')
    saveSession(account)
    set({ user: account })
    return ok({ user: account })
  },

  signOut() {
    saveSession(null)
    set({ user: null })
  },

  async activateLicense(key) {
    const result = await validateLicenseKey(key)
    if (!result.ok) return err('BAD_LICENSE', result.message)
    const state = get()
    const base = state.user ?? {
      email: 'operator@wattweave.app',
      name: 'Sam Rivera',
      role: 'operator' as const,
      plan: 'free' as const,
      planSource: 'default' as const,
    }
    const upgraded: UserAccount = { ...base, plan: 'pro', planSource: 'polar-license' }
    saveSession(upgraded)
    set({ user: upgraded })
    return ok({ message: result.message })
  },
}))
