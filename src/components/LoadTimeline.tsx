import { useMemo, useState } from 'react'
import { useStore, activeGridWh, isAssetLocked } from '../state/store'
import { buildChartSeries } from '../domain/schedule'
import { fmtKw, slotLabel, slotLabel12h, whPerSlotToW, SLOTS_PER_DAY } from '../domain/time'
import { usePulse, useReducedMotion } from '../hooks/usePulse'
import { LockIcon, WarnIcon, CheckIcon } from './Icons'

/**
 * The main "living grid" chart.
 *
 * Layers, bottom to top:
 *   1. tariff bands + event window shading
 *   2. stacked consumption areas (pattern + color, never color alone)
 *   3. on-site supply (solar / battery discharge) below the axis
 *   4. baseline net-demand line
 *   5. ghost preview line (dashed) when a candidate is previewed
 *   6. target limit line + rebound guard line
 *   7. simulation sweep cursor, now-marker, peak callout
 */

const STACK_STYLE: Record<string, { fill: string; pattern: string; label: string }> = {
  critical: { fill: 'var(--red-vivid)', pattern: 'p-diag', label: 'Critical (locked)' },
  base: { fill: 'var(--graphite)', pattern: 'p-none', label: 'Base building' },
  hvac: { fill: 'var(--blue)', pattern: 'p-none', label: 'HVAC' },
  ev: { fill: 'var(--purple-vivid)', pattern: 'p-dots', label: 'EV charging' },
  appliance: { fill: 'var(--orange-vivid)', pattern: 'p-none', label: 'Appliances' },
}

type Range = 'event' | 'day'

const RANGES: Record<Range, { start: number; end: number; label: string }> = {
  event: { start: 52, end: 76, label: 'Event' },
  day: { start: 0, end: 96, label: '24 h' },
}

export function LoadTimeline() {
  const state = useStore()
  const reduced = useReducedMotion()
  const pulsing = usePulse('chart')
  const windowPulse = usePulse('chart-window')
  const [hover, setHover] = useState<number | null>(null)
  const [range, setRange] = useState<Range>('event')
  const { start: viewStart, end: viewEnd } = RANGES[range]

  const { event, assets, previewCandidateId, candidates, staged, committed, sim, nowSlot } = state

  const previewCandidate = useMemo(
    () => candidates.find((c) => c.id === previewCandidateId) ?? null,
    [candidates, previewCandidateId],
  )

  // Stacks reflect the schedule actually in force, so composition and the net
  // line always tell the same story.
  const series = useMemo(
    () => buildChartSeries(assets, committed?.actions ?? []),
    [assets, committed],
  )
  const liveGrid = useMemo(() => activeGridWh(state), [state])
  const ghostGrid = previewCandidate?.gridWh ?? staged?.gridWh ?? null

  // ---- geometry ----
  const W = 980
  const H = 340
  const padL = 48
  const padR = 16
  const padT = 18
  const axisY = 250 // consumption baseline (y for 0 kW)
  const supplyH = 46 // band below axis for on-site supply
  const slots = viewEnd - viewStart
  const colW = (W - padL - padR) / slots

  const maxW = 260_000
  const x = (slot: number) => padL + (slot - viewStart) * colW
  const y = (watts: number) => axisY - ((axisY - padT) * watts) / maxW
  const ySupply = (watts: number) => axisY + (supplyH * watts) / 40_000

  const areaPath = (values: number[], baseValues: number[]) => {
    let d = ''
    for (let s = viewStart; s <= viewEnd; s++) {
      const v = whPerSlotToW(values[Math.min(s, SLOTS_PER_DAY - 1)] ?? 0)
      d += `${s === viewStart ? 'M' : 'L'}${x(s).toFixed(1)},${y(s === viewEnd ? whPerSlotToW(values[viewEnd - 1] ?? 0) : v).toFixed(1)} `
    }
    for (let s = viewEnd; s >= viewStart; s--) {
      const v = whPerSlotToW(baseValues[Math.min(s, SLOTS_PER_DAY - 1)] ?? 0)
      d += `L${x(s).toFixed(1)},${y(s === viewEnd ? whPerSlotToW(baseValues[viewEnd - 1] ?? 0) : v).toFixed(1)} `
    }
    return `${d}Z`
  }

  /** Step line — energy is per-slot, so a stepped line is the honest shape. */
  const stepLine = (values: number[]) => {
    let d = ''
    for (let s = viewStart; s < viewEnd; s++) {
      const v = y(whPerSlotToW(values[s] ?? 0))
      d += `${s === viewStart ? 'M' : 'L'}${x(s).toFixed(1)},${v.toFixed(1)} L${x(s + 1).toFixed(1)},${v.toFixed(1)} `
    }
    return d
  }

  const supplyBars = (values: number[], key: string) =>
    values.slice(viewStart, viewEnd).map((wh, i) => {
      const w = whPerSlotToW(wh)
      if (w <= 0) return null
      return (
        <rect
          key={`${key}-${i}`}
          x={x(viewStart + i) + 0.6}
          y={axisY + 1}
          width={Math.max(0, colW - 1.2)}
          height={Math.max(1.5, ySupply(w) - axisY)}
          rx={1.5}
          fill={key === 'solar' ? 'var(--yellow)' : 'var(--green-vivid)'}
          opacity={0.85}
        />
      )
    })

  // cumulative stacks
  const cumulative: number[][] = []
  let running = new Array<number>(SLOTS_PER_DAY).fill(0)
  for (const stack of series.stacks) {
    const next = running.map((v, i) => v + Math.max(0, stack.wh[i]))
    cumulative.push(next)
    running = next
  }

  const peakSlot = useMemo(() => {
    let best = -Infinity
    let bestSlot = viewStart
    for (let s = viewStart; s < viewEnd; s++) {
      if (liveGrid[s] > best) {
        best = liveGrid[s]
        bestSlot = s
      }
    }
    return bestSlot
  }, [liveGrid, viewStart, viewEnd])

  const peakValW = whPerSlotToW(liveGrid[peakSlot])
  const overLimit = peakValW > event.limitW
  const ghostPeakW = ghostGrid
    ? Math.max(...ghostGrid.slice(event.windowStartSlot, event.windowEndSlot).map(whPerSlotToW))
    : null

  const hoverSlot = hover
  const hoverGrid = hoverSlot !== null ? whPerSlotToW(liveGrid[hoverSlot]) : null
  const hoverGhost = hoverSlot !== null && ghostGrid ? whPerSlotToW(ghostGrid[hoverSlot]) : null

  return (
    <section className={`card ${pulsing || windowPulse ? 'pulsing' : ''}`} data-testid="load-timeline">
      <header className="card-head">
        <div>
          <h2 className="card-title">Building demand · {state.scenarioName}</h2>
          <div className="card-sub">
            15-minute intervals · {slotLabel(viewStart)}–{slotLabel(viewEnd)} · deterministic seed data
          </div>
        </div>
        <div className="right">
          <div className="segmented" role="group" aria-label="Chart range">
            {(Object.keys(RANGES) as Range[]).map((r) => (
              <button key={r} className={range === r ? 'active' : ''} onClick={() => setRange(r)}>
                {RANGES[r].label}
              </button>
            ))}
          </div>
          {committed ? (
            <span className="chip good" data-testid="chart-status">
              <CheckIcon size={13} /> Plan applied
            </span>
          ) : overLimit ? (
            <span className="chip danger" data-testid="chart-status">
              <WarnIcon size={13} /> Peak {fmtKw(peakValW)} over target
            </span>
          ) : (
            <span className="chip good" data-testid="chart-status">
              <CheckIcon size={13} /> Within target
            </span>
          )}
        </div>
      </header>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', height: 'auto', overflow: 'visible' }}
        role="img"
        aria-label={`Building demand from ${slotLabel(viewStart)} to ${slotLabel(viewEnd)}. Peak ${fmtKw(peakValW)} at ${slotLabel12h(peakSlot)}. Target limit ${fmtKw(event.limitW)} during ${slotLabel12h(event.windowStartSlot)} to ${slotLabel12h(event.windowEndSlot)}.`}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          const px = ((e.clientX - rect.left) / rect.width) * W
          const slot = Math.floor((px - padL) / colW) + viewStart
          setHover(slot >= viewStart && slot < viewEnd ? slot : null)
        }}
      >
        <defs>
          <pattern id="p-diag" width="6" height="6" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
            <rect width="6" height="6" fill="var(--red-vivid)" opacity="0.22" />
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--red-vivid)" strokeWidth="2.2" opacity="0.55" />
          </pattern>
          <pattern id="p-dots" width="7" height="7" patternUnits="userSpaceOnUse">
            <rect width="7" height="7" fill="var(--purple-vivid)" opacity="0.16" />
            <circle cx="3.5" cy="3.5" r="1.5" fill="var(--purple-vivid)" opacity="0.6" />
          </pattern>
          <linearGradient id="windowGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--red-vivid)" stopOpacity="0.13" />
            <stop offset="100%" stopColor="var(--red-vivid)" stopOpacity="0.02" />
          </linearGradient>
          <linearGradient id="sweepGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--blue)" stopOpacity="0" />
            <stop offset="100%" stopColor="var(--blue)" stopOpacity="0.5" />
          </linearGradient>
        </defs>

        {/* horizontal gridlines */}
        {[0, 50_000, 100_000, 150_000, 200_000, 250_000].map((v) => (
          <g key={v}>
            <line x1={padL} y1={y(v)} x2={W - padR} y2={y(v)} stroke="var(--chart-grid)" strokeWidth="1" />
            <text x={padL - 8} y={y(v) + 3.5} textAnchor="end" fontSize="10" fill="var(--text-3)" fontWeight="600">
              {v / 1000}
            </text>
          </g>
        ))}
        <text x={padL - 8} y={padT - 4} textAnchor="end" fontSize="9" fill="var(--text-3)" fontWeight="700">
          kW
        </text>

        {/* event window shading */}
        <rect
          x={x(event.windowStartSlot)}
          y={padT - 6}
          width={x(event.windowEndSlot) - x(event.windowStartSlot)}
          height={axisY - padT + 6}
          fill="url(#windowGrad)"
        />
        <line
          x1={x(event.windowStartSlot)}
          y1={padT - 6}
          x2={x(event.windowStartSlot)}
          y2={axisY}
          stroke="var(--red-vivid)"
          strokeWidth="1.2"
          strokeDasharray="3 3"
          opacity="0.7"
        />
        <line
          x1={x(event.windowEndSlot)}
          y1={padT - 6}
          x2={x(event.windowEndSlot)}
          y2={axisY}
          stroke="var(--red-vivid)"
          strokeWidth="1.2"
          strokeDasharray="3 3"
          opacity="0.7"
        />
        <text
          x={(x(event.windowStartSlot) + x(event.windowEndSlot)) / 2}
          y={padT + 5}
          textAnchor="middle"
          fontSize="10"
          fontWeight="700"
          fill="var(--red)"
          letterSpacing="0.06em"
        >
          DEMAND EVENT · {slotLabel(event.windowStartSlot)}–{slotLabel(event.windowEndSlot)}
        </text>

        {/* rebound guard region */}
        <rect
          x={x(event.windowEndSlot)}
          y={padT - 6}
          width={colW * event.reboundWindowSlots}
          height={axisY - padT + 6}
          fill="var(--orange-vivid)"
          opacity="0.06"
        />
        <text
          x={x(event.windowEndSlot) + (colW * event.reboundWindowSlots) / 2}
          y={axisY - 6}
          textAnchor="middle"
          fontSize="9"
          fontWeight="700"
          fill="var(--orange)"
          letterSpacing="0.05em"
          opacity="0.85"
        >
          REBOUND GUARD
        </text>

        {/* stacked consumption */}
        {series.stacks.map((stack, i) => {
          const style = STACK_STYLE[stack.key]
          const upper = cumulative[i]
          const lower = i === 0 ? new Array<number>(SLOTS_PER_DAY).fill(0) : cumulative[i - 1]
          return (
            <path
              key={stack.key}
              d={areaPath(upper, lower)}
              fill={style.pattern === 'p-none' ? style.fill : `url(#${style.pattern})`}
              opacity={style.pattern === 'p-none' ? 0.5 : 1}
              stroke={style.fill}
              strokeWidth="0.6"
              strokeOpacity="0.5"
            />
          )
        })}

        {/* on-site supply band below the axis */}
        <line x1={padL} y1={axisY} x2={W - padR} y2={axisY} stroke="var(--text-3)" strokeWidth="1.2" />
        {supplyBars(series.supplies[0].wh, 'solar')}
        {supplyBars(series.supplies[1].wh, 'battery')}
        {previewCandidate &&
          supplyBars(
            (() => {
              const arr = new Array<number>(SLOTS_PER_DAY).fill(0)
              for (const a of previewCandidate.actions) {
                if (a.type !== 'battery-discharge') continue
                for (const [s, wh] of Object.entries(a.deltaWh)) arr[Number(s)] = -wh
              }
              return arr
            })(),
            'battery-ghost',
          )}
        <text x={padL} y={axisY + supplyH + 12} fontSize="9" fill="var(--text-3)" fontWeight="700">
          ON-SITE SUPPLY
        </text>

        {/* time axis labels */}
        {Array.from({ length: slots + 1 }, (_, i) => viewStart + i)
          .filter((s) => s % (slots > 40 ? 8 : 4) === 0)
          .map((s) => (
            <text
              key={s}
              x={x(s)}
              y={axisY + supplyH + 26}
              textAnchor="middle"
              fontSize="10"
              fill="var(--text-3)"
              fontWeight="600"
            >
              {slotLabel(s)}
            </text>
          ))}

        {/* live net demand line */}
        <path
          d={stepLine(liveGrid)}
          fill="none"
          stroke="var(--chart-line)"
          strokeWidth="2.4"
          strokeLinejoin="round"
          data-testid="live-line"
        />

        {/* ghost preview */}
        {ghostGrid && (
          <>
            <path
              d={stepLine(ghostGrid)}
              fill="none"
              stroke="var(--green-vivid)"
              strokeWidth="2.6"
              strokeDasharray="7 4"
              strokeLinejoin="round"
              data-testid="ghost-line"
              style={reduced ? undefined : { animation: 'fadeIn 0.5s' }}
            />
            <text
              x={x(event.windowStartSlot) + 6}
              y={y(ghostPeakW ?? 0) - 7}
              fontSize="10.5"
              fontWeight="700"
              fill="var(--green)"
            >
              proposed {fmtKw(ghostPeakW ?? 0)}
            </text>
          </>
        )}

        {/* target line — solid where the limit binds, faint elsewhere */}
        <line
          x1={padL}
          y1={y(event.limitW)}
          x2={W - padR}
          y2={y(event.limitW)}
          stroke="var(--green-vivid)"
          strokeWidth="1.4"
          strokeDasharray="2 5"
          opacity="0.45"
        />
        <line
          x1={x(event.windowStartSlot)}
          y1={y(event.limitW)}
          x2={x(event.windowEndSlot)}
          y2={y(event.limitW)}
          stroke="var(--green-vivid)"
          strokeWidth="3"
          data-testid="target-line"
        />
        <rect x={x(event.windowEndSlot) + 5} y={y(event.limitW) - 7.5} width="92" height="15" rx="4" fill="var(--green-vivid)" />
        <text x={x(event.windowEndSlot) + 51} y={y(event.limitW) + 4} textAnchor="middle" fontSize="9.5" fontWeight="800" fill="#04310f">
          TARGET {fmtKw(event.limitW)}
        </text>

        <line
          x1={x(event.windowEndSlot)}
          y1={y(event.reboundGuardW)}
          x2={W - padR}
          y2={y(event.reboundGuardW)}
          stroke="var(--orange-vivid)"
          strokeWidth="1.6"
          strokeDasharray="5 4"
        />
        <text x={W - padR - 4} y={y(event.reboundGuardW) - 5} textAnchor="end" fontSize="9.5" fontWeight="700" fill="var(--orange)">
          REBOUND GUARD {fmtKw(event.reboundGuardW)}
        </text>

        {/* peak callout */}
        <circle cx={x(peakSlot) + colW / 2} cy={y(peakValW)} r="4.5" fill={overLimit ? 'var(--red-vivid)' : 'var(--green-vivid)'} />
        <circle
          cx={x(peakSlot) + colW / 2}
          cy={y(peakValW)}
          r="9"
          fill="none"
          stroke={overLimit ? 'var(--red-vivid)' : 'var(--green-vivid)'}
          strokeWidth="1.5"
          opacity="0.45"
        >
          {!reduced && <animate attributeName="r" values="7;13;7" dur="2.4s" repeatCount="indefinite" />}
        </circle>
        <g
          transform={`translate(${
            /* flip to the left half so the callout never collides with the
               target badge sitting just past the window edge */
            peakSlot > (viewStart + viewEnd) / 2
              ? Math.max(padL + 2, x(peakSlot) - 140)
              : Math.min(x(peakSlot) + 14, W - padR - 130)
          }, ${
            /* keep clear of the DEMAND EVENT caption at the top of the plot */
            y(peakValW) - 34 < padT + 12 ? y(peakValW) + 12 : y(peakValW) - 34
          })`}
        >
          <rect width="126" height="27" rx="7" fill="var(--panel-solid)" stroke="var(--hairline)" />
          <text x="9" y="11" fontSize="8.5" fontWeight="800" fill="var(--text-3)" letterSpacing="0.05em">
            {committed ? 'COMMITTED PEAK' : 'BASELINE PEAK'}
          </text>
          <text x="9" y="22" fontSize="12" fontWeight="800" fill={overLimit ? 'var(--red)' : 'var(--green)'}>
            {fmtKw(peakValW)} at {slotLabel(peakSlot)}
          </text>
        </g>

        {/* now marker */}
        <line x1={x(nowSlot)} y1={padT - 6} x2={x(nowSlot)} y2={axisY} stroke="var(--blue)" strokeWidth="1.4" opacity="0.65" />
        <text x={x(nowSlot) + 4} y={axisY - 5} fontSize="9" fontWeight="700" fill="var(--blue)">
          NOW
        </text>

        {/* simulation sweep */}
        {sim.status === 'running' && sim.sweepSlot !== null && (
          <g data-testid="sweep-cursor">
            <rect x={x(sim.sweepSlot) - 56} y={padT - 6} width="56" height={axisY - padT + 6} fill="url(#sweepGrad)" />
            <line x1={x(sim.sweepSlot)} y1={padT - 6} x2={x(sim.sweepSlot)} y2={axisY} stroke="var(--blue)" strokeWidth="2" />
            <circle cx={x(sim.sweepSlot)} cy={padT - 6} r="3.5" fill="var(--blue)" />
          </g>
        )}

        {/* hover readout */}
        {hoverSlot !== null && hoverGrid !== null && (
          <g pointerEvents="none">
            <line x1={x(hoverSlot) + colW / 2} y1={padT - 6} x2={x(hoverSlot) + colW / 2} y2={axisY} stroke="var(--text-3)" strokeWidth="1" strokeDasharray="2 2" />
            <g transform={`translate(${Math.min(x(hoverSlot) + 10, W - padR - 118)}, ${padT + 14})`}>
              <rect width="116" height={hoverGhost !== null ? 44 : 30} rx="7" fill="var(--panel-solid)" stroke="var(--hairline)" />
              <text x="9" y="13" fontSize="9.5" fontWeight="700" fill="var(--text-2)">
                {slotLabel(hoverSlot)}–{slotLabel(hoverSlot + 1)}
              </text>
              <text x="9" y="25" fontSize="11.5" fontWeight="800" fill="var(--text)">
                {fmtKw(hoverGrid)} now
              </text>
              {hoverGhost !== null && (
                <text x="9" y="38" fontSize="11.5" fontWeight="800" fill="var(--green)">
                  {fmtKw(hoverGhost)} proposed
                </text>
              )}
            </g>
          </g>
        )}
      </svg>

      {/* legend + locked pins */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 10, alignItems: 'center' }}>
        {series.stacks.map((s) => (
          <LegendSwatch key={s.key} label={STACK_STYLE[s.key].label} color={STACK_STYLE[s.key].fill} pattern={STACK_STYLE[s.key].pattern} />
        ))}
        <LegendSwatch label="Solar" color="var(--yellow)" pattern="p-none" />
        <LegendSwatch label="Battery" color="var(--green-vivid)" pattern="p-none" />
        <span style={{ flex: 1 }} />
        <span className="chip" title="Assets pinned by the operator — no plan may touch them">
          <LockIcon size={12} />
          {assets.filter((a) => isAssetLocked(state, a.id)).length} locked
        </span>
      </div>
    </section>
  )
}

function LegendSwatch({ label, color, pattern }: { label: string; color: string; pattern: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--text-2)', fontWeight: 590 }}>
      <svg width="13" height="13" aria-hidden="true">
        <rect width="13" height="13" rx="3.5" fill={pattern === 'p-none' ? color : `url(#${pattern})`} opacity={pattern === 'p-none' ? 0.55 : 1} stroke={color} strokeWidth="1" strokeOpacity="0.6" />
      </svg>
      {label}
    </span>
  )
}
