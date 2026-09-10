import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { headers } from 'next/headers'

export const dynamic = 'force-dynamic'

export default async function RootPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const headersList = await headers()
  const host = headersList.get('host') || ''
  const isHub = host.includes('hub.inventahq.com')

  if (isHub) {
    redirect('/admin')
  }

  redirect('/dashboard')
}
