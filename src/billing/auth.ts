/**
 * Local demo authentication. No server, no real credentials — two seeded
 * accounts stored in localStorage so the paywall can be demonstrated:
 *
 *   admin@wattweave.app / wattweave-admin  → Admin, every Pro feature unlocked
 *   operator@wattweave.app / wattweave-demo → Operator on the Free plan
 *
 * The session starts signed in as Admin (per the demo brief) so all paid
 * features are usable immediately; sign out to preview the Free experience.
 */

import type { UserAccount } from './entitlements'

export const ADMIN_ACCOUNT: UserAccount = {
  email: 'admin@wattweave.app',
  name: 'Alex Ha (Admin)',
  role: 'admin',
  plan: 'pro',
  planSource: 'admin',
}

export const OPERATOR_ACCOUNT: UserAccount = {
  email: 'operator@wattweave.app',
  name: 'Sam Rivera',
  role: 'operator',
  plan: 'free',
  planSource: 'default',
}

const CREDENTIALS: Array<{ email: string; password: string; account: UserAccount }> = [
  { email: ADMIN_ACCOUNT.email, password: 'wattweave-admin', account: ADMIN_ACCOUNT },
  { email: OPERATOR_ACCOUNT.email, password: 'wattweave-demo', account: OPERATOR_ACCOUNT },
]

const STORAGE_KEY = 'wattweave.session.v1'

export function authenticate(email: string, password: string): UserAccount | null {
  const match = CREDENTIALS.find(
    (c) => c.email.toLowerCase() === email.trim().toLowerCase() && c.password === password,
  )
  return match ? { ...match.account } : null
}

export function loadSession(): UserAccount | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === 'signed-out') return null
    if (!raw) return { ...ADMIN_ACCOUNT } // demo default: admin, everything unlocked
    return JSON.parse(raw) as UserAccount
  } catch {
    return { ...ADMIN_ACCOUNT }
  }
}

export function saveSession(user: UserAccount | null): void {
  try {
    if (user) localStorage.setItem(STORAGE_KEY, JSON.stringify(user))
    else localStorage.setItem(STORAGE_KEY, 'signed-out')
  } catch {
    /* storage unavailable — session just won't persist */
  }
}
