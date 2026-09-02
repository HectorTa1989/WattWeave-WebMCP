import { afterEach, describe, expect, it, vi } from 'vitest'
import { dispatchControlCommand, type ControlCommand } from '../src/integrations/controlGateway'

const command: ControlCommand = {
  operation: 'apply',
  idempotencyKey: 'apply-1',
  scenario: { id: 'alder', version: 1 },
  eventId: 'event-1',
  referenceId: 'stg-001',
  slotMinutes: 15,
  actions: [],
}

afterEach(() => vi.restoreAllMocks())

describe('control gateway adapter', () => {
  it('stays explicit and network-free in sandbox mode', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const result = await dispatchControlCommand(command, '')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.receipt.mode).toBe('sandbox')
      expect(result.receipt.accepted).toBe(false)
    }
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('returns a live receipt only when the gateway explicitly accepts', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      accepted: true,
      operationId: 'ha-123',
      message: 'accepted',
    }), { status: 200, headers: { 'content-type': 'application/json' } }))
    const result = await dispatchControlCommand(command, 'https://gateway.example/control')
    expect(result).toEqual({
      ok: true,
      receipt: { mode: 'live-gateway', accepted: true, operationId: 'ha-123', message: 'accepted' },
    })
    expect(fetch).toHaveBeenCalledWith('https://gateway.example/control', expect.objectContaining({ method: 'POST' }))
  })

  it('fails closed when the gateway rejects a command', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      accepted: false,
      message: 'policy rejected',
    }), { status: 409, headers: { 'content-type': 'application/json' } }))
    const result = await dispatchControlCommand(command, 'https://gateway.example/control')
    expect(result).toEqual({ ok: false, code: 'CONTROL_REJECTED', message: 'policy rejected' })
  })
})
