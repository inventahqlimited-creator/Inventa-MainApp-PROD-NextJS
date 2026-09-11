import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import MembersTable from '@/components/app/members-table'

export default async function UsersSettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Get caller's membership
  const { data: membership } = await supabase
    .from('org_members')
    .select('role, org_id')
    .eq('user_id', user.id)
    .eq('invite_status', 'accepted')
    .single()

  const m = membership as { role: string; org_id: string } | null
  if (!m) redirect('/login')

  // Fetch all members for this org
  const { data: members } = await supabase
    .from('org_members')
    .select('id, first_name, last_name, email, role, invite_status, invited_at, accepted_at')
    .eq('org_id', m.org_id)
    .order('accepted_at', { ascending: false })

  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-white" style={{ fontFamily: 'var(--font-display)' }}>
          Team
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Manage who has access to your organisation.
        </p>
      </div>
      <MembersTable
        members={members ?? []}
        currentUserId={user.id}
        isAdmin={m.role === 'admin'}
      />
    </div>
  )
}
