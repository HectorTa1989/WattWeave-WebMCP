/**
 * Polar.sh integration.
 *
 * Checkout: we open the hosted Polar checkout link (configured via
 * VITE_POLAR_CHECKOUT_LINK). Polar handles payment, invoicing and license-key
 * issuance — WattWeave never touches card data.
 *
 * License validation: Polar license keys must be validated with an
 * organization token, which cannot ship in a static bundle. Point
 * VITE_POLAR_VALIDATE_URL at a tiny proxy (snippet in the README) for real
 * validation. Without it, WattWeave runs in offline demo mode and accepts
 * keys shaped like WATT-XXXX-XXXX plus the documented demo key.
 */

export const POLAR_CHECKOUT_LINK: string =
  (import.meta.env?.VITE_POLAR_CHECKOUT_LINK as string | undefined) ??
  'https://buy.polar.sh/polar_cl_wattweave_pro_demo'

export const POLAR_ORG: string =
  (import.meta.env?.VITE_POLAR_ORG as string | undefined) ?? 'hectorta1989'

const VALIDATE_URL: string = (import.meta.env?.VITE_POLAR_VALIDATE_URL as string | undefined) ?? ''

export const DEMO_LICENSE_KEY = 'WATT-DEMO-PRO'

export interface LicenseResult {
  ok: boolean
  mode: 'polar' | 'offline-demo'
  message: string
}

export async function validateLicenseKey(key: string): Promise<LicenseResult> {
  const trimmed = key.trim().toUpperCase()
  if (!trimmed) return { ok: false, mode: 'offline-demo', message: 'Enter a license key.' }

  if (VALIDATE_URL) {
    try {
      const res = await fetch(VALIDATE_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key: trimmed }),
      })
      const data = (await res.json()) as { valid?: boolean; error?: string }
      return data.valid
        ? { ok: true, mode: 'polar', message: 'License validated with Polar.' }
        : { ok: false, mode: 'polar', message: data.error ?? 'Polar rejected this key.' }
    } catch {
      return {
        ok: false,
        mode: 'polar',
        message: 'Could not reach the license server — try again or use the admin account.',
      }
    }
  }

  if (trimmed === DEMO_LICENSE_KEY || /^WATT-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(trimmed)) {
    return {
      ok: true,
      mode: 'offline-demo',
      message: 'License accepted (offline demo mode — see README to wire real Polar validation).',
    }
  }
  return {
    ok: false,
    mode: 'offline-demo',
    message: `Unrecognized key. In demo mode use ${DEMO_LICENSE_KEY}.`,
  }
}

export function openCheckout(): void {
  window.open(POLAR_CHECKOUT_LINK, '_blank', 'noopener,noreferrer')
}
