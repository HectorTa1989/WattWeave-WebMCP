import { useEffect, useRef, useState } from 'react'
import { onPulse, type PulseTarget } from '../state/pulse'

/**
 * Returns true briefly whenever `target` is pulsed, so a component can flash
 * a highlight when a WebMCP tool touches it. Respects reduced-motion by
 * shortening (not removing) the flash — the highlight still appears.
 */
export function usePulse(target: PulseTarget, durationMs = 900): boolean {
  const [active, setActive] = useState(false)
  const timer = useRef<number | null>(null)

  useEffect(() => {
    return onPulse((t) => {
      if (t !== target) return
      setActive(true)
      if (timer.current) window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setActive(false), durationMs)
    })
  }, [target, durationMs])

  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current) }, [])

  return active
}

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  useEffect(() => {
    if (typeof matchMedia === 'undefined') return
    const mq = matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setReduced(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return reduced
}
