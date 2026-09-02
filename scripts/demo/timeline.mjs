/**
 * Step 3 of the Remotion demo pipeline.
 *
 * Runs the neural voiceover for every beat, then folds the real audio timings
 * together with the captured screenshots into one timeline the Remotion
 * composition renders verbatim. Because the voice drives the frame budget, the
 * narration, the cursor and the highlight boxes can never drift apart.
 */

import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { BEATS } from './beats.mjs'

const FPS = 30
const CLICK_SECONDS = 1.55 // cursor travel + press + settle for one click shot
const TAIL_SECONDS = 0.55 // breathing room after the voice stops
const HOLD_MIN_SECONDS = 1.7

const capture = JSON.parse(await readFile(resolve('remotion/src/capture.json'), 'utf8'))
const audioDir = resolve('remotion/public/audio')
await mkdir(audioDir, { recursive: true })

// Synthesis is the slow step, so reuse the previous take whenever the beat
// narration is byte-for-byte unchanged. `DEMO_REVOICE=1` forces a fresh pass.
const cachePath = resolve('remotion/src/voices.json')
const signature = JSON.stringify(BEATS.map((b) => [b.id, b.narration]))
const cached = process.env.DEMO_REVOICE
  ? null
  : await readFile(cachePath, 'utf8')
      .then((raw) => JSON.parse(raw))
      .catch(() => null)

const python = process.env.PYTHON ?? 'python'
const voices = cached?.signature === signature
  ? (console.log('reusing cached voiceover'), cached.voices)
  : await new Promise((res, rej) => {
  const child = spawn(python, [resolve('scripts/demo/tts.py'), audioDir], {
    stdio: ['pipe', 'pipe', 'inherit'],
  })
  let out = ''
  child.stdout.on('data', (d) => (out += d))
  child.on('error', rej)
  child.on('close', (code) =>
    code === 0 ? res(JSON.parse(out)) : rej(new Error(`tts.py exited ${code}`)),
  )
  child.stdin.end(JSON.stringify(BEATS.map((b) => ({ id: b.id, text: b.narration }))))
})

if (cached?.signature !== signature) {
  await writeFile(cachePath, `${JSON.stringify({ signature, voices }, null, 2)}\n`)
}

const frames = (s) => Math.max(1, Math.round(s * FPS))
const beats = []
let cursor = 0

for (const beat of capture.beats) {
  const voice = voices.find((v) => v.id === beat.id)
  const clicks = beat.shots.filter((s) => s.click)
  const budget = voice.duration + TAIL_SECONDS
  const holdSeconds = Math.max(HOLD_MIN_SECONDS, budget - clicks.length * CLICK_SECONDS)
  const beatSeconds = clicks.length * CLICK_SECONDS + holdSeconds

  let offset = 0
  const shots = beat.shots.map((shot) => {
    const seconds = shot.click ? CLICK_SECONDS : holdSeconds
    const entry = { ...shot, from: frames(offset), durationInFrames: frames(seconds) }
    offset += seconds
    return entry
  })

  beats.push({
    id: beat.id,
    from: frames(cursor),
    durationInFrames: frames(beatSeconds),
    audio: voice.audio,
    shots,
    cues: voice.cues.map((c) => ({
      text: c.text,
      from: frames(c.start),
      to: frames(Math.max(c.end, c.start + 0.35)),
    })),
  })
  cursor += beatSeconds
}

const timeline = {
  fps: FPS,
  width: capture.width,
  height: capture.height,
  durationInFrames: frames(cursor),
  beats,
}
await writeFile(resolve('remotion/src/timeline.json'), `${JSON.stringify(timeline, null, 2)}\n`)
const total = cursor
console.log(`timeline: ${beats.length} beats · ${Math.floor(total / 60)}m${(total % 60).toFixed(1)}s`)
