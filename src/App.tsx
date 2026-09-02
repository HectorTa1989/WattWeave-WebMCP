import { useEffect, useState } from 'react'
import { useStore, resetStore } from './state/store'
import { initWebMcpTools } from './webmcp/tools'
import { getToolsSnapshot, subscribeTools } from './webmcp/adapter'
import { useSyncExternalStore } from 'react'
import { EventBanner } from './components/EventBanner'
import { LoadTimeline } from './components/LoadTimeline'
import { FlowView } from './components/FlowView'
import { AssetPanel } from './components/AssetPanel'
import { PlannerPanel } from './components/PlannerPanel'
import { ApprovalDrawer } from './components/ApprovalDrawer'
import { ReceiptPanel } from './components/ReceiptPanel'
import { Inspector } from './components/Inspector'
import { SignInModal, UpgradeModal } from './components/AccountModals'
import { BoltIcon, MoonIcon, SparkIcon, TerminalIcon, UndoIcon } from './components/Icons'
import { controlMode } from './integrations/controlGateway'

type Theme = 'light' | 'dark' | 'system'

export default function App() {
  const state = useStore()
  const [inspectorOpen, setInspectorOpen] = useState(false)
  const [upgradeOpen, setUpgradeOpen] = useState(false)
  const [signInOpen, setSignInOpen] = useState(false)
  const [theme, setTheme] = useState<Theme>('system')
  const tools = useSyncExternalStore(subscribeTools, getToolsSnapshot, getToolsSnapshot)

  useEffect(() => initWebMcpTools(), [])

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'system') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', theme)
  }, [theme])

  const user = state.user
  const isAdmin = user?.role === 'admin'
  const isPro = user?.plan === 'pro'
  const control = controlMode()

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">
            <BoltIcon size={19} />
          </div>
          <div>
            <div className="brand-name">WattWeave</div>
            <div className="brand-sub">Peak alert → safe load plan, in seconds</div>
          </div>
        </div>

        <div className="topbar-spacer" />

        <span className="chip accent" title="Tools registered for the current UI state" data-testid="tool-count">
          <TerminalIcon size={12} /> {tools.tools.length} tools live
        </span>

        <span
          className={`chip ${control === 'live-gateway' ? 'good' : 'warn'}`}
          title={control === 'live-gateway' ? 'Approved commands route through the configured control gateway' : 'No command can leave this browser'}
          data-testid="control-mode"
        >
          <span className="dot" /> {control === 'live-gateway' ? 'Control gateway' : 'Sandbox · no devices'}
        </span>

        {user ? (
          <>
            <span className={`chip ${isPro ? 'good' : ''}`} data-testid="plan-chip">
              {isAdmin ? 'Admin · all features' : isPro ? 'Pro' : 'Free plan'}
            </span>
            {!isPro && (
              <button className="btn primary" onClick={() => setUpgradeOpen(true)} data-testid="upgrade-btn">
                <SparkIcon size={13} /> Upgrade
              </button>
            )}
            <button className="btn ghost" onClick={() => state.signOut()} title={`Signed in as ${user.email}`} data-testid="signout-btn">
              {user.name.split(' ')[0]}
            </button>
          </>
        ) : (
          <button className="btn primary" onClick={() => setSignInOpen(true)} data-testid="signin-btn">
            Sign in
          </button>
        )}

        <button className="btn ghost" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="Toggle dark mode" title="Toggle appearance">
          <MoonIcon size={15} />
        </button>
        <button className="btn ghost" onClick={() => resetStore()} title="Reset the demo scenario" data-testid="reset-btn">
          <UndoIcon size={14} />
        </button>
        <button className={`btn ${inspectorOpen ? 'primary' : ''}`} onClick={() => setInspectorOpen((v) => !v)} data-testid="inspector-toggle">
          <TerminalIcon size={13} /> Inspector
        </button>
      </header>

      <div style={{ marginTop: 16 }}>
        <EventBanner />
      </div>

      <div className="main-grid">
        <div className="col">
          <LoadTimeline />
          <PlannerPanel onUpgrade={() => setUpgradeOpen(true)} />
        </div>
        <div className="col">
          <AssetPanel />
          <FlowView />
          <ReceiptPanel onUpgrade={() => setUpgradeOpen(true)} />
        </div>
      </div>

      <ApprovalDrawer />
      {inspectorOpen && <Inspector onClose={() => setInspectorOpen(false)} />}
      {upgradeOpen && <UpgradeModal onClose={() => setUpgradeOpen(false)} />}
      {signInOpen && <SignInModal onClose={() => setSignInOpen(false)} />}

      <footer style={{ marginTop: 28, fontSize: 11.5, color: 'var(--text-3)', textAlign: 'center', lineHeight: 1.6 }}>
        {control === 'live-gateway'
          ? `Connected control-gateway mode · schedule data remains the deterministic ${state.scenarioId} scenario`
          : `Deterministic sandbox · no real building control or telemetry · seed ${state.scenarioId}`}
        <br />
        Built by{' '}
        <a href="https://github.com/HectorTa1989" style={{ color: 'var(--text-2)' }} target="_blank" rel="noopener noreferrer">
          HectorTa1989
        </a>{' '}
        · billing by Polar.sh
      </footer>
    </div>
  )
}
