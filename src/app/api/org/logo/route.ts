// src/app/api/org/logo/route.ts
import { createAdminClient } from '@/lib/supabase/server'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const adminClient = createAdminClient()
  const { data: membership } = await adminClient
    .from('org_members')
    .select('org_id')
    .eq('user_id', user.id)
    .eq('invite_status', 'accepted')
    .single()

  if (!membership) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  // Validate type and size (1MB)
  const allowed = ['image/jpeg', 'image/png']
  if (!allowed.includes(file.type)) {
    return NextResponse.json({ error: 'Only JPG and PNG files are allowed' }, { status: 400 })
  }
  if (file.size > 1024 * 1024) {
    return NextResponse.json({ error: 'File must be under 1MB' }, { status: 400 })
  }

  const ext = file.type === 'image/png' ? 'png' : 'jpg'
  const path = `org-logos/${membership.org_id}.${ext}`
  const arrayBuffer = await file.arrayBuffer()

  // Upload to Supabase Storage bucket "org-assets" (create this bucket in Supabase if it doesn't exist)
  const { error: uploadError } = await adminClient.storage
    .from('org-assets')
    .upload(path, arrayBuffer, { contentType: file.type, upsert: true })

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  const { data: { publicUrl } } = adminClient.storage.from('org-assets').getPublicUrl(path)

  // Save URL to organisation
  await adminClient.from('organisations').update({ logo_url: publicUrl }).eq('id', membership.org_id)

  return NextResponse.json({ url: publicUrl })
}
