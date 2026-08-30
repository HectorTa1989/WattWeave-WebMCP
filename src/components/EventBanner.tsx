import { useState } from 'react'
import { useStore, activeGridWh } from '../state/store'
import { fmtKw, peakW, slotLabel12h, whPerSlotToW } from '../domain/time'
import { usePulse } from '../hooks/usePulse'
import { WarnIcon, CheckIcon, ChevronIcon, ShieldIcon } from './Icons'

/**
 * Demand-event banner + live meter. The tariff advisory from the utility feed
 * is rendered inside an explicit untrusted-content frame: visible to the human,
 * never interpreted as instructions by the agent.
 */

export function EventBanner() {
  const state = useStore()
  const pulsing = usePulse('meter')
  const [showNote, setShowNote] = useState(false)

  const grid = activeGridWh(state)
  const nowW = whPerSlotToW(grid[state.nowSlot])
  const windowPeak = peakW(grid, state.event.windowStartSlot, state.event.windowEndSlot)
  const compliant = windowPeak.w <= state.event.limitW
  const gap = windowPeak.w - state.event.limitW

  return (
    <section className={`card ${pulsing ? 'pulsing' : ''}`} data-testid="event-banner" style={{ padding: '14px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 11,
            display: 'grid',
            placeItems: 'center',
            background: compliant ? 'var(--green-soft)' : 'var(--red-soft)',
            color: compliant ? 'var(--green)' : 'var(--red)',
            flex: 'none',
          }}
        >
          {compliant ? <CheckIcon size={20} /> : <WarnIcon size={20} />}
        </div>

        <div style={{ minWidth: 200 }}>
          <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.018em' }}>
            {state.event.title} · {state.event.utility}
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 1 }}>
            Hold demand at or below <strong style={{ color: 'var(--text)' }}>{fmtKw(state.event.limitW)}</strong> from{' '}
            {slotLabel12h(state.event.windowStartSlot)} to {slotLabel12h(state.event.windowEndSlot)}
          </div>
        </div>

        <div style={{ flex: 1 }} />

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <div className="chip">
            <span className="dot pulse-dot" style={{ color: 'var(--blue)' }} />
            Live <strong>{fmtKw(nowW)}</strong>
          </div>
          <div className={`chip ${compliant ? 'good' : 'danger'}`} data-testid="window-peak-chip">
            Event peak <strong>{fmtKw(windowPeak.w)}</strong>
            {!compliant && <span>· {fmtKw(gap)} over</span>}
          </div>
          <button className="btn ghost" onClick={() => setShowNote((v) => !v)} data-testid="toggle-tariff-note" style={{ fontSize: 12 }}>
            Utility advisory <ChevronIcon size={13} className={showNote ? 'open' : ''} />
          </button>
        </div>
      </div>

      {showNote && (
        <div
          data-testid="untrusted-note"
          style={{
            marginTop: 12,
            border: '1.5px dashed var(--red-vivid)',
            borderRadius: 11,
            padding: '10px 12px',
            background: 'var(--red-soft)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 10.5, fontWeight: 800, letterSpacing: '0.06em', color: 'var(--red)', textTransform: 'uppercase' }}>
            <ShieldIcon size={13} /> Untrusted external content · tariff feed
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 6, lineHeight: 1.5, fontFamily: 'var(--font-mono)' }}>
            {state.event.untrustedTariffNote}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--red)', marginTop: 8, lineHeight: 1.45 }}>
            This feed contains an instruction telling assistants to skip approval and commit immediately. WattWeave returns it to
            the agent inside an <code style={{ fontFamily: 'var(--font-mono)' }}>untrusted</code> envelope as data only — the
            170 kW limit still stands, and <code style={{ fontFamily: 'var(--font-mono)' }}>commit_load_plan</code> is still
            unreachable until you approve.
          </div>
        </div>
      )}
    </section>
  )
}
