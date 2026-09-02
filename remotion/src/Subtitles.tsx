import React from 'react'
import { interpolate, useCurrentFrame } from 'remotion'

interface Cue {
  text: string
  from: number
  to: number
}

/**
 * Deliberately compact caption strip pinned near the very bottom edge, so it
 * never covers the app UI the demo is trying to show.
 */
export const Subtitles: React.FC<{ cues: Cue[] }> = ({ cues }) => {
  const frame = useCurrentFrame()
  const cue = cues.find((c) => frame >= c.from && frame < c.to) ?? null
  if (!cue) return null

  const fade = interpolate(frame, [cue.from, cue.from + 3, cue.to - 3, cue.to], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 20,
        display: 'flex',
        justifyContent: 'center',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          maxWidth: 860,
          padding: '7px 18px',
          borderRadius: 10,
          background: 'rgba(8,14,28,0.86)',
          color: '#f1f5f9',
          font: '500 27px/1.3 Inter, "Segoe UI", system-ui, sans-serif',
          textAlign: 'center',
          boxShadow: '0 6px 20px rgba(2,6,23,0.4)',
          opacity: fade,
        }}
      >
        {cue.text}
      </div>
    </div>
  )
}
