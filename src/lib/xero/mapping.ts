// src/lib/xero/mapping.ts
// Which Xero accounts and tax rates this organisation posts to.
// Stored in xero_connections.settings: default sales and purchases accounts, the inventory asset and stock adjustment
// accounts (for stock adjustment journals), and one Xero tax
// rate per Inventa tax rate for each side (sales invoices use "output" rates, bills use "input" rates).
import type { SupabaseClient } from '@supabase/supabase-js'
import { xeroGet } from './api'

export type XeroAccount = { code: string; name: string; type: string; class: string }
export type XeroTaxRate = { name: string; taxType: string; rate: number; sales: boolean; purchases: boolean }
export type InventaTax = { id: string; name: string; code: string | null; rate: number }
export type TaxMap = Record<string, { sales?: string | null; purchases?: string | null }>
export type XeroSettings = {
  sales_account_code?: string | null
  purchases_account_code?: string | null
  inventory_account_code?: string | null   // balance-sheet side of a stock adjustment journal
  adjustment_account_code?: string | null  // profit-and-loss side of a stock adjustment journal
  tax_map?: TaxMap
}

type RawAccount = { Code?: string; Name?: string; Type?: string; Class?: string; Status?: string; SystemAccount?: string }
export type AccountLists = { sales: XeroAccount[]; purchases: XeroAccount[]; inventory: XeroAccount[] }
type RawTax = { Name?: string; TaxType?: string; Status?: string; EffectiveRate?: number; CanApplyToRevenue?: boolean; CanApplyToExpenses?: boolean }

export async function fetchXeroLists(db: SupabaseClient, orgId: string): Promise<
  { ok: true; accounts: AccountLists; taxRates: XeroTaxRate[] } | { ok: false; status: number; error: string }
> {
  const [a, t] = await Promise.all([
    xeroGet<{ Accounts?: RawAccount[] }>(db, orgId, '/Accounts'),
    xeroGet<{ TaxRates?: RawTax[] }>(db, orgId, '/TaxRates'),
  ])
  if (!a.ok) return a
  if (!t.ok) return t

  const active = (a.data.Accounts ?? []).filter(x => x.Status === 'ACTIVE' && x.Code && x.Name)
  const accounts = active
    .map(x => ({ code: x.Code as string, name: x.Name as string, type: x.Type ?? '', class: x.Class ?? '' }))
    .sort((p, q) => p.code.localeCompare(q.code, undefined, { numeric: true }))
  // Journals can't post to bank accounts or Xero's own control accounts (debtors, creditors, …).
  const systemCodes = new Set(active.filter(x => x.SystemAccount).map(x => x.Code as string))

  const taxRates = (t.data.TaxRates ?? [])
    .filter(x => x.Status === 'ACTIVE' && x.TaxType && x.Name)
    .map(x => ({
      name: x.Name as string,
      taxType: x.TaxType as string,
      rate: Number(x.EffectiveRate ?? 0),
      sales: x.CanApplyToRevenue !== false,
      purchases: x.CanApplyToExpenses !== false,
    }))

  return {
    ok: true,
    accounts: {
      sales: accounts.filter(x => x.class === 'REVENUE'),
      purchases: accounts.filter(x => x.class === 'EXPENSE'),
      inventory: accounts.filter(x => x.class === 'ASSET' && x.type !== 'BANK' && !systemCodes.has(x.code)),
    },
    taxRates,
  }
}

/** Default accounts: 200 for sales and 300 for purchases when they exist, otherwise the first sensible one. */
export function suggestAccounts(accounts: AccountLists) {
  const sales = accounts.sales.find(a => a.code === '200') ?? accounts.sales.find(a => a.type === 'SALES') ?? accounts.sales[0]
  const purchases = accounts.purchases.find(a => a.code === '300') ?? accounts.purchases.find(a => a.type === 'DIRECTCOSTS') ?? accounts.purchases[0]
  const inventory = (accounts.inventory ?? []).find(a => a.type === 'INVENTORY') ?? (accounts.inventory ?? []).find(a => /inventory|stock/i.test(a.name))
  const adjustment = accounts.purchases.find(a => /adjust|write.?off|shrink/i.test(a.name)) ?? accounts.purchases.find(a => a.type === 'DIRECTCOSTS')
  return {
    sales_account_code: sales?.code ?? null, purchases_account_code: purchases?.code ?? null,
    inventory_account_code: inventory?.code ?? null, adjustment_account_code: adjustment?.code ?? null,
  }
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9%]+/g, ' ').trim()

function pickTax(inv: InventaTax, side: 'sales' | 'purchases', xero: XeroTaxRate[]): string | null {
  const pool = xero.filter(x => x[side])
  const byName = pool.find(x => norm(x.name) === norm(inv.name))
  if (byName) return byName.taxType
  const sameRate = pool.filter(x => Math.abs(x.rate - inv.rate) < 0.0001)
  if (sameRate.length === 0) return null
  if (inv.rate === 0) {
    // Zero-rate families differ (exempt, zero rated, no tax): prefer one that shares a word with the Inventa name.
    const words = norm(`${inv.name} ${inv.code ?? ''}`)
    for (const key of ['exempt', 'zero', 'no ']) {
      if (words.includes(key.trim())) {
        const hit = sameRate.find(x => norm(x.name).includes(key.trim()))
        if (hit) return hit.taxType
      }
    }
  }
  return sameRate[0].taxType
}

/** One Xero tax rate per Inventa rate and side, matched by name first, then by percentage. */
export function suggestTax(inventa: InventaTax[], xero: XeroTaxRate[]): TaxMap {
  const out: TaxMap = {}
  for (const inv of inventa) out[inv.id] = { sales: pickTax(inv, 'sales', xero), purchases: pickTax(inv, 'purchases', xero) }
  return out
}

/**
 * Check settings sent by the browser against what Xero and Inventa actually have, and keep only valid values.
 * Returns an error message when a required value is missing or unknown.
 */
export function cleanSettings(
  raw: unknown,
  lists: { accounts: AccountLists; taxRates: XeroTaxRate[] },
  inventaIds: string[],
): { ok: true; settings: XeroSettings } | { ok: false; error: string } {
  const r = (raw ?? {}) as XeroSettings
  const sales = lists.accounts.sales.find(a => a.code === r.sales_account_code)
  const purchases = lists.accounts.purchases.find(a => a.code === r.purchases_account_code)
  if (!sales) return { ok: false, error: 'Choose a sales account that exists in Xero.' }
  if (!purchases) return { ok: false, error: 'Choose a purchases account that exists in Xero.' }
  // The two stock adjustment accounts are optional here; adjustments wait until both are chosen.
  const inventory = r.inventory_account_code ? lists.accounts.inventory.find(a => a.code === r.inventory_account_code) : null
  const adjustment = r.adjustment_account_code ? lists.accounts.purchases.find(a => a.code === r.adjustment_account_code) : null
  if (r.inventory_account_code && !inventory) return { ok: false, error: 'Choose an inventory asset account that exists in Xero.' }
  if (r.adjustment_account_code && !adjustment) return { ok: false, error: 'Choose a stock adjustment account that exists in Xero.' }

  const salesTypes = new Set(lists.taxRates.filter(x => x.sales).map(x => x.taxType))
  const purchaseTypes = new Set(lists.taxRates.filter(x => x.purchases).map(x => x.taxType))
  const tax_map: TaxMap = {}
  for (const id of inventaIds) {
    const m = r.tax_map?.[id]
    const s = m?.sales && salesTypes.has(m.sales) ? m.sales : null
    const p = m?.purchases && purchaseTypes.has(m.purchases) ? m.purchases : null
    tax_map[id] = { sales: s, purchases: p }
  }
  return {
    ok: true,
    settings: {
      sales_account_code: sales.code, purchases_account_code: purchases.code,
      inventory_account_code: inventory?.code ?? null, adjustment_account_code: adjustment?.code ?? null,
      tax_map,
    },
  }
}

export async function loadInventaTaxRates(db: SupabaseClient, orgId: string): Promise<InventaTax[]> {
  const { data } = await db.from('tax_rates').select('id, name, code, rate').eq('org_id', orgId).order('name')
  return ((data ?? []) as { id: string; name: string; code: string | null; rate: number | string }[]).map(x => ({ id: x.id, name: x.name, code: x.code, rate: Number(x.rate) }))
}

/** The Xero tax rate to use for an Inventa tax rate, or null when it has not been mapped. */
export function resolveTaxType(settings: XeroSettings | null | undefined, taxRateId: string | null | undefined, side: 'sales' | 'purchases'): string | null {
  if (!taxRateId) return null
  return settings?.tax_map?.[taxRateId]?.[side] ?? null
}
