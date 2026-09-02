import React from 'react'
import {
  AbsoluteFill,
  Audio,
  Img,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion'
import timeline from './timeline.json'
import { Cursor } from './Cursor'
import { Highlight } from './Highlight'
import { Subtitles } from './Subtitles'

type Shot = (typeof timeline)['beats'][number]['shots'][number]

interface FlatShot extends Shot {
  absoluteFrom: number
  origin: { x: number; y: number } | null
}

const center = (r: { x: number; y: number; width: number; height: number }) => ({
  x: r.x + r.width / 2,
  y: r.y + r.height / 2,
})

/** Flatten every beat into one shot list so the cursor can travel across beats. */
const flatten = (): FlatShot[] => {
  const shots: FlatShot[] = []
  let last: { x: number; y: number } | null = null
  for (const beat of timeline.beats) {
    for (const shot of beat.shots) {
      shots.push({ ...(shot as Shot), absoluteFrom: beat.from + shot.from, origin: last })
      if (shot.target) last = center(shot.target)
    }
  }
  return shots
}

const SHOTS = flatten()

export const WattWeaveDemo: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const index = Math.max(
    0,
    SHOTS.findLastIndex((s) => frame >= s.absoluteFrom),
  )
  const shot = SHOTS[index]
  const local = frame - shot.absoluteFrom

  // Cursor travel: ease from wherever it was into this shot's control.
  const target = shot.target ? center(shot.target) : null
  const from = shot.origin ?? { x: timeline.width * 0.5, y: timeline.height * 0.62 }
  const travel = target
    ? spring({ frame: local, fps, config: { damping: 200, mass: 0.9 }, durationInFrames: Math.round(fps * 0.62) })
    : 1
  const pos = target
    ? { x: interpolate(travel, [0, 1], [from.x, target.x]), y: interpolate(travel, [0, 1], [from.y, target.y]) }
    : from

  const clickFrame = Math.round(fps * 0.78)
  const clicking = Boolean(shot.target) && local >= clickFrame

  return (
    <AbsoluteFill style={{ backgroundColor: '#0b1220' }}>
      <Img src={staticFile(shot.image)} style={{ width: '100%', height: '100%' }} />

      {shot.target ? (
        <Highlight
          rect={shot.target}
          label={shot.label ?? ''}
          local={local}
          fps={fps}
          variant="target"
          delay={0}
        />
      ) : null}

      {(shot.highlights ?? []).map((h, i) => (
        <Highlight
          key={`${h.label}-${i}`}
          rect={h}
          label={h.label}
          local={local}
          fps={fps}
          variant="change"
          delay={Math.round(i * fps * 0.35)}
        />
      ))}

      <Cursor x={pos.x} y={pos.y} clicking={clicking} sinceClick={local - clickFrame} fps={fps} />

      {timeline.beats.map((beat) => (
        <Sequence key={beat.id} from={beat.from} durationInFrames={beat.durationInFrames}>
          <Audio src={staticFile(beat.audio)} />
          <Subtitles cues={beat.cues} />
        </Sequence>
      ))}

      <AbsoluteFill style={{ pointerEvents: 'none' }}>
        <div
          style={{
            position: 'absolute',
            left: 0,
            bottom: 0,
            height: 5,
            width: `${(frame / timeline.durationInFrames) * 100}%`,
            background: 'linear-gradient(90deg,#38bdf8,#22c55e)',
            opacity: 0.9,
          }}
        />
      </AbsoluteFill>
    </AbsoluteFill>
  )
}
