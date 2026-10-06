// Hub activity log — who enabled/edited/created what on an organisation. Server-only.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function logHub(db: any, e: { orgId: string | null; actorId: string; actorEmail: string | null; action: string; summary: string; details?: unknown }) {
  try {
    await db.from('hub_activity_log').insert({
      org_id: e.orgId, actor_id: e.actorId, actor_email: e.actorEmail,
      action: e.action, summary: e.summary, details: e.details ?? null,
    })
  } catch { /* logging must never block the change itself */ }
}
