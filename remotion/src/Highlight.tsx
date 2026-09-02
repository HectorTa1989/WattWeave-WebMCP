import React from 'react'
import { interpolate, spring } from 'remotion'
import timeline from './timeline.json'

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

interface Props {
  rect: Rect
  label: string
  local: number
  fps: number
  /** `target` outlines the control about to be clicked; `change` boxes the state that changed. */
  variant: 'target' | 'change'
  delay: number
}

const PALETTE = {
  target: { line: '#38bdf8', glow: 'rgba(56,189,248,0.55)', chip: '#0284c7' },
  change: { line: '#22c55e', glow: 'rgba(34,197,94,0.5)', chip: '#15803d' },
}

export const Highlight: React.FC<Props> = ({ rect, label, local, fps, variant, delay }) => {
  const t = local - delay
  if (t < 0) return null

  const color = PALETTE[variant]
  const pad = variant === 'target' ? 8 : 12
  const enter = spring({ frame: t, fps, config: { damping: 26, mass: 0.6 }, durationInFrames: Math.round(fps * 0.5) })
  const pulse = 0.55 + 0.45 * Math.sin((t / fps) * Math.PI * 1.6)

  const box = {
    left: rect.x - pad,
    top: rect.y - pad,
    width: rect.width + pad * 2,
    height: rect.height + pad * 2,
  }

  // Keep the label chip on screen: above the box when there is room, else below.
  const above = box.top > 74
  const chipTop = above ? box.top - 58 : box.top + box.height + 14
  const chipLeft = Math.min(Math.max(box.left, 24), timeline.width - 520)

  return (
    <>
      <div
        style={{
          position: 'absolute',
          ...box,
          border: `${variant === 'target' ? 4 : 5}px solid ${color.line}`,
          borderRadius: 16,
          boxShadow: `0 0 ${18 + pulse * 26}px ${color.glow}, inset 0 0 ${10 + pulse * 16}px ${color.glow}`,
          transform: `scale(${interpolate(enter, [0, 1], [1.06, 1])})`,
          opacity: enter,
          pointerEvents: 'none',
        }}
      />
      {label ? (
        <div
          style={{
            position: 'absolute',
            top: chipTop,
            left: chipLeft,
            maxWidth: 640,
            padding: '9px 18px',
            borderRadius: 999,
            background: color.chip,
            color: 'white',
            font: '600 25px/1.25 Inter, "Segoe UI", system-ui, sans-serif',
            letterSpacing: 0.1,
            boxShadow: '0 10px 26px rgba(2,6,23,0.45)',
            opacity: interpolate(t, [Math.round(fps * 0.15), Math.round(fps * 0.45)], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            }),
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {label}
        </div>
      ) : null}
    </>
  )
}
