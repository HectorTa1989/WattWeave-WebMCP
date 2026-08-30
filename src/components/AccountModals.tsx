import { useState } from 'react'
import { useStore } from '../state/store'
import { FEATURES, PRO_PRICE_LABEL, type FeatureKey } from '../billing/entitlements'
import { DEMO_LICENSE_KEY, openCheckout, POLAR_ORG } from '../billing/polar'
import { CheckIcon, SparkIcon, XIcon } from './Icons'

/**
 * Paywall + sign-in. Payments run through Polar.sh hosted checkout — WattWeave
 * never sees card data. The seeded admin account unlocks every paid feature
 * without a subscription, for demos and internal operators.
 */

export function UpgradeModal({ onClose }: { onClose: () => void }) {
  const state = useStore()
  const [key, setKey] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const activate = async () => {
    setBusy(true)
    setMsg(null)
    const r = await state.activateLicense(key)
    setBusy(false)
    if (r.ok) {
      setMsg(r.value.message)
      setTimeout(onClose, 900)
    } else {
      setMsg(r.message)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Upgrade to WattWeave Pro" data-testid="upgrade-modal">
        <div style={{ display: 'flex', alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <h2>WattWeave Pro</h2>
            <p className="sub">
              {PRO_PRICE_LABEL} per building · billed through Polar.sh. Cancel any time.
            </p>
          </div>
          <button className="btn ghost" onClick={onClose} aria-label="Close">
            <XIcon size={15} />
          </button>
        </div>

        {(Object.keys(FEATURES) as FeatureKey[]).map((k) => (
          <div className="perk" key={k}>
            <span className="icon">
              <CheckIcon size={15} />
            </span>
            <span>
              <strong>{FEATURES[k].title}</strong>
              <div style={{ color: 'var(--text-2)', fontSize: 12.5 }}>{FEATURES[k].blurb}</div>
            </span>
          </div>
        ))}

        <div style={{ fontSize: 12, color: 'var(--text-2)', margin: '6px 0 14px', lineHeight: 1.5, padding: '9px 11px', background: 'var(--panel-inset)', borderRadius: 9 }}>
          Safety features are never paywalled: locks, simulation, staging, approval, commit and rollback work on every plan.
        </div>

        <button className="btn primary big" onClick={openCheckout} data-testid="checkout-btn">
          <SparkIcon size={15} /> Subscribe with Polar
        </button>

        <div style={{ textAlign: 'center', fontSize: 11.5, color: 'var(--text-3)', margin: '12px 0 8px' }}>
          Already subscribed? Enter your license key
        </div>
        <div style={{ display: 'flex', gap: 7 }}>
          <input
            className="license-input"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder={DEMO_LICENSE_KEY}
            aria-label="Polar license key"
            data-testid="license-input"
            style={{
              flex: 1,
              border: '1px solid var(--hairline)',
              borderRadius: 10,
              background: 'var(--panel-inset)',
              color: 'var(--text)',
              fontSize: 13,
              padding: '9px 12px',
              fontFamily: 'var(--font-mono)',
            }}
            onKeyDown={(e) => e.key === 'Enter' && activate()}
          />
          <button className="btn" onClick={activate} disabled={busy} data-testid="activate-license">
            {busy ? '…' : 'Activate'}
          </button>
        </div>
        {msg && (
          <div className="form-error" style={{ color: msg.includes('accepted') || msg.includes('validated') ? 'var(--green)' : 'var(--red)' }} data-testid="license-msg">
            {msg}
          </div>
        )}
        <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 10, textAlign: 'center', lineHeight: 1.5 }}>
          Demo build: any key shaped <code style={{ fontFamily: 'var(--font-mono)' }}>WATT-XXXX-XXXX</code> is accepted offline.
          Manage real subscriptions at polar.sh/{POLAR_ORG}.
        </div>
      </div>
    </div>
  )
}

export function SignInModal({ onClose }: { onClose: () => void }) {
  const state = useStore()
  const [email, setEmail] = useState('admin@wattweave.app')
  const [password, setPassword] = useState('wattweave-admin')
  const [error, setError] = useState<string | null>(null)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const r = state.signIn(email, password)
    if (r.ok) onClose()
    else setError(r.message)
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Sign in" data-testid="signin-modal">
        <h2>Sign in</h2>
        <p className="sub">Demo authentication — no server, no real credentials.</p>
        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="ww-email">Email</label>
            <input id="ww-email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" data-testid="signin-email" />
          </div>
          <div className="field">
            <label htmlFor="ww-pass">Password</label>
            <input id="ww-pass" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" data-testid="signin-password" />
          </div>
          {error && <div className="form-error">{error}</div>}
          <button className="btn primary big" type="submit" style={{ marginTop: 6 }} data-testid="signin-submit">
            Sign in
          </button>
        </form>
        <div style={{ marginTop: 14, fontSize: 11.5, color: 'var(--text-2)', lineHeight: 1.6, background: 'var(--panel-inset)', padding: '10px 12px', borderRadius: 9 }}>
          <strong style={{ color: 'var(--text)' }}>Demo accounts</strong>
          <div style={{ fontFamily: 'var(--font-mono)', marginTop: 5 }}>
            admin@wattweave.app / wattweave-admin
            <div style={{ color: 'var(--text-3)' }}>→ Admin · all Pro features unlocked</div>
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', marginTop: 6 }}>
            operator@wattweave.app / wattweave-demo
            <div style={{ color: 'var(--text-3)' }}>→ Operator · Free plan</div>
          </div>
        </div>
      </div>
    </div>
  )
}
