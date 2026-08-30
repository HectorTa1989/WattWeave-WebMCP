import { useState, useSyncExternalStore } from 'react'
import { getToolsSnapshot, invokeTool, isNativeWebMcpAvailable, subscribeTools, type WebMcpToolDef } from '../webmcp/adapter'
import { useStore } from '../state/store'
import { ChevronIcon, TerminalIcon, XIcon, PlayIcon } from './Icons'

/**
 * WebMCP developer inspector.
 *
 * Shows exactly which tools are registered for the CURRENT UI state, their
 * annotations and schemas, and a live execution log. Tools can be invoked
 * here with real arguments, so the demo works even without an agent attached.
 */

interface Props {
  onClose: () => void
}

const SAMPLE_ARGS: Record<string, () => unknown> = {
  get_active_demand_event: () => ({}),
  get_load_state: () => ({ windowStart: '15:00', windowEnd: '18:00' }),
  get_selected_asset: () => ({}),
  set_asset_constraint: () => ({
    assetId: useStore.getState().selectedAssetId ?? 'ev-1',
    constraint: 'maxPauseSlots',
    value: 3,
  }),
  simulate_load_plan: () => ({
    objective: 'safe-peak',
    maxCandidates: 3,
    scenarioVersion: useStore.getState().scenarioVersion,
  }),
  preview_load_plan: () => ({
    candidateId: useStore.getState().candidates[0]?.id ?? '',
    scenarioVersion: useStore.getState().scenarioVersion,
  }),
  stage_load_plan: () => ({
    candidateId: useStore.getState().previewCandidateId ?? '',
    scenarioVersion: useStore.getState().scenarioVersion,
    idempotencyKey: 'inspector-stage-1',
  }),
  get_staged_schedule: () => ({ stageId: useStore.getState().staged?.stageId ?? '' }),
  commit_load_plan: () => ({
    stageId: useStore.getState().staged?.stageId ?? '',
    approvalToken: useStore.getState().staged?.approvalToken ?? '',
    idempotencyKey: 'inspector-commit-1',
  }),
  rollback_load_plan: () => ({
    auditEventId: useStore.getState().committed?.auditEventId ?? '',
    idempotencyKey: 'inspector-rollback-1',
  }),
}

export function Inspector({ onClose }: Props) {
  const snapshot = useSyncExternalStore(subscribeTools, getToolsSnapshot, getToolsSnapshot)
  const [selected, setSelected] = useState<string | null>(null)
  const [args, setArgs] = useState('{}')
  const [result, setResult] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const scenarioVersion = useStore((s) => s.scenarioVersion)

  const selectedTool = snapshot.tools.find((t) => t.name === selected) ?? null

  const pick = (tool: WebMcpToolDef) => {
    setSelected(tool.name)
    setResult(null)
    const sample = SAMPLE_ARGS[tool.name]?.() ?? {}
    setArgs(JSON.stringify(sample, null, 2))
  }

  const run = async () => {
    if (!selectedTool) return
    setBusy(true)
    let parsed: unknown = {}
    try {
      parsed = JSON.parse(args || '{}')
    } catch {
      setResult('Invalid JSON in arguments')
      setBusy(false)
      return
    }
    const res = await invokeTool(selectedTool.name, parsed, { actor: 'inspector' })
    setResult(res.content[0]?.text ?? '')
    setBusy(false)
  }

  return (
    <aside className="inspector" data-testid="inspector" aria-label="WebMCP inspector">
      <header className="card-head" style={{ padding: '12px 16px 0', margin: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <TerminalIcon size={16} />
          <div>
            <h2 className="card-title">WebMCP inspector</h2>
            <div className="card-sub">
              {snapshot.tools.length} tools registered for the current UI state · scenario v{scenarioVersion} ·{' '}
              {isNativeWebMcpAvailable() ? 'navigator.modelContext bridged' : 'in-page registry (no agent attached)'}
            </div>
          </div>
        </div>
        <div className="right">
          <button className="btn ghost" onClick={onClose} aria-label="Close inspector">
            <XIcon size={15} />
          </button>
        </div>
      </header>

      <div className="inspector-grid">
        <div className="inspector-pane">
          <div className="zone-label" style={{ marginTop: 10 }}>
            Available tools
          </div>
          {snapshot.tools.map((tool) => (
            <button
              key={tool.name}
              className="tool-row"
              style={{ width: '100%', textAlign: 'left', cursor: 'pointer', borderColor: selected === tool.name ? 'var(--blue)' : undefined }}
              onClick={() => pick(tool)}
              data-testid={`tool-${tool.name}`}
            >
              <div className="tool-name">
                {tool.name}
                {tool.annotations.readOnlyHint && <span className="anno ro">read-only</span>}
                {!tool.annotations.readOnlyHint && <span className="anno write">{tool.annotations.uiStateOnly ? 'ui-state' : 'write'}</span>}
                {tool.annotations.cancellable && <span className="anno cancel">cancellable</span>}
                {tool.annotations.idempotentHint && <span className="anno">idempotent</span>}
                <ChevronIcon size={13} className="chev" />
              </div>
              <div className="tool-desc">{tool.description}</div>
              <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 4, fontWeight: 650 }}>{tool.annotations.lifecycle}</div>
            </button>
          ))}

          <div className="zone-label">Not yet available</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {ALL_TOOLS.filter((n) => !snapshot.tools.some((t) => t.name === n)).map((n) => (
              <span key={n} className="chip" style={{ fontSize: 11, fontFamily: 'var(--font-mono)', opacity: 0.65 }} data-testid={`unavailable-${n}`}>
                {n}
              </span>
            ))}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 8, lineHeight: 1.5 }}>
            Tools appear and disappear with UI state. <code style={{ fontFamily: 'var(--font-mono)' }}>commit_load_plan</code> is
            undiscoverable until the operator approves a staged schedule.
          </div>
        </div>

        <div className="inspector-pane">
          {selectedTool ? (
            <>
              <div className="zone-label" style={{ marginTop: 10 }}>
                Run {selectedTool.name}
              </div>
              <textarea className="args-input" value={args} onChange={(e) => setArgs(e.target.value)} spellCheck={false} aria-label="Tool arguments JSON" />
              <div style={{ display: 'flex', gap: 7, marginTop: 7 }}>
                <button className="btn primary" onClick={run} disabled={busy} data-testid="inspector-run">
                  <PlayIcon size={13} /> {busy ? 'Running…' : 'Execute'}
                </button>
                <button className="btn ghost" onClick={() => setResult(JSON.stringify(selectedTool.inputSchema, null, 2))}>
                  Show schema
                </button>
              </div>
              {result !== null && (
                <pre className="code-block" data-testid="inspector-result">
                  {result}
                </pre>
              )}
            </>
          ) : (
            <>
              <div className="zone-label" style={{ marginTop: 10 }}>
                Execution log
              </div>
              {snapshot.log.length === 0 && (
                <div style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5 }}>
                  Pick a tool to run it with real arguments, or watch calls arrive here as the agent works.
                </div>
              )}
              {[...snapshot.log].reverse().map((e) => (
                <div className="log-row" key={e.id}>
                  <span className="t">{e.at}</span>
                  <span style={{ color: e.ok ? 'var(--green)' : 'var(--red)', flex: 'none' }}>{e.ok ? '✓' : '✕'}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <strong>{e.name}</strong>
                    <span style={{ color: 'var(--text-3)' }}> ({e.actor}, {e.durationMs}ms)</span>
                    <div style={{ color: 'var(--text-2)', wordBreak: 'break-word' }}>{e.resultPreview}</div>
                  </span>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </aside>
  )
}

const ALL_TOOLS = [
  'get_active_demand_event',
  'get_load_state',
  'get_selected_asset',
  'set_asset_constraint',
  'simulate_load_plan',
  'preview_load_plan',
  'stage_load_plan',
  'get_staged_schedule',
  'commit_load_plan',
  'rollback_load_plan',
]
