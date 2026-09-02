import type { ScheduleAction } from '../domain/types'

export const CONTROL_GATEWAY_URL: string =
  (import.meta.env?.VITE_CONTROL_GATEWAY_URL as string | undefined)?.trim() ?? ''

export type ControlOperation = 'apply' | 'rollback'

export interface ControlCommand {
  operation: ControlOperation
  idempotencyKey: string
  scenario: { id: string; version: number }
  eventId: string
  referenceId: string
  slotMinutes: 15
  actions: ScheduleAction[]
}

export interface ControlReceipt {
  mode: 'sandbox' | 'live-gateway'
  accepted: boolean
  operationId: string | null
  message: string
}

export type ControlResult =
  | { ok: true; receipt: ControlReceipt }
  | { ok: false; code: 'CONTROL_TIMEOUT' | 'CONTROL_UNREACHABLE' | 'CONTROL_REJECTED'; message: string }

export function controlMode(url = CONTROL_GATEWAY_URL): 'sandbox' | 'live-gateway' {
  return url ? 'live-gateway' : 'sandbox'
}

/**
 * Send one approval-gated schedule command to a server-side control gateway.
 * The browser never receives a device credential. The gateway owns BACnet,
 * Home Assistant, BMS, or utility authentication and must enforce the supplied
 * idempotency key.
 */
export async function dispatchControlCommand(
  command: ControlCommand,
  url = CONTROL_GATEWAY_URL,
  timeoutMs = 8_000,
): Promise<ControlResult> {
  if (!url) {
    return {
      ok: true,
      receipt: {
        mode: 'sandbox',
        accepted: false,
        operationId: null,
        message: 'Deterministic sandbox only — no command left this browser.',
      },
    }
  }

  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': command.idempotencyKey,
      },
      body: JSON.stringify(command),
      signal: abort.signal,
    })
    const body = await response.json().catch(() => ({})) as {
      accepted?: boolean
      operationId?: string
      message?: string
    }
    if (!response.ok || body.accepted !== true || !body.operationId) {
      return {
        ok: false,
        code: 'CONTROL_REJECTED',
        message: body.message ?? `Control gateway rejected the command (${response.status}).`,
      }
    }
    return {
      ok: true,
      receipt: {
        mode: 'live-gateway',
        accepted: true,
        operationId: body.operationId,
        message: body.message ?? 'Control gateway accepted the command.',
      },
    }
  } catch (error) {
    if (abort.signal.aborted) {
      return { ok: false, code: 'CONTROL_TIMEOUT', message: 'Control gateway timed out; local state was not changed.' }
    }
    return {
      ok: false,
      code: 'CONTROL_UNREACHABLE',
      message: `Control gateway could not be reached; local state was not changed. ${error instanceof Error ? error.message : ''}`.trim(),
    }
  } finally {
    clearTimeout(timer)
  }
}
