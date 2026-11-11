// src/lib/auth/accept-invite.ts
// Marks a person's pending invite as accepted once they have signed in through the invite link.
// The invite carries the organisation (org_id) in the person's sign-in details; the member row was created with their email.
import type { User } from '@supabase/supabase-js'

type Db = { from: (t: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

/** Returns how many pending invites were accepted (0 when there was nothing to accept). */
export async function acceptPendingInvite(db: Db, user: Pick<User, 'id' | 'email' | 'email_confirmed_at' | 'user_metadata'>): Promise<number> {
  const orgId = (user.user_metadata as { org_id?: string } | null)?.org_id
  if (!orgId || !user.email || !user.email_confirmed_at) return 0
  const { data, error } = await db
    .from('org_members')
    .update({ user_id: user.id, invite_status: 'accepted', accepted_at: new Date().toISOString() })
    .eq('org_id', orgId)
    .ilike('email', user.email.replace(/[\\%_]/g, c => `\\${c}`))
    .eq('invite_status', 'pending')
    .select('id')
  if (error) return 0
  return Array.isArray(data) ? data.length : 0
}
