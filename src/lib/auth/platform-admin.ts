// src/lib/auth/platform-admin.ts
// "Platform admin" = an accepted admin of the internal inventaHQ organisation.
// This is NOT the same as being an admin of a customer organisation.
import { FIXED_ROLES } from '@/lib/permissions'

export const PLATFORM_ORG_ID = process.env.PLATFORM_ORG_ID || '00000000-0000-0000-0000-000000000001'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v)
export const isEmail = (v: unknown): v is string => typeof v === 'string' && v.length <= 254 && EMAIL_RE.test(v)
export const isFixedRole = (v: unknown): v is string => typeof v === 'string' && (FIXED_ROLES as string[]).includes(v)

/** Works with either the user client or the admin client. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function isPlatformAdmin(db: any, userId: string): Promise<boolean> {
  const { data } = await db
    .from('org_members')
    .select('id')
    .eq('user_id', userId)
    .eq('org_id', PLATFORM_ORG_ID)
    .eq('role', 'admin')
    .eq('invite_status', 'accepted')
    .limit(1)
    .maybeSingle()
  return !!data
}
