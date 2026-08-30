/**
 * Solver orchestrator.
 *
 * `solve()` is the pure synchronous heuristic (used directly by unit tests).
 * `solveWithProgress()` wraps it with a visible sweep, progress callbacks and
 * cooperative cancellation — the Web Worker runs this variant so an
 * AbortSignal genuinely stops work between steps.
 */

import type { SolveInput, SolveProgress, SolveResult } from '../types'
import { analyzeFeasibility } from './feasibility'
import { buildCandidates } from './strategies'
import { compareCandidates } from './metrics'

export function solve(input: SolveInput): Extract<SolveResult, { status: 'done' }> {
  const infeasible = analyzeFeasibility(input)
  if (infeasible) return { status: 'done', candidates: [], infeasible }

  const candidates = buildCandidates(input)
    .sort(compareCandidates(input.objective))
    .slice(0, Math.max(1, Math.min(3, input.maxCandidates)))
  return { status: 'done', candidates, infeasible: null }
}

export interface SolveHooks {
  onProgress?: (p: SolveProgress) => void
  shouldCancel?: () => boolean
  /** Yield between steps; injectable so tests run instantly. */
  sleep?: (ms: number) => Promise<void>
  stepDelayMs?: number
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export async function solveWithProgress(
  input: SolveInput,
  hooks: SolveHooks = {},
): Promise<SolveResult> {
  const sleep = hooks.sleep ?? defaultSleep
  const delay = hooks.stepDelayMs ?? 28
  const canceled = () => hooks.shouldCancel?.() === true
  const emit = (p: SolveProgress) => hooks.onProgress?.(p)

  try {
    emit({ phase: 'validate', sweepSlot: null, pct: 0.02 })
    await sleep(delay * 3)
    if (canceled()) return { status: 'canceled' }

    // Visible sweep across the planning horizon (twice: scan + refine).
    const from = input.event.windowStartSlot - 8
    const to = input.event.windowEndSlot + 6
    const totalSteps = (to - from) * 2
    let step = 0
    for (let pass = 0; pass < 2; pass++) {
      for (let s = from; s < to; s++) {
        step++
        emit({ phase: 'sweep', sweepSlot: s, pct: 0.05 + 0.75 * (step / totalSteps) })
        await sleep(delay)
        if (canceled()) return { status: 'canceled' }
      }
    }

    emit({ phase: 'score', sweepSlot: null, pct: 0.9 })
    await sleep(delay * 4)
    if (canceled()) return { status: 'canceled' }

    const result = solve(input)
    emit({ phase: 'score', sweepSlot: null, pct: 1 })
    return result
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : String(err) }
  }
}
