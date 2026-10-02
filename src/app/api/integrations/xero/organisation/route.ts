// src/app/api/integrations/xero/organisation/route.ts
// POST: choose which Xero organisation to link (when the user approved more than one).
// DELETE: disconnect (or cancel a half-finished connection).
import { NextResponse } from 'next/server'
import { xeroAuth } from '@/lib/xero/auth'
import { getAccessToken, removeConnection, type XeroTenant } from '@/lib/xero/client'
import { decrypt } from '@/lib/xero/crypto'

export async function POST(req: Request) {
  const auth = await xeroAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!auth.enabled) return NextResponse.json({ error: 'Xero is not switched on for this organisation.' }, { status: 403 })
  if (!auth.isAdmin) return NextResponse.json({ error: 'Only admins can manage Xero.' }, { status: 403 })

  const { tenantId } = (await req.json().catch(() => ({}))) as { tenantId?: string }
  const { data } = await auth.db.from('xero_connections').select('status, pending_tenants').eq('org_id', auth.orgId).maybeSingle()
  const row = data as { status: string; pending_tenants: XeroTenant[] | null } | null
  if (!row || row.status !== 'pending' || !Array.isArray(row.pending_tenants)) {
    return NextResponse.json({ error: 'There is no Xero sign-in waiting for a choice. Start again with Connect Xero.' }, { status: 400 })
  }
  const chosen = row.pending_tenants.find(t => t.tenantId === tenantId)
  if (!chosen) return NextResponse.json({ error: 'Pick one of the listed organisations.' }, { status: 400 })

  const now = new Date().toISOString()
  const { error } = await auth.db.from('xero_connections').update({
    status: 'connected', tenant_id: chosen.tenantId, tenant_name: chosen.tenantName, connection_id: chosen.connectionId,
    pending_tenants: null, connected_by: auth.userId, connected_at: now, updated_at: now,
  }).eq('org_id', auth.orgId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // The ones not chosen would still count against the app's connection limit, so withdraw them (best effort)
  const access = await getAccessToken(auth.db, auth.orgId)
  if (access) {
    await Promise.all(row.pending_tenants.filter(t => t.tenantId !== chosen.tenantId).map(t => removeConnection(access.accessToken, t.connectionId).catch(() => false)))
  }
  return NextResponse.json({ success: true, tenant_name: chosen.tenantName })
}

export async function DELETE() {
  const auth = await xeroAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!auth.isAdmin) return NextResponse.json({ error: 'Only admins can manage Xero.' }, { status: 403 })

  const { data } = await auth.db.from('xero_connections').select('status, connection_id, pending_tenants, access_token_enc, expires_at').eq('org_id', auth.orgId).maybeSingle()
  const row = data as { status: string; connection_id: string | null; pending_tenants: XeroTenant[] | null; access_token_enc: string | null; expires_at: string | null } | null
  if (!row) return NextResponse.json({ success: true })

  // Withdraw this app's access in Xero too, so the slot is freed. If Xero can't be reached we still disconnect here.
  try {
    if (row.status === 'connected') {
      const access = await getAccessToken(auth.db, auth.orgId)
      if (access && row.connection_id) await removeConnection(access.accessToken, row.connection_id)
    } else if (row.access_token_enc && row.expires_at && Date.parse(row.expires_at) > Date.now()) {
      const token = decrypt(row.access_token_enc)
      await Promise.all((row.pending_tenants ?? []).map(t => removeConnection(token, t.connectionId).catch(() => false)))
    }
  } catch { /* disconnect locally regardless */ }

  const { error } = await auth.db.from('xero_connections').delete().eq('org_id', auth.orgId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
