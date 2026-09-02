import { useState } from 'react'
import { useStore, activeGridWh } from '../state/store'
import { computeGridWh } from '../domain/schedule'
import { fmtKw, fmtKwh, peakW, slotLabel } from '../domain/time'
import { rollbackThroughControl } from '../integrations/controlOperations'
import { controlMode } from '../integrations/controlGateway'
import { usePulse } from '../hooks/usePulse'
import { hasFeature } from '../billing/entitlements'
import { CheckIcon, DocIcon, SparkIcon, UndoIcon } from './Icons'

/**
 * Action receipt + audit trail. After a commit this is the operator's proof:
 * measurable before/after, exactly what changed, and one-click rollback.
 */

interface Props {
  onUpgrade: () => void
}

export function ReceiptPanel({ onUpgrade }: Props) {
  const state = useStore()
  const pulsing = usePulse('audit')
  const canExport = hasFeature(state.user, 'audit.export')
  const committed = state.committed
  const control = controlMode()
  const [rollingBack, setRollingBack] = useState(false)
  const [rollbackError, setRollbackError] = useState<string | null>(null)

  const baseline = computeGridWh(state.assets)
  const basePeak = peakW(baseline)
  const baseWindowPeak = peakW(baseline, state.event.windowStartSlot, state.event.windowEndSlot)
  const live = activeGridWh(state)
  const livePeak = peakW(live)

  const rollback = async () => {
    if (!committed) return
    setRollingBack(true)
    setRollbackError(null)
    const result = await rollbackThroughControl(
      committed.auditEventId,
      `rollback-${committed.auditEventId}`,
      'operator',
    )
    if (!result.ok) setRollbackError(result.message)
    setRollingBack(false)
  }

  const exportReceipt = () => {
    if (!committed) return
    const receipt = {
      scenario: { id: state.scenarioId, name: state.scenarioName, version: state.scenarioVersion },
      event: {
        id: state.event.id,
        window: `${slotLabel(state.event.windowStartSlot)}–${slotLabel(state.event.windowEndSlot)}`,
        limitKw: state.event.limitW / 1000,
      },
      plan: committed.candidateLabel,
      auditEventId: committed.auditEventId,
      before: { peakKw: basePeak.w / 1000, windowPeakKw: baseWindowPeak.w / 1000 },
      after: {
        peakKw: livePeak.w / 1000,
        windowPeakKw: committed.metricsSummary.windowPeakW / 1000,
        reboundPeakKw: committed.metricsSummary.reboundPeakW / 1000,
      },
      auditTrail: state.audit.map((a) => ({ seq: a.seq, at: a.at, type: a.type, actor: a.actor, summary: a.summary })),
    }
    const blob = new Blob([JSON.stringify(receipt, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `wattweave-receipt-${committed.auditEventId}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <section className={`card ${committed ? 'receipt-card' : ''} ${pulsing ? 'pulsing' : ''}`} data-testid="receipt-panel">
      <header className="card-head">
        <div>
          <h2 className="card-title">{committed ? 'Action receipt' : 'Audit trail'}</h2>
          <div className="card-sub">
            {committed
              ? `${control === 'live-gateway' ? 'Gateway-dispatched' : 'Sandbox-applied'} ${committed.candidateLabel}`
              : `${state.audit.length} event${state.audit.length === 1 ? '' : 's'} recorded`}
          </div>
        </div>
        <div className="right">
          {committed && (
            <span className="chip good">
              <CheckIcon size={12} /> {control === 'live-gateway' ? 'gateway' : 'simulation'}
            </span>
          )}
        </div>
      </header>

      {committed && (
        <>
          <div className="metric-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }} data-testid="before-after">
            <div className="metric">
              <div className="k">Before · event peak</div>
              <div className="v bad">{fmtKw(baseWindowPeak.w)}</div>
            </div>
            <div className="metric">
              <div className="k">After · event peak</div>
              <div className="v good" data-testid="after-peak">
                {fmtKw(committed.metricsSummary.windowPeakW)}
              </div>
            </div>
            <div className="metric">
              <div className="k">Rebound</div>
              <div className="v good">{fmtKw(committed.metricsSummary.reboundPeakW)}</div>
            </div>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5, marginBottom: 10 }}>
            Peak cut {fmtKw(baseWindowPeak.w - committed.metricsSummary.windowPeakW)} inside the event window — from{' '}
            {fmtKw(baseWindowPeak.w)} to {fmtKw(committed.metricsSummary.windowPeakW)}, under the {fmtKw(state.event.limitW)}{' '}
            target, with no rebound above {fmtKw(state.event.reboundGuardW)}. Battery holds{' '}
            {fmtKwh(committed.metricsSummary.batterySocAfterEventWh)} after the event. Critical loads unchanged.
          </div>

          <div style={{ display: 'flex', gap: 7 }}>
            <button className="btn danger" onClick={() => void rollback()} disabled={rollingBack} data-testid="rollback-btn">
              <UndoIcon size={13} /> {rollingBack ? 'Rolling back…' : 'Roll back'}
            </button>
            {canExport ? (
              <button className="btn ghost" onClick={exportReceipt} data-testid="export-receipt">
                <DocIcon size={13} /> Export JSON
              </button>
            ) : (
              <button className="btn ghost" onClick={onUpgrade} data-testid="export-locked" title="Pro feature">
                <SparkIcon size={13} /> Export JSON
                <span className="badge pro" style={{ marginLeft: 4 }}>
                  PRO
                </span>
              </button>
            )}
          </div>
          {rollbackError && (
            <div className="violation-note" style={{ marginTop: 8 }} data-testid="rollback-error">
              {rollbackError}
            </div>
          )}
        </>
      )}

      <div style={{ marginTop: committed ? 14 : 0, maxHeight: 190, overflowY: 'auto' }} data-testid="audit-list">
        {state.audit.length === 0 && (
          <div style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.5 }}>
            Every lock, simulation, preview, approval, commit and rollback is recorded here with its actor.
          </div>
        )}
        {[...state.audit].reverse().map((a) => (
          <div className="audit-row" key={a.id}>
            <span className="t" style={{ color: 'var(--text-3)', flex: 'none' }}>
              {a.at}
            </span>
            <span className="type" style={{ color: a.actor === 'agent' ? 'var(--blue)' : 'var(--text-2)' }}>
              {a.actor}
            </span>
            <span style={{ color: 'var(--text)' }}>{a.summary}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
