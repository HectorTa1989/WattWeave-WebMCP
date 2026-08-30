/**
 * Simulation Web Worker.
 *
 * Runs the deterministic solver off the main thread with a visible sweep so
 * cancellation is meaningful: a `cancel` message flips an AbortController and
 * the solver stops at its next checkpoint, replying `canceled`.
 */

import { solveWithProgress } from '../domain/solver/solver'
import type { SolveInput, SolveProgress, SolveResult } from '../domain/types'

export type WorkerRequest =
  | { type: 'run'; runId: number; input: SolveInput; stepDelayMs?: number }
  | { type: 'cancel'; runId: number }

export type WorkerResponse =
  | { type: 'progress'; runId: number; progress: SolveProgress }
  | { type: 'result'; runId: number; result: SolveResult }

const scope = self as unknown as {
  onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null
  postMessage: (msg: WorkerResponse) => void
}

let activeRunId = -1
let abort: AbortController | null = null

scope.onmessage = (e) => {
  const msg = e.data
  if (msg.type === 'cancel') {
    if (msg.runId === activeRunId) abort?.abort()
    return
  }
  if (msg.type === 'run') {
    activeRunId = msg.runId
    abort = new AbortController()
    const signal = abort.signal
    void solveWithProgress(msg.input, {
      stepDelayMs: msg.stepDelayMs,
      shouldCancel: () => signal.aborted,
      onProgress: (progress) => {
        if (!signal.aborted) scope.postMessage({ type: 'progress', runId: msg.runId, progress })
      },
    }).then((result) => {
      scope.postMessage({ type: 'result', runId: msg.runId, result })
    })
  }
}
