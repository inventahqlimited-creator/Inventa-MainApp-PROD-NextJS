// src/lib/addons.ts
// Add-ons are extras an organisation has switched on from the Hub (organisations.addons, e.g. {"kits": true}).
// Client-safe: only types, the list, and plain helpers. The server lookup is in addons-server.ts.
export type AddonKey = 'kits'
export const ADDONS: { key: AddonKey; label: string; description: string }[] = [
  { key: 'kits', label: 'Kits & Bundles', description: 'Products made of other products, with a Bill of Materials. Adds a Kits & Bundles settings page.' },
]
export type Addons = Record<AddonKey, boolean>

/** Turns whatever is stored into a complete, safe object (anything unknown or not exactly true is off). */
export function normalizeAddons(raw: unknown): Addons {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  const out = {} as Addons
  for (const a of ADDONS) out[a.key] = src[a.key] === true
  return out
}

/** For the Hub: accepts a partial { kits: true } and returns only known keys with boolean values, or undefined if invalid. */
export function parseAddonsPatch(v: unknown): Partial<Addons> | undefined {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined
  const out: Partial<Addons> = {}
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (!ADDONS.some(a => a.key === k) || typeof val !== 'boolean') return undefined
    out[k as AddonKey] = val
  }
  return Object.keys(out).length ? out : undefined
}
