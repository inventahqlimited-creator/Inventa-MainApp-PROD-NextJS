// GET /auth/invite-info?org=<uuid>&email=<address> → { org_name } for the invite confirmation page.
// Public (the person isn't signed in yet), so it only answers when that email has a pending or just-accepted
// invite to that organisation: knowing an org's id alone reveals nothing.
import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams
  const org = (q.get('org') ?? '').trim()
  // a "+" in an email arrives as a space when the link wasn't encoded
  const email = (q.get('email') ?? '').trim().replace(/ /g, '+').toLowerCase()
  if (!UUID.test(org) || !email || email.length > 320) return NextResponse.json({ org_name: null })

  const db = createAdminClient()
  const { data: member } = await db.from('org_members').select('id').eq('org_id', org).ilike('email', email).limit(1).maybeSingle()
  if (!member) return NextResponse.json({ org_name: null })
  const { data } = await db.from('organisations').select('name').eq('id', org).maybeSingle()
  return NextResponse.json({ org_name: (data as { name?: string } | null)?.name ?? null })
}
