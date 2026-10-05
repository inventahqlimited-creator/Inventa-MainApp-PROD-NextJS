// src/app/api/integrations/xero/mapping/route.ts
// GET: Xero accounts and tax rates, this organisation's tax rates, saved settings and suggestions.
// PUT: save the account and tax mapping (admin only).
import { NextResponse } from 'next/server'
import { xeroAuth } from '@/lib/xero/auth'
import { cleanSettings, fetchXeroLists, loadInventaTaxRates, suggestAccounts, suggestTax, type XeroSettings } from '@/lib/xero/mapping'

export const dynamic = 'force-dynamic'

async function connected(a: NonNullable<Awaited<ReturnType<typeof xeroAuth>>>) {
  const { data } = await a.db.from('xero_connections').select('status, settings').eq('org_id', a.orgId).maybeSingle()
  const row = data as { status: string; settings: XeroSettings | null } | null
  return row && row.status === 'connected' ? row : null
}

// Xero's accounts and tax rates change rarely, so each server keeps them for a few minutes per organisation.
// "Refresh from Xero" (?refresh=1) and saving bypass it. This is what makes opening the settings quick.
type Lists = Extract<Awaited<ReturnType<typeof fetchXeroLists>>, { ok: true }>
const listCache = new Map<string, { at: number; lists: Lists }>()
const LISTS_TTL_MS = 10 * 60_000

async function xeroLists(db: Parameters<typeof fetchXeroLists>[0], orgId: string, fresh: boolean) {
  const hit = listCache.get(orgId)
  if (!fresh && hit && Date.now() - hit.at < LISTS_TTL_MS) return hit.lists
  const lists = await fetchXeroLists(db, orgId)
  if (lists.ok) listCache.set(orgId, { at: Date.now(), lists })
  return lists
}

export async function GET(req: Request) {
  const a = await xeroAuth()
  if (!a) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!a.enabled) return NextResponse.json({ error: 'Xero isn’t switched on for your organisation.' }, { status: 403 })
  const row = await connected(a)
  if (!row) return NextResponse.json({ error: 'Connect Xero first.' }, { status: 409 })

  const fresh = new URL(req.url).searchParams.get('refresh') === '1'
  const [lists, inventaRates] = await Promise.all([xeroLists(a.db, a.orgId, fresh), loadInventaTaxRates(a.db, a.orgId)])
  if (!lists.ok) return NextResponse.json({ error: lists.error }, { status: lists.status === 401 ? 409 : 502 })

  return NextResponse.json({
    accounts: lists.accounts,
    taxRates: lists.taxRates,
    inventaRates,
    settings: row.settings ?? {},
    suggested: { ...suggestAccounts(lists.accounts), tax_map: suggestTax(inventaRates, lists.taxRates) },
    canEdit: a.isAdmin,
  })
}

export async function PUT(req: Request) {
  const a = await xeroAuth()
  if (!a) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!a.enabled) return NextResponse.json({ error: 'Xero isn’t switched on for your organisation.' }, { status: 403 })
  if (!a.isAdmin) return NextResponse.json({ error: 'Only admins can change the Xero mapping.' }, { status: 403 })
  if (!(await connected(a))) return NextResponse.json({ error: 'Connect Xero first.' }, { status: 409 })

  const body = await req.json().catch(() => null)
  const [lists, inventaRates] = await Promise.all([xeroLists(a.db, a.orgId, false), loadInventaTaxRates(a.db, a.orgId)])
  if (!lists.ok) return NextResponse.json({ error: lists.error }, { status: 502 })

  const cleaned = cleanSettings(body?.settings, lists, inventaRates.map(r => r.id))
  if (!cleaned.ok) return NextResponse.json({ error: cleaned.error }, { status: 400 })

  const { error } = await a.db.from('xero_connections').update({ settings: cleaned.settings, updated_at: new Date().toISOString() }).eq('org_id', a.orgId)
  if (error) return NextResponse.json({ error: 'Could not save. Please try again.' }, { status: 500 })
  return NextResponse.json({ ok: true, settings: cleaned.settings })
}
