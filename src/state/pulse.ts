/**
 * Pulse bus: every WebMCP tool execution (and key human actions) announces a
 * target region; components subscribe and flash a brief highlight so tool
 * effects are always visible in the human UI.
 */

export type PulseTarget =
  | 'chart'
  | 'chart-window'
  | 'flow'
  | 'candidates'
  | 'approval'
  | 'audit'
  | 'meter'
  | 'inspector'
  | `asset:${string}`

type Listener = (target: PulseTarget) => void

const listeners = new Set<Listener>()

export function pulse(target: PulseTarget): void {
  for (const l of listeners) l(target)
}

export function onPulse(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
