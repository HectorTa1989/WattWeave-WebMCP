import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore, activeGridWh } from '../state/store'
import { fmtKw, whPerSlotToW } from '../domain/time'
import { usePulse, useReducedMotion } from '../hooks/usePulse'
import { hasFeature } from '../billing/entitlements'
import { GridIcon, SunIcon, BatteryIcon, BuildingIcon, SparkIcon } from './Icons'

/**
 * Energy-flow view: grid, solar and battery feeding the building's zones.
 * Particle density and speed track schedule-derived dispatch numbers, so the animation is
 * a readout, not decoration. Free plan gets static proportional arrows.
 */

interface Edge {
  id: string
  from: [number, number]
  to: [number, number]
  watts: number
  color: string
  label: string
}

export function FlowView() {
  const state = useStore()
  const pulsing = usePulse('flow')
  const reduced = useReducedMotion()
  const pro = hasFeature(state.user, 'flow.particles')
  const [t, setT] = useState(0)
  const raf = useRef<number | null>(null)

  const { event, assets, candidates, previewCandidateId, staged, committed, nowSlot } = state
  const previewing = candidates.find((c) => c.id === previewCandidateId) ?? null

  /** Sample the event peak slot so the diagram shows the moment that matters. */
  const sampleSlot = event.windowStartSlot + 1

  const flows = useMemo(() => {
    const grid = activeGridWh(state)
    const ghost = previewing?.gridWh ?? staged?.gridWh ?? null
    const active = ghost ?? grid

    const solarW = Math.max(
      0,
      -whPerSlotToW(assets.find((a) => a.kind === 'solar')?.baselineWh[sampleSlot] ?? 0),
    )

    let batteryW = 0
    const source = previewing ?? staged ?? committed
    if (source) {
      for (const a of source.actions) {
        if (a.type !== 'battery-discharge') continue
        batteryW += -whPerSlotToW(a.deltaWh[sampleSlot] ?? 0)
      }
    }

    const gridW = Math.max(0, whPerSlotToW(active[sampleSlot]))

    const zoneLoads = state.zones
      .filter((z) => z.id !== 'plant')
      .map((zone) => {
        let w = 0
        for (const id of zone.assetIds) {
          const asset = assets.find((a) => a.id === id)
          if (!asset || asset.kind === 'solar' || asset.kind === 'battery') continue
          let wh = asset.baselineWh[sampleSlot]
          if (source) {
            for (const act of source.actions) {
              if (act.assetId === id) wh += act.deltaWh[sampleSlot] ?? 0
            }
          }
          w += whPerSlotToW(wh)
        }
        return { zone, watts: Math.max(0, w) }
      })

    return { solarW, batteryW, gridW, zoneLoads, isGhost: Boolean(ghost) }
  }, [state, assets, previewing, staged, committed, sampleSlot])

  useEffect(() => {
    if (reduced || !pro) return
    const loop = () => {
      setT((v) => (v + 1) % 100000)
      raf.current = requestAnimationFrame(loop)
    }
    raf.current = requestAnimationFrame(loop)
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current)
    }
  }, [reduced, pro])

  const W = 400
  const H = 236
  const hubX = 196
  const hubY = 106

  const sources: Array<{ id: string; y: number; watts: number; color: string; icon: React.ReactNode; label: string }> = [
    { id: 'grid', y: 34, watts: flows.gridW, color: 'var(--blue)', icon: <GridIcon size={15} />, label: 'Grid' },
    { id: 'solar', y: 106, watts: flows.solarW, color: 'var(--yellow)', icon: <SunIcon size={15} />, label: 'Solar' },
    { id: 'battery', y: 178, watts: flows.batteryW, color: 'var(--green-vivid)', icon: <BatteryIcon size={15} />, label: 'Battery' },
  ]

  const zoneY = (i: number, n: number) => 26 + (i * (H - 62)) / Math.max(1, n - 1)

  const edges: Edge[] = [
    ...sources.map((s) => ({
      id: `src-${s.id}`,
      from: [66, s.y] as [number, number],
      to: [hubX - 22, hubY] as [number, number],
      watts: s.watts,
      color: s.color,
      label: s.label,
    })),
    ...flows.zoneLoads.map((z, i) => ({
      id: `zone-${z.zone.id}`,
      from: [hubX + 22, hubY] as [number, number],
      to: [W - 108, zoneY(i, flows.zoneLoads.length)] as [number, number],
      watts: z.watts,
      color: 'var(--graphite)',
      label: z.zone.name,
    })),
  ]

  const maxFlow = Math.max(1, ...edges.map((e) => e.watts))
  const strokeFor = (w: number) => 1 + 5 * Math.sqrt(w / maxFlow)

  const curve = (e: Edge) => {
    const [x1, y1] = e.from
    const [x2, y2] = e.to
    const mx = (x1 + x2) / 2
    return `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`
  }

  /** Position a particle along a cubic bezier at parameter u. */
  const bezierPoint = (e: Edge, u: number): [number, number] => {
    const [x1, y1] = e.from
    const [x2, y2] = e.to
    const mx = (x1 + x2) / 2
    const mt = 1 - u
    const x = mt ** 3 * x1 + 3 * mt ** 2 * u * mx + 3 * mt * u ** 2 * mx + u ** 3 * x2
    const y = mt ** 3 * y1 + 3 * mt ** 2 * u * y1 + 3 * mt * u ** 2 * y2 + u ** 3 * y2
    return [x, y]
  }

  return (
    <section className={`card ${pulsing ? 'pulsing' : ''}`} data-testid="flow-view">
      <header className="card-head">
        <div>
          <h2 className="card-title">Energy flow</h2>
          <div className="card-sub">
            {flows.isGhost ? 'Proposed dispatch' : 'Current dispatch'} at {String(Math.floor(sampleSlot / 4)).padStart(2, '0')}:
            {String((sampleSlot % 4) * 15).padStart(2, '0')}
          </div>
        </div>
        <div className="right">
          {flows.isGhost && <span className="chip accent">preview</span>}
          {!pro && (
            <span className="badge pro" title="Living Grid+ animated particles">
              PRO
            </span>
          )}
        </div>
      </header>

      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }} role="img" aria-label={`Energy flow: grid ${fmtKw(flows.gridW)}, solar ${fmtKw(flows.solarW)}, battery ${fmtKw(flows.batteryW)} supplying ${flows.zoneLoads.length} building zones.`}>
        {edges.map((e) => (
          <g key={e.id}>
            <path d={curve(e)} fill="none" stroke={e.color} strokeWidth={strokeFor(e.watts)} strokeOpacity={e.watts > 0 ? 0.28 : 0.08} strokeLinecap="round" />
            {e.watts > 0 &&
              (pro && !reduced ? (
                (() => {
                  const count = Math.min(5, 1 + Math.floor((e.watts / maxFlow) * 5))
                  const speed = 0.0022 + 0.0016 * (e.watts / maxFlow)
                  return Array.from({ length: count }, (_unused, i) => {
                    const u = (((t * speed + i / count) % 1) + 1) % 1
                    const [px, py] = bezierPoint(e, u)
                    return <circle key={i} cx={px} cy={py} r={1.9} fill={e.color} opacity={0.95} />
                  })
                })()
              ) : (
                <ArrowHead edge={e} curve={curve(e)} />
              ))}
          </g>
        ))}

        {/* sources */}
        {sources.map((s) => (
          <g key={s.id}>
            <rect x={8} y={s.y - 17} width={58} height={34} rx={9} fill="var(--panel-solid)" stroke={s.watts > 0 ? s.color : 'var(--hairline)'} strokeWidth={s.watts > 0 ? 1.6 : 1} />
            <g transform={`translate(16, ${s.y - 9})`} color={s.color}>
              {s.icon}
            </g>
            <text x={35} y={s.y - 1} className="flow-node-label" textAnchor="start" dx={2}>
              {s.label}
            </text>
            <text x={16} y={s.y + 12} className="flow-node-value" fill={s.watts > 0 ? s.color : 'var(--text-3)'}>
              {fmtKw(s.watts)}
            </text>
          </g>
        ))}

        {/* hub */}
        <circle cx={hubX} cy={hubY} r={21} fill="var(--panel-solid)" stroke="var(--hairline)" strokeWidth="1.4" />
        <g transform={`translate(${hubX - 9}, ${hubY - 9})`} color="var(--text-2)">
          <BuildingIcon size={18} />
        </g>
        <text x={hubX} y={hubY + 34} textAnchor="middle" className="flow-node-label">
          Main panel
        </text>

        {/* zones */}
        {flows.zoneLoads.map((z, i) => {
          const yy = zoneY(i, flows.zoneLoads.length)
          return (
            <g key={z.zone.id}>
              <rect x={W - 108} y={yy - 14} width={100} height={28} rx={8} fill="var(--panel-inset)" stroke="var(--hairline-soft)" />
              <text x={W - 100} y={yy - 2} className="flow-node-label" fontSize="10">
                {z.zone.name}
              </text>
              <text x={W - 100} y={yy + 10} className="flow-node-value" fontSize="9.5">
                {fmtKw(z.watts)}
              </text>
            </g>
          )
        })}
      </svg>

      {!pro && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: 'var(--text-2)', marginTop: 6 }}>
          <SparkIcon size={13} />
          Static flow shown. Living Grid+ animates schedule dispatch — included with Pro.
        </div>
      )}
      <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6 }}>
        Now: {fmtKw(whPerSlotToW(activeGridWh(state)[nowSlot]))} at the meter
      </div>
    </section>
  )
}

function ArrowHead({ edge, curve }: { edge: Edge; curve: string }) {
  const id = `arrow-${edge.id}`
  return (
    <>
      <defs>
        <marker id={id} markerWidth="7" markerHeight="7" refX="5.5" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 z" fill={edge.color} opacity="0.85" />
        </marker>
      </defs>
      <path d={curve} fill="none" stroke="transparent" strokeWidth="1" markerEnd={`url(#${id})`} />
    </>
  )
}
