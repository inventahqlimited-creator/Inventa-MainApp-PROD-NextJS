// src/app/api/org/profile/avatar/route.ts
// Upload / remove the signed-in user's profile photo (bucket: org-assets, folder: avatars/).
import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

async function getAuth() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const db = createAdminClient()
  const { data: m } = await db.from('org_members').select('id').eq('user_id', user.id).eq('invite_status', 'accepted').single()
  return m ? { user, db } : null
}

export async function POST(req: Request) {
  const a = await getAuth()
  if (!a) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const file = (await req.formData()).get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  const types: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
  const ext = types[file.type]
  if (!ext) return NextResponse.json({ error: 'Only JPG, PNG or WebP images are allowed' }, { status: 400 })
  if (file.size > 2 * 1024 * 1024) return NextResponse.json({ error: 'Photo must be under 2MB' }, { status: 400 })

  const path = `avatars/${a.user.id}.${ext}`
  // clear any older photo with a different extension
  await a.db.storage.from('org-assets').remove(['jpg', 'png', 'webp'].filter(e => e !== ext).map(e => `avatars/${a.user.id}.${e}`))
  const { error: upErr } = await a.db.storage.from('org-assets').upload(path, await file.arrayBuffer(), { contentType: file.type, upsert: true })
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  const { data: { publicUrl } } = a.db.storage.from('org-assets').getPublicUrl(path)
  const url = `${publicUrl}?v=${Date.now()}`   // cache-bust so the new photo shows straight away
  const { error } = await a.db.from('org_members').update({ avatar_url: url }).eq('user_id', a.user.id).eq('invite_status', 'accepted')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ url })
}

export async function DELETE() {
  const a = await getAuth()
  if (!a) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  await a.db.storage.from('org-assets').remove(['jpg', 'png', 'webp'].map(e => `avatars/${a.user.id}.${e}`))
  await a.db.from('org_members').update({ avatar_url: null }).eq('user_id', a.user.id).eq('invite_status', 'accepted')
  return NextResponse.json({ success: true })
}
