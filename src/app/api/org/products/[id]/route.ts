import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { pick, badForeignKey, PRODUCT_FIELDS, PRODUCT_LINKS } from '@/lib/api/sanitize'

type Params = { params: Promise<{ id: string }> }

async function getOrg() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const adminClient = createAdminClient()
  const { data: m } = await adminClient
    .from('org_members')
    .select('org_id')
    .eq('user_id', user.id)
    .eq('invite_status', 'accepted')
    .single()
  return m ? { org_id: (m as { org_id: string }).org_id, adminClient } : null
}

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params
  const ctx = await getOrg()
  if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const clean = pick(await request.json().catch(() => null), PRODUCT_FIELDS)
  if (!clean) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  const badFk = await badForeignKey(ctx.adminClient, ctx.org_id, clean, PRODUCT_LINKS)
  if (badFk) return NextResponse.json({ error: `Invalid ${badFk}` }, { status: 400 })
  const { error } = await ctx.adminClient
    .from('products')
    .update(clean)
    .eq('id', id)
    .eq('org_id', ctx.org_id)
  if (error) { console.error('products update failed', error.message); return NextResponse.json({ error: 'Could not save the product' }, { status: 500 }) }
  return NextResponse.json({ success: true })
}
