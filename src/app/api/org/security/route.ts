// src/app/api/org/security/route.ts
// Saves the organisation's password policy. Needs the "manage security settings" permission.
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { requirePerm } from '@/lib/auth/access'
import { normalizePolicy } from '@/lib/auth/password-policy'

async function getAuth() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const adminClient = createAdminClient()
  const { data: m } = await adminClient.from('org_members').select('org_id').eq('user_id', user.id).eq('invite_status', 'accepted').single()
  return m ? { orgId: m.org_id as string, adminClient } : null
}

export async function PATCH(req: Request) {
  const permGate = await requirePerm('manage_security')
  if ('res' in permGate) return permGate.res
  const auth = await getAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object' || !('password_policy' in body)) {
    return NextResponse.json({ error: 'No valid fields' }, { status: 400 })
  }

  const { data: current } = await auth.adminClient.from('organisations').select('password_policy').eq('id', auth.orgId).single()
  const before = normalizePolicy((current as { password_policy?: unknown } | null)?.password_policy)
  const next = normalizePolicy((body as { password_policy: unknown }).password_policy)

  // The server decides when rotation started — never the browser.
  if (!next.rotation.enabled) next.rotation.enabled_at = before.rotation.enabled_at
  else next.rotation.enabled_at = before.rotation.enabled && before.rotation.enabled_at ? before.rotation.enabled_at : new Date().toISOString()

  const { error } = await auth.adminClient.from('organisations').update({ password_policy: next }).eq('id', auth.orgId)
  if (error) return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
  return NextResponse.json({ success: true, password_policy: next })
}
