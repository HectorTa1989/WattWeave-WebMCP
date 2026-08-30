/**
 * Main-thread simulation controller.
 *
 * Owns the worker, hands each run an AbortSignal, and guarantees the
 * WebMCP contract: aborting resolves the run promise with a structured
 * `{ status: 'canceled' }` result — never a hang, never a rejection.
 *
 * Falls back to running the solver inline (still cancellable at checkpoints)
 * when Workers are unavailable (SSR, some test environments).
 */

import { solveWithProgress } from '../domain/solver/solver'
import type { SolveInput, SolveProgress, SolveResult } from '../domain/types'
import type { WorkerRequest, WorkerResponse } from './worker'

export interface RunOptions {
  signal?: AbortSignal
  onProgress?: (p: SolveProgress) => void
  stepDelayMs?: number
}

let worker: Worker | null = null
let nextRunId = 1

function getWorker(): Worker | null {
  if (typeof Worker === 'undefined') return null
  if (!worker) {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
  }
  return worker
}

export function runSimulation(input: SolveInput, opts: RunOptions = {}): Promise<SolveResult> {
  const w = getWorker()
  if (!w) {
    // Inline fallback — same cooperative cancellation semantics.
    return solveWithProgress(input, {
      onProgress: opts.onProgress,
      stepDelayMs: opts.stepDelayMs,
      shouldCancel: () => opts.signal?.aborted === true,
    })
  }

  const runId = nextRunId++
  return new Promise<SolveResult>((resolve) => {
    const cleanup = () => {
      w.removeEventListener('message', onMessage)
      opts.signal?.removeEventListener('abort', onAbort)
    }
    const onMessage = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data
      if (msg.runId !== runId) return
      if (msg.type === 'progress') {
        opts.onProgress?.(msg.progress)
      } else {
        cleanup()
        resolve(msg.result)
      }
    }
    const onAbort = () => {
      const cancel: WorkerRequest = { type: 'cancel', runId }
      w.postMessage(cancel)
      // The worker will answer with { status: 'canceled' } at its next checkpoint.
    }
    w.addEventListener('message', onMessage)
    if (opts.signal) {
      if (opts.signal.aborted) {
        cleanup()
        resolve({ status: 'canceled' })
        return
      }
      opts.signal.addEventListener('abort', onAbort, { once: true })
    }
    const run: WorkerRequest = { type: 'run', runId, input, stepDelayMs: opts.stepDelayMs }
    w.postMessage(run)
  })
}
