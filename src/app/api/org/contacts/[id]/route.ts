import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { pick, badForeignKey, CONTACT_FIELDS, CONTACT_LINKS } from '@/lib/api/sanitize'
import { requirePerm } from '@/lib/auth/access'

type Params = { params: Promise<{ id: string }> }

async function getMembership(supabase: Awaited<ReturnType<typeof createClient>>, adminClient: ReturnType<typeof createAdminClient>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: membership } = await adminClient
    .from('org_members')
    .select('org_id, role')
    .eq('user_id', user.id)
    .eq('invite_status', 'accepted')
    .single()
  if (!membership) return null
  return { user, membership: membership as { org_id: string; role: string } }
}

export async function PATCH(request: Request, { params }: Params) {
  const permGate = await requirePerm('edit_contacts')
  if ('res' in permGate) return permGate.res
  const { id } = await params
  const supabase = await createClient()
  const adminClient = createAdminClient()
  const caller = await getMembership(supabase, adminClient)
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const clean = pick(await request.json().catch(() => null), CONTACT_FIELDS)
  if (!clean) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  const badFk = await badForeignKey(adminClient, caller.membership.org_id, clean, CONTACT_LINKS)
  if (badFk) return NextResponse.json({ error: `Invalid ${badFk}` }, { status: 400 })
  const { error } = await adminClient
    .from('contacts')
    .update(clean)
    .eq('id', id)
    .eq('org_id', caller.membership.org_id)

  if (error) { console.error('contacts update failed', error.message); return NextResponse.json({ error: 'Could not save the contact' }, { status: 500 }) }
  return NextResponse.json({ success: true })
}

export async function DELETE(_request: Request, { params }: Params) {
  const permGate = await requirePerm('edit_contacts')
  if ('res' in permGate) return permGate.res
  const { id } = await params
  const supabase = await createClient()
  const adminClient = createAdminClient()
  const caller = await getMembership(supabase, adminClient)
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { error } = await adminClient
    .from('contacts')
    .delete()
    .eq('id', id)
    .eq('org_id', caller.membership.org_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
