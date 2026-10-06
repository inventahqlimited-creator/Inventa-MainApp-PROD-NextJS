// src/app/api/org/security/route.ts
// Saves the organisation's password policy. Needs the "manage security settings" permission.
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { requirePerm } from '@/lib/auth/access'
import { normalizePolicy } from '@/lib/auth/password-policy'
import { clientIp } from '@/lib/rate-limit'
import {
  normalizeSecurity, forgetSecurity, parseIpRule, isIpAllowed, MAX_IP_RULES, SESSION_TIMEOUT_OPTIONS,
} from '@/lib/auth/security-settings'

async function getAuth() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const adminClient = createAdminClient()
  const { data: m } = await adminClient.from('org_members').select('org_id').eq('user_id', user.id).eq('invite_status', 'accepted').single()
  return m ? { orgId: m.org_id as string, adminClient } : null
}

export async function PATCH(req: Request) {
  const permGate = await requirePerm('manage_security')
  if ('res' in permGate) return permGate.res
  const auth = await getAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'No valid fields' }, { status: 400 })

  // Security settings: audit log on/off, session timeout, IP allow-list
  if ('security_settings' in body) {
    const inc = ((body as { security_settings: unknown }).security_settings ?? {}) as Record<string, unknown>
    const { data: cur } = await auth.adminClient.from('organisations').select('security_settings').eq('id', auth.orgId).single()
    const next = normalizeSecurity((cur as { security_settings?: unknown } | null)?.security_settings)

    if ('audit_log_enabled' in inc) {
      if (typeof inc.audit_log_enabled !== 'boolean') return NextResponse.json({ error: 'Invalid value' }, { status: 400 })
      next.audit_log_enabled = inc.audit_log_enabled
    }
    if ('session_timeout_minutes' in inc) {
      if (!(SESSION_TIMEOUT_OPTIONS as readonly number[]).includes(Number(inc.session_timeout_minutes))) return NextResponse.json({ error: 'Invalid session timeout' }, { status: 400 })
      next.session_timeout_minutes = Number(inc.session_timeout_minutes)
    }
    if ('ip_rules' in inc) {
      if (!Array.isArray(inc.ip_rules) || inc.ip_rules.length > MAX_IP_RULES) return NextResponse.json({ error: `At most ${MAX_IP_RULES} IP rules` }, { status: 400 })
      const old = new Map(next.ip_rules.map(r => [r.value, r.added_at]))
      const rules: typeof next.ip_rules = []
      for (const x of inc.ip_rules) {
        const o = (x ?? {}) as Record<string, unknown>
        const value = typeof o.value === 'string' ? parseIpRule(o.value) : null
        if (!value) return NextResponse.json({ error: `"${String(o.value ?? '').slice(0, 64)}" is not a valid IP address or range (e.g. 203.0.113.5 or 203.0.113.0/24)` }, { status: 400 })
        if (rules.some(r => r.value === value)) continue
        rules.push({ value, label: typeof o.label === 'string' ? o.label.trim().slice(0, 60) : '', added_at: old.get(value) ?? new Date().toISOString() })
      }
      // Never let someone lock themselves (and everyone else) out
      const ip = clientIp(req.headers)
      if (rules.length && !isIpAllowed({ ip_rules: rules }, ip)) {
        return NextResponse.json({ error: `Your current address (${ip}) isn't in the list, so saving would lock you out. Add it first.` }, { status: 400 })
      }
      next.ip_rules = rules
    }
    const { error } = await auth.adminClient.from('organisations').update({ security_settings: next }).eq('id', auth.orgId)
    if (error) return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
    forgetSecurity(auth.orgId)
    return NextResponse.json({ success: true, security_settings: next })
  }

  if (!('password_policy' in body)) return NextResponse.json({ error: 'No valid fields' }, { status: 400 })
  const { data: current } = await auth.adminClient.from('organisations').select('password_policy').eq('id', auth.orgId).single()
  const before = normalizePolicy((current as { password_policy?: unknown } | null)?.password_policy)
  const next = normalizePolicy((body as { password_policy: unknown }).password_policy)

  // The server decides when rotation started — never the browser.
  if (!next.rotation.enabled) next.rotation.enabled_at = before.rotation.enabled_at
  else next.rotation.enabled_at = before.rotation.enabled && before.rotation.enabled_at ? before.rotation.enabled_at : new Date().toISOString()

  const { error } = await auth.adminClient.from('organisations').update({ password_policy: next }).eq('id', auth.orgId)
  if (error) return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
  return NextResponse.json({ success: true, password_policy: next })
}
