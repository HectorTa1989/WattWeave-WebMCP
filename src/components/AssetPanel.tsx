import { useStore, isAssetLocked } from '../state/store'
import type { EnergyAsset } from '../domain/types'
import { fmtKw, fmtKwh, slotLabel, whPerSlotToW } from '../domain/time'
import { usePulse } from '../hooks/usePulse'
import {
  AccessibilityIcon,
  BatteryIcon,
  BuildingIcon,
  CarIcon,
  DishIcon,
  LockIcon,
  ServerIcon,
  SnowIcon,
  SunIcon,
} from './Icons'

/**
 * Zone and device cards. This is where the human pins what cannot change:
 * a lock here immediately reshapes the agent's available tool surface.
 */

const ICONS: Record<string, { node: React.ReactNode; bg: string }> = {
  'server-room': { node: <ServerIcon />, bg: 'var(--red-vivid)' },
  accessibility: { node: <AccessibilityIcon />, bg: 'var(--red-vivid)' },
  'hvac-auditorium': { node: <SnowIcon />, bg: 'var(--blue)' },
  'ev-1': { node: <CarIcon />, bg: 'var(--purple-vivid)' },
  'ev-2': { node: <CarIcon />, bg: 'var(--purple-vivid)' },
  dishwasher: { node: <DishIcon />, bg: 'var(--orange-vivid)' },
  battery: { node: <BatteryIcon />, bg: 'var(--green-vivid)' },
  solar: { node: <SunIcon />, bg: 'var(--yellow)' },
  'computer-lab': { node: <BuildingIcon />, bg: 'var(--graphite)' },
  common: { node: <BuildingIcon />, bg: 'var(--graphite)' },
}

export function AssetPanel() {
  const state = useStore()
  const { zones, assets, selectedAssetId } = state
  const lockedCount = assets.filter((a) => isAssetLocked(state, a.id)).length

  return (
    <section className="card" data-testid="asset-panel">
      <header className="card-head">
        <div>
          <h2 className="card-title">Zones &amp; devices</h2>
          <div className="card-sub">Pin what must not change — tools update instantly</div>
        </div>
        <div className="right">
          <span className="chip">
            <LockIcon size={12} />
            {lockedCount}/{assets.length}
          </span>
        </div>
      </header>

      {zones.map((zone) => (
        <div key={zone.id}>
          <div className="zone-label">{zone.name}</div>
          {zone.assetIds.map((id) => {
            const asset = assets.find((a) => a.id === id)
            if (!asset) return null
            return <AssetRow key={id} asset={asset} selected={selectedAssetId === id} />
          })}
        </div>
      ))}
    </section>
  )
}

function AssetRow({ asset, selected }: { asset: EnergyAsset; selected: boolean }) {
  const state = useStore()
  const pulsing = usePulse(`asset:${asset.id}`)
  const locked = isAssetLocked(state, asset.id)
  const icon = ICONS[asset.id] ?? { node: <BuildingIcon />, bg: 'var(--graphite)' }
  const permanent = Boolean(asset.permanentlyLocked)

  const nowW = whPerSlotToW(asset.baselineWh[state.nowSlot])
  const draw = asset.kind === 'solar' ? `${fmtKw(Math.abs(nowW))} generating` : fmtKw(nowW)

  // Is this asset touched by the plan currently on screen?
  const activePlan =
    state.candidates.find((c) => c.id === state.previewCandidateId) ?? state.staged ?? null
  const planned = activePlan?.actions.some((a) => a.assetId === asset.id) ?? false

  return (
    <>
      <div
        className={`device-row ${selected ? 'selected' : ''} ${pulsing ? 'pulsing' : ''}`}
        onClick={() => state.selectAsset(selected ? null : asset.id)}
        data-testid={`asset-${asset.id}`}
        role="button"
        tabIndex={0}
        aria-pressed={selected}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            state.selectAsset(selected ? null : asset.id)
          }
        }}
      >
        <div className="device-icon" style={{ background: icon.bg }}>
          {icon.node}
        </div>
        <div className="device-main">
          <div className="device-name">
            {asset.name}
            {locked && <LockIcon size={12} className="lock-glyph" />}
            {planned && <span className="badge planned">in plan</span>}
          </div>
          <div className="device-sub">
            {draw} · {asset.criticality === 'flexible' ? flexHint(asset) : asset.criticality === 'critical' ? 'always on' : 'not schedulable'}
          </div>
        </div>
        <span className={`badge ${asset.criticality}`}>
          {asset.criticality === 'critical' ? 'critical' : asset.criticality === 'flexible' ? 'flexible' : 'fixed'}
        </span>
        <button
          className={`toggle ${locked ? 'on' : ''}`}
          disabled={permanent}
          title={permanent ? 'Critical asset — permanently locked' : locked ? 'Unlock' : 'Lock so no plan can touch it'}
          aria-label={`${locked ? 'Unlock' : 'Lock'} ${asset.name}`}
          data-testid={`lock-${asset.id}`}
          onClick={(e) => {
            e.stopPropagation()
            state.setLock(asset.id, !locked, 'operator')
          }}
        />
      </div>
      {selected && <ConstraintEditor asset={asset} />}
    </>
  )
}

function flexHint(asset: EnergyAsset): string {
  const f = asset.flex
  if (!f) return 'flexible'
  switch (f.type) {
    case 'shift-earlier':
      return `≤${f.maxSlotsEarlier * 15} min early`
    case 'pausable':
      return `≤${f.maxPauseSlots * 15} min pause · out ${slotLabel(f.departureSlot)}`
    case 'defer-after':
      return `after ${slotLabel(f.earliestStartSlot)}`
    case 'battery':
      return `${fmtKwh(f.initialSocWh - f.reserveFloorWh)} usable`
  }
}

/** Human-facing constraint editor — the same surface `set_asset_constraint` writes to. */
function ConstraintEditor({ asset }: { asset: EnergyAsset }) {
  const state = useStore()
  const locked = isAssetLocked(state, asset.id)
  const f = asset.flex

  return (
    <div className="constraint-editor" data-testid={`constraints-${asset.id}`}>
      <div className="constraint-row">
        <span className="label">Locked · no plan may touch it</span>
        <button
          className={`toggle ${locked ? 'on' : ''}`}
          disabled={Boolean(asset.permanentlyLocked)}
          aria-label={`${locked ? 'Unlock' : 'Lock'} ${asset.name}`}
          onClick={() => state.setLock(asset.id, !locked, 'operator')}
        />
      </div>

      {f?.type === 'pausable' && (
        <Stepper
          label="Max pause"
          value={f.maxPauseSlots}
          min={0}
          max={6}
          format={(v) => `${v * 15} min`}
          onChange={(v) => state.setConstraint(asset.id, 'maxPauseSlots', v, 'operator')}
          hint={`Must deliver ${fmtKwh(f.minEnergyWh)} by ${slotLabel(f.departureSlot)}`}
        />
      )}

      {f?.type === 'shift-earlier' && (
        <Stepper
          label="Max pre-cool"
          value={f.maxSlotsEarlier}
          min={0}
          max={4}
          format={(v) => `${v * 15} min early`}
          onChange={(v) => state.setConstraint(asset.id, 'maxSlotsEarlier', v, 'operator')}
          hint="Cooling may only move earlier, never later"
        />
      )}

      {f?.type === 'defer-after' && (
        <Stepper
          label="Earliest restart"
          value={f.earliestStartSlot}
          min={state.nowSlot + 1}
          max={f.latestStartSlot}
          format={(v) => slotLabel(v)}
          onChange={(v) => state.setConstraint(asset.id, 'earliestStartSlot', v, 'operator')}
          hint={`${f.durationSlots * 15} min cycle`}
        />
      )}

      {f?.type === 'battery' && (
        <div className="constraint-row">
          <span className="label">Reserve floor</span>
          <strong style={{ fontSize: 12.5, color: 'var(--text)' }}>{fmtKwh(f.reserveFloorWh)}</strong>
        </div>
      )}

      {asset.note && (
        <div style={{ fontSize: 11.5, color: 'var(--text-2)', lineHeight: 1.45 }}>{asset.note}</div>
      )}

      <div style={{ fontSize: 10.5, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
        get_selected_asset · set_asset_constraint now scoped to {asset.id}
      </div>
    </div>
  )
}

function Stepper({
  label,
  value,
  min,
  max,
  format,
  onChange,
  hint,
}: {
  label: string
  value: number
  min: number
  max: number
  format: (v: number) => string
  onChange: (v: number) => void
  hint?: string
}) {
  return (
    <div className="constraint-row">
      <span className="label">
        {label}
        {hint && <div style={{ fontSize: 10.5, color: 'var(--text-3)', fontWeight: 500 }}>{hint}</div>}
      </span>
      <div className="stepper">
        <button onClick={() => onChange(value - 1)} disabled={value <= min} aria-label={`Decrease ${label}`}>
          −
        </button>
        <span className="val">{format(value)}</span>
        <button onClick={() => onChange(value + 1)} disabled={value >= max} aria-label={`Increase ${label}`}>
          +
        </button>
      </div>
    </div>
  )
}
