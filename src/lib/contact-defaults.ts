// Saved defaults pre-filled when adding a new contact (Settings → Contacts).
export type ContactDefaults = { tax_rate_id: string; currency: string; payment_terms: string; price_level_id: string; location_id: string }

export const EMPTY_CONTACT_DEFAULTS: ContactDefaults = { tax_rate_id: '', currency: '', payment_terms: '', price_level_id: '', location_id: '' }

export function normalizeContactDefaults(raw: unknown): ContactDefaults {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const s = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
  return {
    tax_rate_id: s(o.tax_rate_id, 64),
    currency: s(o.currency, 3).toUpperCase(),
    payment_terms: s(o.payment_terms, 80),
    price_level_id: s(o.price_level_id, 64),
    location_id: s(o.location_id, 64),
  }
}
