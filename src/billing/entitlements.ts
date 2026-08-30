/**
 * WattWeave plans and feature gates.
 *
 * The paywall is powered by Polar.sh (see polar.ts). Gating is deliberately
 * kept OUT of the safety-critical loop: locks, simulation, staging, approval,
 * commit and rollback are always available. Pro adds analytical depth and
 * polish on top.
 */

export type Plan = 'free' | 'pro'
export type Role = 'operator' | 'admin'

export interface UserAccount {
  email: string
  name: string
  role: Role
  plan: Plan
  planSource: 'admin' | 'polar-license' | 'default'
}

export type FeatureKey =
  | 'candidates.compare' // side-by-side comparison of all 3 candidates (free: best plan only)
  | 'audit.export' // download the action receipt as JSON
  | 'flow.particles' // "Living Grid+" animated particle flow (free: static arrows)

export const FEATURES: Record<FeatureKey, { title: string; blurb: string }> = {
  'candidates.compare': {
    title: 'Candidate comparison',
    blurb: 'See all three heuristic candidates side by side — including the naïve rebound trap.',
  },
  'audit.export': {
    title: 'Audit receipt export',
    blurb: 'Download signed-off action receipts as JSON for your compliance folder.',
  },
  'flow.particles': {
    title: 'Living Grid+ flow',
    blurb: 'Animated particle energy flow between grid, solar, battery and zones.',
  },
}

export function hasFeature(user: UserAccount | null, feature: FeatureKey): boolean {
  void feature
  if (!user) return false
  if (user.role === 'admin') return true // admin account: every paid feature unlocked
  return user.plan === 'pro'
}

export const PRO_PRICE_LABEL = '$9/mo'
