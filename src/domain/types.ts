/**
 * WattWeave domain model.
 *
 * All energy values are integer watt-hours per 15-minute slot (see time.ts).
 * All types here are plain serializable data — they cross the Web Worker
 * boundary and are returned (in compact form) from WebMCP tools.
 */

export type SlotIndex = number // 0..95

export interface TimeSlot {
  index: SlotIndex
  label: string // "16:15"
}

export interface TariffBand {
  startSlot: SlotIndex
  endSlot: SlotIndex // exclusive
  centsPerKwh: number
  label: string
}

/** A demand-response event issued by the utility. */
export interface DemandEvent {
  id: string
  title: string
  utility: string
  windowStartSlot: SlotIndex
  windowEndSlot: SlotIndex // exclusive
  /** Demand must stay at or below this during the window (watts). */
  limitW: number
  /** Post-event demand must stay below this for `reboundWindowSlots` (watts). */
  reboundGuardW: number
  reboundWindowSlots: number
  tariff: TariffBand[]
  /**
   * Free-text advisory from the external tariff feed. UNTRUSTED CONTENT:
   * surfaced to humans and returned by tools only inside an `untrusted`
   * envelope. Never parsed, never treated as instructions.
   */
  untrustedTariffNote: string
}

export type AssetKind = 'base' | 'hvac' | 'ev' | 'appliance' | 'battery' | 'solar'
export type Criticality = 'critical' | 'inflexible' | 'flexible'

export type FlexSpec =
  | {
      /** A contiguous run that may start earlier than baseline (pre-cooling). */
      type: 'shift-earlier'
      maxSlotsEarlier: number
      blockStartSlot: SlotIndex
      blockEndSlot: SlotIndex // exclusive
    }
  | {
      /** A charging session that may pause, but must deliver minEnergyWh by departureSlot. */
      type: 'pausable'
      maxPauseSlots: number
      sessionStartSlot: SlotIndex
      sessionEndSlot: SlotIndex // exclusive; equals departure
      minEnergyWh: number
      departureSlot: SlotIndex
    }
  | {
      /** A fixed-duration run that may be deferred to start at/after a slot. */
      type: 'defer-after'
      earliestStartSlot: SlotIndex
      latestStartSlot: SlotIndex
      durationSlots: number
      powerW: number
    }
  | {
      type: 'battery'
      capacityWh: number
      initialSocWh: number
      reserveFloorWh: number
      maxDischargeW: number
      maxChargeW: number
    }

export interface EnergyAsset {
  id: string
  name: string
  zoneId: string
  kind: AssetKind
  criticality: Criticality
  /** Baseline consumption per slot in Wh (negative for solar generation). */
  baselineWh: number[]
  maxPowerW: number
  flex?: FlexSpec
  /** Critical assets ship locked and cannot be unlocked. */
  permanentlyLocked?: boolean
  note?: string
}

export interface Zone {
  id: string
  name: string
  assetIds: string[]
}

/** A user- or agent-set override on one asset. Visible in the constraint editor. */
export interface DeviceConstraint {
  assetId: string
  constraint: 'locked' | 'maxPauseSlots' | 'earliestStartSlot' | 'maxSlotsEarlier'
  value: boolean | number
}

export interface LoadForecastPoint {
  slot: SlotIndex
  label: string
  gridW: number
}

export type ScheduleActionType =
  | 'shift-earlier'
  | 'pause'
  | 'defer'
  | 'battery-discharge'
  | 'battery-recharge'

/** One concrete change vs. baseline for one asset. deltaWh is sparse: slot → ΔWh. */
export interface ScheduleAction {
  assetId: string
  type: ScheduleActionType
  summary: string
  deltaWh: Record<SlotIndex, number>
}

export interface EvTargetResult {
  assetId: string
  name: string
  requiredWh: number
  deliveredWh: number
  departureSlot: SlotIndex
  met: boolean
}

export interface PlanMetrics {
  peakW: number
  peakSlot: SlotIndex
  windowPeakW: number
  windowPeakSlot: SlotIndex
  windowCompliant: boolean
  reboundPeakW: number
  reboundPeakSlot: SlotIndex
  reboundOk: boolean
  baselineCostCents: number
  planCostCents: number
  costDeltaCents: number
  /** 0 = none … 3 = significant occupant impact. */
  comfortImpact: number
  comfortNotes: string[]
  batteryUsedWh: number
  batterySocAfterEventWh: number
  batteryReserveFloorWh: number
  batteryReserveOk: boolean
  evTargets: EvTargetResult[]
}

export interface ScoreBreakdown {
  hardConstraints: 'pass' | 'fail'
  peakScore: number // 0..40
  reboundScore: number // 0..25
  costScore: number // 0..20
  comfortScore: number // 0..15
  total: number // 0..100
}

export interface PlanCandidate {
  id: string
  strategy: 'balanced' | 'battery-first' | 'shed-restore'
  label: string
  description: string
  scenarioVersion: number
  actions: ScheduleAction[]
  /** Net grid demand per slot in Wh (all loads − solar − battery discharge). */
  gridWh: number[]
  metrics: PlanMetrics
  valid: boolean
  violations: string[]
  score: ScoreBreakdown
}

export interface InverseSchedule {
  /** Negated actions: applying these to the committed schedule restores baseline exactly. */
  actions: ScheduleAction[]
  restoresToVersion: number
}

export interface StagedSchedule {
  stageId: string
  candidateId: string
  candidateLabel: string
  scenarioVersion: number
  actions: ScheduleAction[]
  gridWh: number[]
  metrics: PlanMetrics
  inverse: InverseSchedule
  /** Minted only when the human clicks "Approve and apply schedule". */
  approvalToken: string | null
}

export interface ScheduleVersion {
  version: number
  label: string
  gridWh: number[]
  candidateId: string | null
}

export type AuditEventType =
  | 'lock'
  | 'constraint'
  | 'simulate'
  | 'cancel'
  | 'preview'
  | 'stage'
  | 'approve'
  | 'commit'
  | 'rollback'

export interface AuditEvent {
  id: string
  seq: number
  at: string // display timestamp
  type: AuditEventType
  actor: 'operator' | 'agent'
  summary: string
  refId?: string
}

// ---------- Solver I/O ----------

export type SolveObjective = 'safe-peak' | 'min-cost' | 'balanced'

export interface SolveInput {
  assets: EnergyAsset[]
  lockedAssetIds: string[]
  event: DemandEvent
  scenarioVersion: number
  objective: SolveObjective
  maxCandidates: number
}

export interface InfeasibilityReport {
  reason: string
  /** Slots where demand cannot be brought under the limit, with the residual excess. */
  hotSlots: Array<{ slot: SlotIndex; label: string; excessW: number }>
  shortfallWh: number
  suggestions: string[]
}

export type SolveResult =
  | { status: 'done'; candidates: PlanCandidate[]; infeasible: InfeasibilityReport | null }
  | { status: 'canceled' }
  | { status: 'error'; message: string }

export interface SolveProgress {
  phase: 'validate' | 'sweep' | 'score'
  sweepSlot: SlotIndex | null
  pct: number // 0..1
}
