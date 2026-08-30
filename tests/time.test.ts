import { describe, expect, it } from 'vitest'
import {
  kwToWhPerSlot,
  labelToSlot,
  peakW,
  rangeLabel,
  slotLabel,
  SLOTS_PER_DAY,
  whPerSlotToW,
} from '../src/domain/time'

describe('time model', () => {
  it('uses 15-minute slots over a 96-slot day', () => {
    expect(SLOTS_PER_DAY).toBe(96)
    expect(labelToSlot('00:00')).toBe(0)
    expect(labelToSlot('16:00')).toBe(64)
    expect(labelToSlot('16:15')).toBe(65)
    expect(slotLabel(65)).toBe('16:15')
    expect(rangeLabel(64, 68)).toBe('16:00–17:00')
  })

  it('rejects malformed and unaligned times', () => {
    expect(() => labelToSlot('24:00')).toThrow()
    expect(() => labelToSlot('16:07')).toThrow()
    expect(() => labelToSlot('nope')).toThrow()
  })

  it('keeps energy integer: kW ↔ Wh per slot round-trips', () => {
    expect(kwToWhPerSlot(44)).toBe(11_000)
    expect(kwToWhPerSlot(11)).toBe(2_750)
    expect(whPerSlotToW(11_000)).toBe(44_000)
    expect(Number.isInteger(kwToWhPerSlot(7))).toBe(true)
  })

  it('finds peaks with their slot', () => {
    const arr = new Array(96).fill(1000)
    arr[65] = 53_000
    const p = peakW(arr)
    expect(p.slot).toBe(65)
    expect(p.w).toBe(212_000)
  })
})
