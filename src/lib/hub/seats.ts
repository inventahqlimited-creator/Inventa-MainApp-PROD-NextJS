// Seat limits: how many users an organisation's plan allows (accepted + pending invites count).
// Tolerant of the column not existing yet (before the Hub SQL has been run) — then there is no limit.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function checkSeatLimit(db: any, orgId: string): Promise<{ ok: true } | { ok: false; limit: number; used: number; message: string }> {
  const { data: org, error } = await db.from('organisations').select('user_limit').eq('id', orgId).maybeSingle()
  const limit = Number((org as { user_limit?: number } | null)?.user_limit)
  if (error || !Number.isFinite(limit) || limit < 1) return { ok: true }
  const { count } = await db.from('org_members').select('id', { count: 'exact', head: true })
    .eq('org_id', orgId).in('invite_status', ['accepted', 'pending'])
  const used = count ?? 0
  if (used >= limit) return { ok: false, limit, used, message: `Your plan only allows ${limit} user${limit === 1 ? '' : 's'}. Please contact sales to add more.` }
  return { ok: true }
}
