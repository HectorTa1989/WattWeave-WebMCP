import { useEffect, useRef } from 'react'
import { activeGridWh, useStore } from '../state/store'
import { fmtKw, fmtKwh, peakW, slotLabel12h } from '../domain/time'
import { CheckIcon, LockIcon, ShieldIcon, WarnIcon, XIcon } from './Icons'

/**
 * The visible approval gate.
 *
 * Nothing is applied until the operator reads this diff and clicks
 * "Approve and apply schedule". Only that click mints the approval token —
 * and only then does `commit_load_plan` become discoverable to the agent.
 */

export function ApprovalDrawer() {
  const state = useStore()
  const staged = state.staged
  const approveRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (staged && !staged.approvalToken) approveRef.current?.focus()
  }, [staged])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && staged && !staged.approvalToken) state.discardStaged('operator')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [staged, state])

  if (!staged) return null
  const m = staged.metrics
  const currentPeak = peakW(activeGridWh(state))
  const approved = Boolean(staged.approvalToken)

  const commit = () => {
    if (!staged.approvalToken) return
    state.commitPlan(staged.stageId, staged.approvalToken, `commit-${staged.stageId}`, 'agent')
  }

  return (
    <>
      <div className="drawer-backdrop" onClick={() => !approved && state.discardStaged('operator')} />
      <aside className="approval-drawer" role="dialog" aria-modal="true" aria-label="Review staged schedule" data-testid="approval-drawer">
        <header className="card-head" style={{ padding: '16px 18px 0', margin: 0 }}>
          <div>
            <h2 className="card-title">Review before applying</h2>
            <div className="card-sub">
              {staged.stageId} · scenario v{staged.scenarioVersion}
            </div>
          </div>
          <div className="right">
            <button className="btn ghost" onClick={() => state.discardStaged('operator')} aria-label="Discard staged plan">
              <XIcon size={15} />
            </button>
          </div>
        </header>

        <div className="drawer-body">
          <div style={{ fontSize: 13.5, fontWeight: 700, margin: '10px 0 2px' }}>{staged.candidateLabel}</div>

          <div style={{ margin: '12px 0 4px', fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', color: 'var(--text-3)', textTransform: 'uppercase' }}>
            Safety checks
          </div>

          <ReviewRow k="Current peak → proposed" v={`${fmtKw(currentPeak.w)} → ${fmtKw(m.peakW)}`} testid="review-peak" />
          <ReviewRow
            k={`Event window ≤ ${fmtKw(state.event.limitW)}`}
            v={fmtKw(m.windowPeakW)}
            status={m.windowCompliant}
            testid="review-window"
          />
          <ReviewRow
            k={`Rebound guard ≤ ${fmtKw(state.event.reboundGuardW)}`}
            v={fmtKw(m.reboundPeakW)}
            status={m.reboundOk}
            testid="review-rebound"
          />
          <ReviewRow
            k="Battery reserve after event"
            v={`${fmtKwh(m.batterySocAfterEventWh)} (floor ${fmtKwh(m.batteryReserveFloorWh)})`}
            status={m.batteryReserveOk}
            testid="review-battery"
          />
          {m.evTargets.map((t) => (
            <ReviewRow
              key={t.assetId}
              k={`${t.name} by ${slotLabel12h(t.departureSlot)}`}
              v={`${fmtKwh(t.deliveredWh)} / ${fmtKwh(t.requiredWh)}`}
              status={t.met}
              testid={`review-ev-${t.assetId}`}
            />
          ))}
          <ReviewRow
            k="Cost impact"
            v={`${m.costDeltaCents <= 0 ? '−' : '+'}$${Math.abs(m.costDeltaCents / 100).toFixed(2)}`}
            status={m.costDeltaCents <= 0}
          />

          <div style={{ margin: '16px 0 4px', fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', color: 'var(--text-3)', textTransform: 'uppercase' }}>
            Exact changes ({staged.actions.length})
          </div>
          <div data-testid="staged-changes">
            {staged.actions.map((a, i) => (
              <div className="change-item" key={`${a.assetId}-${i}`}>
                <span style={{ color: 'var(--blue)', flex: 'none', marginTop: 1 }}>
                  <CheckIcon size={13} />
                </span>
                <div>
                  <strong style={{ fontSize: 12.5 }}>{state.assets.find((x) => x.id === a.assetId)?.name ?? a.assetId}</strong>
                  <div style={{ color: 'var(--text-2)' }}>{a.summary}</div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ margin: '16px 0 4px', fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', color: 'var(--text-3)', textTransform: 'uppercase' }}>
            Untouched
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {state.assets
              .filter((a) => !staged.actions.some((x) => x.assetId === a.id))
              .map((a) => (
                <span key={a.id} className="chip" style={{ fontSize: 11 }}>
                  {a.criticality === 'critical' && <LockIcon size={10} />}
                  {a.name}
                </span>
              ))}
          </div>

          {m.comfortNotes.length > 0 && (
            <div style={{ marginTop: 14, fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5 }}>
              {m.comfortNotes.map((n) => (
                <div key={n} style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                  <span style={{ color: 'var(--orange)', flex: 'none' }}>
                    <WarnIcon size={12} />
                  </span>
                  {n}
                </div>
              ))}
            </div>
          )}

          <div
            style={{
              marginTop: 14,
              padding: '10px 12px',
              borderRadius: 10,
              background: 'var(--green-soft)',
              fontSize: 12,
              color: 'var(--green)',
              display: 'flex',
              gap: 8,
              lineHeight: 1.45,
            }}
          >
            <ShieldIcon size={15} />
            <span>
              <strong>Rollback ready.</strong> An exact inverse schedule is stored with this stage — one click restores the
              prior schedule to the watt-hour.
            </span>
          </div>
        </div>

        <div style={{ padding: 16, borderTop: '1px solid var(--hairline-soft)' }}>
          {!approved ? (
            <>
              <button ref={approveRef} className="btn success big" onClick={() => state.approveStaged()} data-testid="approve-btn">
                <CheckIcon size={15} /> Approve and apply schedule
              </button>
              <div style={{ fontSize: 11, color: 'var(--text-3)', textAlign: 'center', marginTop: 8, lineHeight: 1.45 }}>
                The agent cannot see <code style={{ fontFamily: 'var(--font-mono)' }}>commit_load_plan</code> until you approve.
              </div>
            </>
          ) : (
            <>
              <button className="btn primary big" onClick={commit} data-testid="commit-btn">
                Apply now
              </button>
              <div style={{ fontSize: 11, color: 'var(--green)', textAlign: 'center', marginTop: 8, fontFamily: 'var(--font-mono)' }}>
                approval token issued · commit_load_plan is now discoverable
              </div>
            </>
          )}
        </div>
      </aside>
    </>
  )
}

function ReviewRow({ k, v, status, testid }: { k: string; v: string; status?: boolean; testid?: string }) {
  return (
    <div className="review-row" data-testid={testid}>
      <span className="k">{k}</span>
      <span className="v" style={{ color: status === undefined ? 'var(--text)' : status ? 'var(--green)' : 'var(--red)' }}>
        {status !== undefined && (status ? <CheckIcon size={13} /> : <XIcon size={13} />)} {v}
      </span>
    </div>
  )
}
