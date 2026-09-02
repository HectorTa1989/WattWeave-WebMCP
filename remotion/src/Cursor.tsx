import React from 'react'
import { interpolate } from 'remotion'

interface Props {
  x: number
  y: number
  clicking: boolean
  /** Frames elapsed since the click landed (negative before it lands). */
  sinceClick: number
  fps: number
}

/** Mouse pointer with a press animation and an expanding click ripple. */
export const Cursor: React.FC<Props> = ({ x, y, clicking, sinceClick, fps }) => {
  const press = clicking
    ? interpolate(sinceClick, [0, fps * 0.09, fps * 0.24], [1, 0.82, 1], {
        extrapolateRight: 'clamp',
        extrapolateLeft: 'clamp',
      })
    : 1
  const rippleProgress = clicking
    ? interpolate(sinceClick, [0, fps * 0.55], [0, 1], { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' })
    : 0

  return (
    <div style={{ position: 'absolute', left: x, top: y, pointerEvents: 'none' }}>
      {clicking ? (
        <div
          style={{
            position: 'absolute',
            left: -70,
            top: -70,
            width: 140,
            height: 140,
            borderRadius: '50%',
            border: '5px solid rgba(56,189,248,0.95)',
            transform: `scale(${0.15 + rippleProgress * 0.95})`,
            opacity: 1 - rippleProgress,
          }}
        />
      ) : null}
      <svg
        width={44}
        height={44}
        viewBox="0 0 24 24"
        style={{
          position: 'absolute',
          left: -4,
          top: -3,
          transform: `scale(${press})`,
          transformOrigin: '6px 4px',
          filter: 'drop-shadow(0 5px 10px rgba(0,0,0,0.45))',
        }}
      >
        <path d="M5 2.5 L5 19.2 L9.15 15.2 L11.9 21.3 L14.75 20 L12.05 14.1 L18 14.1 Z" fill="#ffffff" stroke="#0f172a" strokeWidth={1.3} strokeLinejoin="round" />
      </svg>
    </div>
  )
}
