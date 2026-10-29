import { saveError } from '@/lib/api/db-error'
import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { pick, badForeignKey, PRODUCT_FIELDS, PRODUCT_LINKS } from '@/lib/api/sanitize'
import { requirePerm } from '@/lib/auth/access'
import { ADDON_OFF_MESSAGE, hasAddon } from '@/lib/addons-server'

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
  const permGate = await requirePerm('edit_products')
  if ('res' in permGate) return permGate.res
  const { id } = await params
  const ctx = await getOrg()
  if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const clean = pick(await request.json().catch(() => null), PRODUCT_FIELDS)
  if (!clean) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  // kits are an add-on: only organisations that have it switched on can mark a product as a kit
  if (clean.is_kit === true) {
    const orgForKit = ctx.org_id
    if (!(await hasAddon(ctx.adminClient, orgForKit, 'kits'))) return NextResponse.json({ error: ADDON_OFF_MESSAGE }, { status: 403 })
    if (clean.type !== undefined && clean.type !== 'NonStock') return NextResponse.json({ error: 'A kit has to be a Non Stock item. Change the stock type to Non Stock first.' }, { status: 400 })
  }
  const badFk = await badForeignKey(ctx.adminClient, ctx.org_id, clean, PRODUCT_LINKS)
  if (badFk) return NextResponse.json({ error: `Invalid ${badFk}` }, { status: 400 })
  const { error } = await ctx.adminClient
    .from('products')
    .update(clean)
    .eq('id', id)
    .eq('org_id', ctx.org_id)
  if (error) { console.error('products update failed', error.message); const e = saveError(error, 'product'); return NextResponse.json({ error: e.message }, { status: e.status }) }
  return NextResponse.json({ success: true })
}
