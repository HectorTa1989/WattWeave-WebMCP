import { useState } from 'react'
import { useStore } from '../state/store'
import type { PlanCandidate } from '../domain/types'
import { fmtKw, fmtKwh, slotLabel } from '../domain/time'
import { usePulse } from '../hooks/usePulse'
import { hasFeature } from '../billing/entitlements'
import { CheckIcon, EyeIcon, PlayIcon, SparkIcon, StopIcon, WarnIcon, XIcon, LockIcon } from './Icons'

/**
 * Agent workspace: run the cancellable simulation, compare candidates, and
 * push one into the approval drawer. Every button here calls the SAME store
 * operations the WebMCP tools call — one code path, two operators.
 */

interface Props {
  onUpgrade: () => void
}

export function PlannerPanel({ onUpgrade }: Props) {
  const state = useStore()
  const pulsing = usePulse('candidates')
  const [objective, setObjective] = useState<'safe-peak' | 'balanced' | 'min-cost'>('safe-peak')
  const canCompare = hasFeature(state.user, 'candidates.compare')

  const running = state.sim.status === 'running'
  const visible = canCompare ? state.candidates : state.candidates.slice(0, 1)
  const hiddenCount = state.candidates.length - visible.length

  const run = () => {
    void state.startSimulation({ objective, maxCandidates: 3, actor: 'agent' })
  }

  return (
    <section className={`card ${pulsing ? 'pulsing' : ''}`} data-testid="planner-panel">
      <header className="card-head">
        <div>
          <h2 className="card-title">Plan the response</h2>
          <div className="card-sub">Deterministic heuristic · runs in a Web Worker</div>
        </div>
        <div className="right">
          <span className="chip" title="Scenario version — bumps on every constraint change">
            v{state.scenarioVersion}
          </span>
        </div>
      </header>

      <p className="hero-prompt" data-testid="hero-prompt">
        <strong style={{ color: 'var(--text)' }}>Operator asked:</strong> “{state.heroPrompt}”
      </p>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
        <div className="segmented" role="group" aria-label="Objective">
          {(['safe-peak', 'balanced', 'min-cost'] as const).map((o) => (
            <button key={o} className={objective === o ? 'active' : ''} onClick={() => setObjective(o)} disabled={running}>
              {o === 'safe-peak' ? 'Safe peak' : o === 'balanced' ? 'Balanced' : 'Min cost'}
            </button>
          ))}
        </div>
        <span style={{ flex: 1 }} />
        {running ? (
          <button className="btn danger" onClick={() => state.cancelSimulation('operator')} data-testid="cancel-sim">
            <StopIcon size={13} /> Cancel
          </button>
        ) : (
          <button className="btn primary" onClick={run} data-testid="run-sim" disabled={Boolean(state.committed)}>
            <PlayIcon size={13} /> {state.candidates.length ? 'Re-simulate' : 'Simulate'}
          </button>
        )}
      </div>

      {running && (
        <div data-testid="sim-progress">
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${Math.round(state.sim.progress * 100)}%` }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: 'var(--text-2)', marginTop: 6 }}>
            <span>
              {state.sim.phase === 'validate'
                ? 'Validating hard locks and departure targets…'
                : state.sim.phase === 'sweep'
                  ? `Sweeping shift windows${state.sim.sweepSlot !== null ? ` · ${slotLabel(state.sim.sweepSlot)}` : ''}`
                  : 'Scoring candidates…'}
            </span>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{Math.round(state.sim.progress * 100)}%</span>
          </div>
        </div>
      )}

      {state.sim.status === 'canceled' && !state.candidates.length && (
        <div className="violation-note" data-testid="canceled-note" style={{ color: 'var(--text-2)', background: 'var(--panel-inset)' }}>
          Simulation canceled. Nothing changed — locks, schedule and scenario version are exactly as they were.
        </div>
      )}

      {state.infeasible && (
        <div className="violation-note" data-testid="infeasible-note">
          <strong style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
            <WarnIcon size={14} /> No feasible plan under these constraints
          </strong>
          {state.infeasible.reason}
          <ul style={{ margin: '6px 0 0', paddingLeft: 16 }}>
            {state.infeasible.suggestions.map((s) => (
              <li key={s} style={{ marginTop: 2 }}>
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* While a run is in flight the previous candidates are being recomputed —
          show them dimmed and inert rather than letting the operator act on
          results that are about to be replaced. */}
      <div style={running ? { opacity: 0.4, pointerEvents: 'none' } : undefined} aria-busy={running}>
        {visible.map((c, i) => (
          <CandidateCard key={c.id} candidate={c} rank={i} objective={objective} />
        ))}
      </div>

      {hiddenCount > 0 && (
        <div className="candidate" style={{ position: 'relative', minHeight: 118 }} data-testid="paywall-candidates">
          <div className="candidate-title" style={{ opacity: 0.35 }}>
            {hiddenCount} more candidate{hiddenCount > 1 ? 's' : ''}
          </div>
          <div className="metric-grid" style={{ opacity: 0.35 }}>
            {['Peak', 'Rebound', 'Cost', 'Comfort'].map((k) => (
              <div className="metric" key={k}>
                <div className="k">{k}</div>
                <div className="v">—</div>
              </div>
            ))}
          </div>
          <div className="locked-overlay">
            <div style={{ textAlign: 'center', padding: 12 }}>
              <LockIcon size={18} />
              <div style={{ fontSize: 13, fontWeight: 700, margin: '6px 0 2px' }}>Compare all candidates</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-2)', marginBottom: 9, maxWidth: 260 }}>
                See every heuristic plan side by side — including the naïve one that rebounds to 224 kW.
              </div>
              <button className="btn primary" onClick={onUpgrade} data-testid="upgrade-from-candidates">
                <SparkIcon size={13} /> Unlock with Pro
              </button>
            </div>
          </div>
        </div>
      )}

      {!state.candidates.length && !running && !state.infeasible && state.sim.status !== 'canceled' && (
        <div style={{ fontSize: 12.5, color: 'var(--text-2)', padding: '14px 2px 4px', lineHeight: 1.5 }}>
          {state.committed
            ? 'A plan is committed. Roll it back to explore alternatives.'
            : 'Lock anything that must not change, then run the simulation. The agent reads the same locks you set.'}
        </div>
      )}
    </section>
  )
}

const RANK_REASON: Record<string, string> = {
  'safe-peak': 'lowest event peak',
  balanced: 'highest overall score',
  'min-cost': 'largest cost saving',
}

function CandidateCard({
  candidate: c,
  rank,
  objective,
}: {
  candidate: PlanCandidate
  rank: number
  objective: 'safe-peak' | 'balanced' | 'min-cost'
}) {
  const state = useStore()
  const previewing = state.previewCandidateId === c.id
  const stale = c.scenarioVersion !== state.scenarioVersion
  const recommended = rank === 0 && c.valid

  const stage = () => {
    const r = state.stagePlan(c.id, state.scenarioVersion, `stage-${c.id}-v${state.scenarioVersion}`, 'agent')
    if (!r.ok) console.warn(r.message)
  }

  return (
    <article className={`candidate ${previewing ? 'previewing' : ''} ${c.valid ? '' : 'invalid'}`} data-testid={`candidate-${c.strategy}`}>
      <div className="candidate-title">
        {c.valid ? (
          <span style={{ color: 'var(--green)' }}>
            <CheckIcon size={15} />
          </span>
        ) : (
          <span style={{ color: 'var(--orange)' }}>
            <WarnIcon size={15} />
          </span>
        )}
        {c.label}
        {recommended && (
          <span className="badge planned" title={`Ranked first for the “${objective}” objective`}>
            recommended
          </span>
        )}
        {stale && <span className="badge stale">stale · v{c.scenarioVersion}</span>}
        <span style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--text-2)', fontWeight: 650 }}>
          score {c.score.total}
        </span>
      </div>
      {recommended && (
        <div style={{ fontSize: 11, color: 'var(--blue)', fontWeight: 650, marginTop: 3 }}>
          Ranked first by the <strong>{objective}</strong> objective — {RANK_REASON[objective]}. Overall score ranks
          candidates on all four dimensions at once, so a lower-ranked plan can still score higher.
        </div>
      )}

      <div style={{ fontSize: 11.5, color: 'var(--text-2)', lineHeight: 1.45, marginTop: 4 }}>{c.description}</div>

      <div className="metric-grid">
        <Metric k="Event peak" v={fmtKw(c.metrics.windowPeakW)} good={c.metrics.windowCompliant} />
        <Metric k="Rebound" v={fmtKw(c.metrics.reboundPeakW)} good={c.metrics.reboundOk} />
        <Metric
          k="Cost"
          v={`${c.metrics.costDeltaCents <= 0 ? '−' : '+'}$${Math.abs(c.metrics.costDeltaCents / 100).toFixed(2)}`}
          good={c.metrics.costDeltaCents <= 0}
        />
        <Metric k="Comfort" v={['none', 'slight', 'moderate', 'high'][Math.min(3, c.metrics.comfortImpact)]} good={c.metrics.comfortImpact <= 1} />
      </div>

      <div className="scorebar" title={`peak ${c.score.peakScore} · rebound ${c.score.reboundScore} · cost ${c.score.costScore} · comfort ${c.score.comfortScore}`}>
        <span style={{ width: `${c.score.peakScore}%`, background: 'var(--green-vivid)' }} />
        <span style={{ width: `${c.score.reboundScore}%`, background: 'var(--blue)' }} />
        <span style={{ width: `${c.score.costScore}%`, background: 'var(--purple-vivid)' }} />
        <span style={{ width: `${c.score.comfortScore}%`, background: 'var(--orange-vivid)' }} />
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 600 }}>
        peak {c.score.peakScore} · rebound {c.score.reboundScore} · cost {c.score.costScore} · comfort {c.score.comfortScore} — best candidate found by the deterministic heuristic, not a claim of optimality
      </div>

      {c.violations.length > 0 && (
        <div className="violation-note" data-testid={`violations-${c.strategy}`}>
          {c.violations.map((v) => (
            <div key={v} style={{ display: 'flex', gap: 6, marginTop: 2 }}>
              <XIcon size={12} />
              <span>{v}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 7, marginTop: 10 }}>
        <button
          className={`btn ${previewing ? '' : 'ghost'}`}
          onClick={() => (previewing ? state.clearPreview() : state.previewPlan(c.id, 'agent'))}
          data-testid={`preview-${c.strategy}`}
          disabled={stale}
        >
          <EyeIcon size={13} /> {previewing ? 'Hide preview' : 'Preview'}
        </button>
        {c.valid && (
          <button className="btn primary" onClick={stage} disabled={!previewing || stale} data-testid={`stage-${c.strategy}`} title={previewing ? 'Freeze this plan for operator review' : 'Preview it first'}>
            Stage for approval
          </button>
        )}
      </div>

      <div style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 7, fontVariantNumeric: 'tabular-nums' }}>
        Battery {fmtKwh(c.metrics.batteryUsedWh)} used · SoC after event {fmtKwh(c.metrics.batterySocAfterEventWh)} (floor {fmtKwh(c.metrics.batteryReserveFloorWh)}) ·{' '}
        {c.metrics.evTargets.filter((t) => t.met).length}/{c.metrics.evTargets.length} EV targets met
      </div>
    </article>
  )
}

function Metric({ k, v, good }: { k: string; v: string; good: boolean }) {
  return (
    <div className="metric">
      <div className="k">{k}</div>
      <div className={`v ${good ? 'good' : 'bad'}`}>{v}</div>
    </div>
  )
}
