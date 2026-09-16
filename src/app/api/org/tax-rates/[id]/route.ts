import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

type Params = { params: Promise<{ id: string }> }

async function getOrg() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const adminClient = createAdminClient()
  const { data: m } = await adminClient.from('org_members').select('org_id').eq('user_id', user.id).eq('invite_status', 'accepted').single()
  return m ? { org_id: (m as { org_id: string }).org_id, adminClient } : null
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params
  const ctx = await getOrg()
  if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { error } = await ctx.adminClient.from('tax_rates').delete().eq('id', id).eq('org_id', ctx.org_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
