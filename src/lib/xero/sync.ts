// src/lib/xero/sync.ts
// Contacts and products between Inventa and Xero.
//   • Inventa → Xero: records already linked are left alone. Records that match something in Xero
//     (contact by name, product by SKU = item code) are linked, not duplicated. The rest are created.
//   • Xero → Inventa: records that exist only in Xero are listed, and imported only when someone picks them.
// Links live in xero_sync_records. Nothing in Xero is ever changed or deleted once it exists.
import type { SupabaseClient } from '@supabase/supabase-js'
import { xeroGet, xeroPost } from './api'
import { resolveTaxType, type XeroSettings } from './mapping'
import { logXero } from './audit'

export type Entity = 'contact' | 'product'
type Row = Record<string, unknown>

export type SyncSummary = { linked: number; created: number; failed: number; unchanged: number; failures: { id: string; name: string; error: string }[] }
export type OverviewItem = { id: string; name: string; error?: string | null }
export type XeroOnlyItem = { xeroId: string; name: string; code?: string | null }
export type Overview = {
  inventa: number
  xero: number
  synced: number
  notSynced: number
  failed: number
  failures: OverviewItem[]
  onlyInInventa: OverviewItem[]
  onlyInXero: XeroOnlyItem[]
  lastSyncedAt: string | null
  /** InventaHQ records that share a name (contacts) or SKU (products) with another record. Xero keeps one record per name, so they share it. */
  sharedKey: number
}

const LIST_CAP = 200
const BATCH = 50

export const norm = (s: unknown) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
const clean = (s: unknown): string | null => {
  const t = typeof s === 'string' ? s.trim() : ''
  return t === '' ? null : t
}
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0 }

// ── Xero reads ──────────────────────────────────────────────────────────────

type XRec = { id: string; name: string; code?: string | null }
type Fail = { ok: false; status: number; error: string }

async function fetchXeroContacts(db: SupabaseClient, orgId: string): Promise<{ ok: true; list: XRec[] } | Fail> {
  const out: XRec[] = []
  for (let page = 1; page <= 60; page++) {
    const r = await xeroGet<{ Contacts?: { ContactID: string; Name: string }[] }>(db, orgId, `/Contacts?page=${page}&summaryOnly=true`)
    if (!r.ok) return r
    const batch = r.data.Contacts ?? []
    if (batch.length === 0) break
    for (const c of batch) if (c.ContactID && c.Name) out.push({ id: c.ContactID, name: c.Name })
  }
  return { ok: true, list: out }
}

async function fetchXeroItems(db: SupabaseClient, orgId: string): Promise<{ ok: true; list: XRec[] } | Fail> {
  const r = await xeroGet<{ Items?: { ItemID: string; Code: string; Name?: string }[] }>(db, orgId, '/Items')
  if (!r.ok) return r
  return { ok: true, list: (r.data.Items ?? []).filter(i => i.ItemID && i.Code).map(i => ({ id: i.ItemID, name: i.Name ?? i.Code, code: i.Code })) }
}

const fetchXero = (db: SupabaseClient, orgId: string, entity: Entity) => (entity === 'contact' ? fetchXeroContacts(db, orgId) : fetchXeroItems(db, orgId))

// ── Inventa reads and links ─────────────────────────────────────────────────

type Link = { entity_id: string; xero_id: string | null; status: 'synced' | 'failed'; error: string | null; synced_at: string }

async function loadLinks(db: SupabaseClient, orgId: string, entity: Entity): Promise<Map<string, Link>> {
  const { data } = await db.from('xero_sync_records').select('entity_id, xero_id, status, error, synced_at').eq('org_id', orgId).eq('entity', entity)
  return new Map(((data ?? []) as Link[]).map(l => [l.entity_id, l]))
}

async function loadInventa(db: SupabaseClient, orgId: string, entity: Entity, ids?: string[]): Promise<Row[]> {
  const table = entity === 'contact' ? 'contacts' : 'products'
  let q = db.from(table).select('*').eq('org_id', orgId)
  if (ids && ids.length > 0) q = q.in('id', ids)
  const { data } = await q.order('name')
  return (data ?? []) as Row[]
}

/** The key a record is matched on in Xero: contact name, or product SKU (item code). */
const keyOf = (entity: Entity, r: Row) => norm(entity === 'contact' ? r.name : r.sku)
const xeroKey = (entity: Entity, x: XRec) => norm(entity === 'contact' ? x.name : x.code)

async function saveLinks(db: SupabaseClient, orgId: string, entity: Entity, rows: { entity_id: string; xero_id: string | null; status: 'synced' | 'failed'; error: string | null }[]) {
  if (rows.length === 0) return
  const now = new Date().toISOString()
  const payload = rows.map(r => ({ org_id: orgId, entity, ...r, synced_at: now }))
  for (let i = 0; i < payload.length; i += 200) {
    await db.from('xero_sync_records').upsert(payload.slice(i, i + 200), { onConflict: 'org_id,entity,entity_id' })
  }
}

// ── What gets sent to Xero ──────────────────────────────────────────────────

function contactPayload(c: Row) {
  const p: Record<string, unknown> = { Name: String(c.name).trim().slice(0, 255) }
  const email = clean(c.bill_email) ?? clean(c.email)
  if (email) p.EmailAddress = email.slice(0, 255)
  const phone = clean(c.phone) ?? clean(c.bill_phone)
  if (phone) p.Phones = [{ PhoneType: 'DEFAULT', PhoneNumber: phone.slice(0, 50) }]
  const street = clean(c.bill_street) ?? clean(c.address)
  const city = clean(c.bill_city) ?? clean(c.city)
  const postcode = clean(c.bill_postcode)
  const country = clean(c.bill_country) ?? clean(c.country)
  if (street || city || postcode) {
    p.Addresses = [{ AddressType: 'STREET', AddressLine1: street?.slice(0, 500), City: city?.slice(0, 255), PostalCode: postcode?.slice(0, 50), Country: country?.slice(0, 50) }]
  }
  const tax = clean(c.tax_number); if (tax) p.TaxNumber = tax.slice(0, 50)
  const site = clean(c.website); if (site) p.Website = site.slice(0, 255)
  return p
}

function itemPayload(p: Row, settings: XeroSettings) {
  const desc = clean(p.description)?.slice(0, 4000)
  const sellTax = resolveTaxType(settings, p.sell_tax_rate_id as string | null, 'sales')
  const buyTax = resolveTaxType(settings, p.buy_tax_rate_id as string | null, 'purchases')
  return {
    Code: String(p.sku).trim(),
    Name: String(p.name).trim().slice(0, 50),
    ...(desc ? { Description: desc, PurchaseDescription: desc } : {}),
    IsSold: true,
    IsPurchased: true,
    IsTrackedAsInventory: false, // Inventa stays the source of truth for stock
    PurchaseDetails: { UnitPrice: num(p.cost_price), AccountCode: settings.purchases_account_code, ...(buyTax ? { TaxType: buyTax } : {}) },
    SalesDetails: { UnitPrice: num(p.sell_price), AccountCode: settings.sales_account_code, ...(sellTax ? { TaxType: sellTax } : {}) },
  }
}

// ── Inventa → Xero ──────────────────────────────────────────────────────────

type CreateReply = { ContactID?: string; ItemID?: string; Name?: string; Code?: string; HasValidationErrors?: boolean; ValidationErrors?: { Message?: string }[] }

export async function runSync(
  db: SupabaseClient,
  orgId: string,
  entity: Entity,
  opts: { ids?: string[]; settings?: XeroSettings | null } = {},
): Promise<{ ok: true; summary: SyncSummary } | Fail> {
  const settings = opts.settings ?? {}
  if (entity === 'product' && (!settings.sales_account_code || !settings.purchases_account_code)) {
    return { ok: false, status: 409, error: 'Save the Accounts and tax settings in Xero settings before syncing products.' }
  }

  const xero = await fetchXero(db, orgId, entity)
  if (!xero.ok) return xero

  const [rows, links] = await Promise.all([loadInventa(db, orgId, entity, opts.ids), loadLinks(db, orgId, entity)])
  const xeroIds = new Set(xero.list.map(x => x.id))
  const byKey = new Map<string, string>()
  for (const x of xero.list) { const k = xeroKey(entity, x); if (k && !byKey.has(k)) byKey.set(k, x.id) }

  const summary: SyncSummary = { linked: 0, created: 0, failed: 0, unchanged: 0, failures: [] }
  const toSave: Parameters<typeof saveLinks>[3] = []
  const fail = (r: Row, error: string) => {
    summary.failed++
    summary.failures.push({ id: String(r.id), name: String(r.name), error })
    toSave.push({ entity_id: String(r.id), xero_id: null, status: 'failed', error })
  }

  const toCreate = new Map<string, Row[]>() // grouped by match key, so same-name records share one Xero record
  for (const r of rows) {
    const link = links.get(String(r.id))
    if (link?.status === 'synced' && link.xero_id && xeroIds.has(link.xero_id)) { summary.unchanged++; continue }

    const key = keyOf(entity, r)
    if (entity === 'product') {
      if (!key) { fail(r, 'Add a SKU first. Xero needs an item code.'); continue }
      if (String(r.sku).trim().length > 30) { fail(r, 'The SKU is longer than 30 characters, which is Xero’s limit for item codes.'); continue }
    }
    const hit = byKey.get(key)
    if (hit) {
      summary.linked++
      toSave.push({ entity_id: String(r.id), xero_id: hit, status: 'synced', error: null })
      continue
    }
    const group = toCreate.get(key) ?? []
    group.push(r)
    toCreate.set(key, group)
  }

  const groups = [...toCreate.values()]
  for (let i = 0; i < groups.length; i += BATCH) {
    const chunk = groups.slice(i, i + BATCH)
    const body = entity === 'contact'
      ? { Contacts: chunk.map(g => contactPayload(g[0])) }
      : { Items: chunk.map(g => itemPayload(g[0], settings)) }
    const res = await xeroPost<{ Contacts?: CreateReply[]; Items?: CreateReply[] }>(db, orgId, `/${entity === 'contact' ? 'Contacts' : 'Items'}?summarizeErrors=false`, body)
    if (!res.ok) {
      await saveLinks(db, orgId, entity, toSave)
      return res
    }
    const replies = (entity === 'contact' ? res.data.Contacts : res.data.Items) ?? []
    chunk.forEach((group, idx) => {
      const rep = replies[idx]
      const id = entity === 'contact' ? rep?.ContactID : rep?.ItemID
      if (rep && id && !rep.HasValidationErrors) {
        for (const r of group) { summary.created++; toSave.push({ entity_id: String(r.id), xero_id: id, status: 'synced', error: null }) }
      } else {
        const msg = rep?.ValidationErrors?.map(e => e.Message).filter(Boolean).join(' ') || 'Xero did not accept this record.'
        for (const r of group) fail(r, msg)
      }
    })
  }

  await saveLinks(db, orgId, entity, toSave)
  await logRun(db, orgId, entity, 'synced', summary)
  return { ok: true, summary }
}

const PLURAL = { contact: 'Contacts', product: 'Products' } as const
/** One Audit Log line for a sync or import run (nothing is written when nothing happened). */
async function logRun(db: SupabaseClient, orgId: string, entity: Entity, verb: 'synced' | 'imported', s: { created?: number; imported?: number; linked: number; failed: number | { name: string; error: string }[]; failures?: { name: string; error: string }[] }) {
  const made = s.created ?? s.imported ?? 0
  const failList = Array.isArray(s.failed) ? s.failed : (s.failures ?? [])
  const failed = Array.isArray(s.failed) ? s.failed.length : s.failed
  if (made + s.linked + failed === 0) return
  const bits = [made ? `${made} ${verb === 'synced' ? 'created in Xero' : 'imported from Xero'}` : '', s.linked ? `${s.linked} matched to existing Xero ${PLURAL[entity].toLowerCase()}` : '', failed ? `${failed} failed` : ''].filter(Boolean)
  const names = failList.slice(0, 3).map(f => f.name).join(', ')
  await logXero(db, orgId, {
    action: verb === 'synced' ? `Xero ${PLURAL[entity]} Synced` : `Xero ${PLURAL[entity]} Imported`,
    ref: PLURAL[entity], entity_type: entity === 'contact' ? 'contacts' : 'products', entity_id: null,
    detail: `${bits.join(' · ')}${names ? ` · Failed: ${names}${failList.length > 3 ? '…' : ''}` : ''}`,
  })
}

// ── Overview for the dashboard ──────────────────────────────────────────────

export async function buildOverview(db: SupabaseClient, orgId: string, entity: Entity): Promise<{ ok: true; overview: Overview } | Fail> {
  const xero = await fetchXero(db, orgId, entity)
  if (!xero.ok) return xero
  const [rows, links] = await Promise.all([loadInventa(db, orgId, entity), loadLinks(db, orgId, entity)])

  const xeroIds = new Set(xero.list.map(x => x.id))
  const byKey = new Map<string, string>()
  for (const x of xero.list) { const k = xeroKey(entity, x); if (k && !byKey.has(k)) byKey.set(k, x.id) }

  const used = new Set<string>()
  const seenKeys = new Set<string>()
  let sharedKey = 0
  for (const r of rows) { const k = keyOf(entity, r); if (!k) continue; if (seenKeys.has(k)) sharedKey++; else seenKeys.add(k) }
  const failures: OverviewItem[] = []
  const onlyInInventa: OverviewItem[] = []
  let synced = 0
  let lastSyncedAt: string | null = null

  for (const r of rows) {
    const link = links.get(String(r.id))
    if (link?.status === 'synced' && link.xero_id && xeroIds.has(link.xero_id)) {
      synced++
      used.add(link.xero_id)
      if (!lastSyncedAt || link.synced_at > lastSyncedAt) lastSyncedAt = link.synced_at
      continue
    }
    const hit = byKey.get(keyOf(entity, r))
    if (hit) { used.add(hit); continue } // will be linked on the next sync
    if (link?.status === 'failed') failures.push({ id: String(r.id), name: String(r.name), error: link.error })
    else onlyInInventa.push({ id: String(r.id), name: String(r.name) })
  }

  const onlyInXero = xero.list.filter(x => !used.has(x.id)).map(x => ({ xeroId: x.id, name: x.name, code: x.code ?? null }))
  const failedCount = failures.length

  return {
    ok: true,
    overview: {
      inventa: rows.length,
      xero: xero.list.length,
      synced,
      notSynced: rows.length - synced - failedCount,
      failed: failedCount,
      failures: failures.slice(0, LIST_CAP),
      onlyInInventa: onlyInInventa.slice(0, LIST_CAP),
      onlyInXero: onlyInXero.slice(0, LIST_CAP),
      lastSyncedAt,
      sharedKey,
    },
  }
}

// ── Xero → Inventa (only what was picked) ───────────────────────────────────

type XContactFull = {
  ContactID: string; Name?: string; EmailAddress?: string; TaxNumber?: string; Website?: string
  IsSupplier?: boolean; IsCustomer?: boolean
  Phones?: { PhoneType?: string; PhoneNumber?: string; PhoneAreaCode?: string; PhoneCountryCode?: string }[]
  Addresses?: { AddressType?: string; AddressLine1?: string; City?: string; PostalCode?: string; Country?: string }[]
}
type XItemFull = {
  ItemID: string; Code: string; Name?: string; Description?: string; IsTrackedAsInventory?: boolean
  PurchaseDetails?: { UnitPrice?: number }; SalesDetails?: { UnitPrice?: number }
}

export async function importFromXero(
  db: SupabaseClient,
  orgId: string,
  entity: Entity,
  xeroIds: string[],
): Promise<{ ok: true; imported: number; linked: number; failed: { name: string; error: string }[] } | Fail> {
  const ids = [...new Set(xeroIds)].slice(0, 100)
  if (ids.length === 0) return { ok: true, imported: 0, linked: 0, failed: [] }

  const existing = await loadInventa(db, orgId, entity)
  const existingByKey = new Map<string, string>()
  for (const r of existing) { const k = keyOf(entity, r); if (k && !existingByKey.has(k)) existingByKey.set(k, String(r.id)) }

  const out = { imported: 0, linked: 0, failed: [] as { name: string; error: string }[] }
  const toSave: Parameters<typeof saveLinks>[3] = []

  if (entity === 'contact') {
    const full: XContactFull[] = []
    for (let i = 0; i < ids.length; i += 25) {
      const r = await xeroGet<{ Contacts?: XContactFull[] }>(db, orgId, `/Contacts?IDs=${ids.slice(i, i + 25).join(',')}`)
      if (!r.ok) return r
      full.push(...(r.data.Contacts ?? []))
    }
    for (const c of full) {
      const name = clean(c.Name)
      if (!name) continue
      const dup = existingByKey.get(norm(name))
      if (dup) { out.linked++; toSave.push({ entity_id: dup, xero_id: c.ContactID, status: 'synced', error: null }); continue }
      const phone = c.Phones?.find(p => p.PhoneNumber)
      const addr = c.Addresses?.find(a => a.AddressType === 'STREET' && (a.AddressLine1 || a.City)) ?? c.Addresses?.find(a => a.AddressLine1 || a.City)
      const { data, error } = await db.from('contacts').insert({
        org_id: orgId,
        name,
        type: c.IsSupplier && !c.IsCustomer ? 'supplier' : 'customer',
        email: clean(c.EmailAddress),
        phone: phone ? [phone.PhoneCountryCode, phone.PhoneAreaCode, phone.PhoneNumber].filter(Boolean).join(' ') : null,
        tax_number: clean(c.TaxNumber),
        website: clean(c.Website),
        bill_street: clean(addr?.AddressLine1),
        bill_city: clean(addr?.City),
        bill_postcode: clean(addr?.PostalCode),
        ...(clean(addr?.Country) ? { bill_country: clean(addr?.Country) } : {}),
        is_active: true,
      }).select('id').single()
      if (error || !data) { out.failed.push({ name, error: 'Could not add this contact to InventaHQ.' }); continue }
      out.imported++
      toSave.push({ entity_id: (data as { id: string }).id, xero_id: c.ContactID, status: 'synced', error: null })
    }
  } else {
    const all = await xeroGet<{ Items?: XItemFull[] }>(db, orgId, '/Items')
    if (!all.ok) return all
    const wanted = new Set(ids)
    for (const it of (all.data.Items ?? []).filter(i => wanted.has(i.ItemID))) {
      const name = clean(it.Name) ?? it.Code
      const dup = existingByKey.get(norm(it.Code))
      if (dup) { out.linked++; toSave.push({ entity_id: dup, xero_id: it.ItemID, status: 'synced', error: null }); continue }
      const { data, error } = await db.from('products').insert({
        org_id: orgId,
        name,
        sku: it.Code,
        description: clean(it.Description),
        type: it.IsTrackedAsInventory ? 'Stock' : 'NonStock',
        track_stock: Boolean(it.IsTrackedAsInventory),
        sell_price: num(it.SalesDetails?.UnitPrice),
        cost_price: num(it.PurchaseDetails?.UnitPrice),
        is_active: true,
      }).select('id').single()
      if (error || !data) { out.failed.push({ name, error: 'Could not add this product to InventaHQ.' }); continue }
      out.imported++
      toSave.push({ entity_id: (data as { id: string }).id, xero_id: it.ItemID, status: 'synced', error: null })
    }
  }

  await saveLinks(db, orgId, entity, toSave)
  await logRun(db, orgId, entity, 'imported', { imported: out.imported, linked: out.linked, failed: out.failed })
  return { ok: true, ...out }
}
