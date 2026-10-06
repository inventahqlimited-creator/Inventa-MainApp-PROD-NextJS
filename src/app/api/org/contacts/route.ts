import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { pick, badForeignKey, CONTACT_FIELDS, CONTACT_LINKS } from '@/lib/api/sanitize'
import { requirePerm } from '@/lib/auth/access'

export async function POST(request: Request) {
  const permGate = await requirePerm('create_contacts')
  if ('res' in permGate) return permGate.res
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const adminClient = createAdminClient()
  const { data: membership } = await adminClient
    .from('org_members')
    .select('org_id, role')
    .eq('user_id', user.id)
    .eq('invite_status', 'accepted')
    .single()

  if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const clean = pick(await request.json().catch(() => null), CONTACT_FIELDS)
  if (!clean) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  const badFk = await badForeignKey(adminClient, membership.org_id, clean, CONTACT_LINKS)
  if (badFk) return NextResponse.json({ error: `Invalid ${badFk}` }, { status: 400 })
  const { data, error } = await adminClient
    .from('contacts')
    .insert({ ...clean, org_id: membership.org_id })
    .select('id')
    .single()

  if (error) { console.error('contacts insert failed', error.message); return NextResponse.json({ error: 'Could not save the contact' }, { status: 500 }) }
  return NextResponse.json({ id: data.id })
}
