/**
 * WattWeave time model.
 *
 * The whole app runs on 15-minute slots with integer watt-hour energy values,
 * so every computation is exact and deterministic — no floating-point surprises,
 * no wall-clock dependence.
 */

export const SLOT_MINUTES = 15
export const SLOTS_PER_HOUR = 60 / SLOT_MINUTES // 4
export const SLOTS_PER_DAY = 24 * SLOTS_PER_HOUR // 96

/** Wh consumed in one slot by a load drawing `kw` kilowatts. Integer for integer kW. */
export function kwToWhPerSlot(kw: number): number {
  return Math.round(kw * 250) // kw * 1000 W / 4 slots per hour
}

/** Average kW over one slot for `wh` watt-hours. */
export function whPerSlotToKw(wh: number): number {
  return wh / 250
}

/** Average watts over one slot for `wh` watt-hours. */
export function whPerSlotToW(wh: number): number {
  return wh * SLOTS_PER_HOUR
}

export function slotStartMinutes(slot: number): number {
  return slot * SLOT_MINUTES
}

/** "16:15" for slot 65. */
export function slotLabel(slot: number): string {
  const m = slotStartMinutes(((slot % SLOTS_PER_DAY) + SLOTS_PER_DAY) % SLOTS_PER_DAY)
  const h = Math.floor(m / 60)
  const mm = m % 60
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

/** "4:15 PM" for slot 65 — used in prose-facing UI copy. */
export function slotLabel12h(slot: number): string {
  const m = slotStartMinutes(((slot % SLOTS_PER_DAY) + SLOTS_PER_DAY) % SLOTS_PER_DAY)
  let h = Math.floor(m / 60)
  const mm = m % 60
  const suffix = h >= 12 ? 'PM' : 'AM'
  h = h % 12
  if (h === 0) h = 12
  return `${h}:${String(mm).padStart(2, '0')} ${suffix}`
}

/** Parse "HH:MM" into a slot index. Throws on malformed or non-slot-aligned input. */
export function labelToSlot(label: string): number {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(label.trim())
  if (!m) throw new Error(`Invalid time "${label}" — expected HH:MM`)
  const minutes = Number(m[1]) * 60 + Number(m[2])
  if (minutes % SLOT_MINUTES !== 0) {
    throw new Error(`Time "${label}" is not aligned to ${SLOT_MINUTES}-minute slots`)
  }
  return minutes / SLOT_MINUTES
}

/** "16:00–17:00" for [64, 68). End slot is exclusive. */
export function rangeLabel(startSlot: number, endSlotExclusive: number): string {
  return `${slotLabel(startSlot)}–${slotLabel(endSlotExclusive)}`
}

/** Inclusive-start, exclusive-end slot iteration helper. */
export function slotsInRange(startSlot: number, endSlotExclusive: number): number[] {
  const out: number[] = []
  for (let s = startSlot; s < endSlotExclusive; s++) out.push(s)
  return out
}

/** Build a 96-slot array from [startSlot, endSlotExclusive, value-per-slot] segments. */
export function profileFromSegments(segments: Array<[number, number, number]>): number[] {
  const arr = new Array<number>(SLOTS_PER_DAY).fill(0)
  for (const [start, end, value] of segments) {
    for (let s = start; s < end; s++) arr[s] = value
  }
  return arr
}

export function sumWh(arr: number[], startSlot = 0, endSlotExclusive = SLOTS_PER_DAY): number {
  let total = 0
  for (let s = startSlot; s < endSlotExclusive; s++) total += arr[s]
  return total
}

/** Peak average power (W) and the slot where it occurs within [start, end). */
export function peakW(
  arr: number[],
  startSlot = 0,
  endSlotExclusive = SLOTS_PER_DAY,
): { w: number; slot: number } {
  let best = -Infinity
  let bestSlot = startSlot
  for (let s = startSlot; s < endSlotExclusive; s++) {
    if (arr[s] > best) {
      best = arr[s]
      bestSlot = s
    }
  }
  return { w: whPerSlotToW(best), slot: bestSlot }
}

export function fmtKw(watts: number, digits = 0): string {
  return `${(watts / 1000).toFixed(digits)} kW`
}

export function fmtKwh(wh: number, digits = 1): string {
  return `${(wh / 1000).toFixed(digits)} kWh`
}
