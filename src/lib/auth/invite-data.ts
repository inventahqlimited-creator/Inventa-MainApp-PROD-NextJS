// src/lib/auth/invite-data.ts
// The data sent with a Supabase invite. The invite email template reads org_name to say who invited the person.
type Db = { from: (t: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

export async function inviteData(db: Db, orgId: string, role: string): Promise<{ org_id: string; role: string; org_name: string }> {
  let org_name = ''
  try {
    const { data } = await db.from('organisations').select('name').eq('id', orgId).maybeSingle()
    org_name = String((data as { name?: string } | null)?.name ?? '').trim().slice(0, 120)
  } catch { /* the email falls back to a generic line */ }
  return { org_id: orgId, role, org_name }
}
