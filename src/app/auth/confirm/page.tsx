'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AuthShell } from '@/app/login/auth-shell'
import { createBrowserClient } from '@supabase/ssr'
import { browserSessionCookies } from '@/lib/supabase/client'

type Pending = { tokenHash: string; type: string; email: string; org: string }

// Email links that carry a one-time token (?token_hash=…&type=invite|recovery) are NOT used up when the page opens:
// the person has to press the button. Email security scanners (Microsoft Safe Links and the like) open every link
// in an email before the person does; if opening the page used the token, the person's own click would then fail.
export default function AuthConfirmPage() {
  const router = useRouter()
  const [pending, setPending] = useState<Pending | null>(null)
  const [orgName, setOrgName] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    const tokenHash = q.get('token_hash'); const type = q.get('type')
    if (tokenHash && type) {
      const email = (q.get('email') ?? '').trim().replace(/ /g, '+')
      const org = (q.get('org') ?? '').trim()
      setPending({ tokenHash, type, email, org })
      if (type === 'invite' && org && email) {
        fetch(`/auth/invite-info?org=${encodeURIComponent(org)}&email=${encodeURIComponent(email)}`)
          .then(r => r.json()).then(d => setOrgName(d?.org_name ?? null)).catch(() => {})
      }
    }
  }, [])

  async function onConfirm() {
    if (!pending) return
    setBusy(true)
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: browserSessionCookies }
    )
    const { error } = await supabase.auth.verifyOtp({ token_hash: pending.tokenHash, type: pending.type as 'recovery' | 'invite' | 'email' | 'magiclink' })
    if (error) { router.replace('/login?error=session_failed'); return }
    if (pending.type === 'invite') {
      const accept = () => fetch('/auth/accept', { method: 'POST' }).then(r => r.json()).catch(() => null) as Promise<{ accepted?: number } | null>
      const r = await accept()
      if ((r?.accepted ?? 0) === 0) await new Promise(res => setTimeout(res, 700)).then(accept)
      router.replace('/auth/update-password?invite=1')
      return
    }
    router.replace(pending.type === 'recovery' ? '/auth/update-password' : '/dashboard')
  }

  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: browserSessionCookies }
    )

    // An invite link has signed the person in: accept the invite, then let them choose a password
    const finishInvite = () => {
      const accept = () => fetch('/auth/accept', { method: 'POST' }).then(r => r.json()).catch(() => null) as Promise<{ accepted?: number } | null>
      // try twice: the sign-in cookie can take a moment to be readable by the server
      accept()
        .then(r => ((r?.accepted ?? 0) > 0 ? r : new Promise<typeof r>(res => setTimeout(() => accept().then(res), 700))))
        .then(() => router.replace('/auth/update-password?invite=1'))
    }

    const query = new URLSearchParams(window.location.search)

    // A one-time-token link waits for the button (see above)
    if (query.get('token_hash') && query.get('type')) return

    // Newer Supabase links arrive as ?code=… (PKCE) — exchange it for a session, then set the password
    const code = query.get('code')
    if (code) {
      supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
        router.replace(error ? '/login?error=session_failed' : '/auth/update-password')
      })
      return
    }

    const hash = window.location.hash.substring(1)
    const params = new URLSearchParams(hash)
    const accessToken = params.get('access_token')
    const refreshToken = params.get('refresh_token')
    const type = params.get('type')

    if (!accessToken || !refreshToken) {
      const errCode = params.get('error_code') ?? params.get('error')
      router.replace(`/login?error=${errCode ?? 'invalid_link'}`)
      return
    }

    supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(({ error }) => {
        if (error) {
          router.replace('/login?error=session_failed')
          return
        }
        if (type === 'recovery') {
          router.replace('/auth/update-password')
        } else if (type === 'invite') {
          finishInvite()
        } else {
          router.replace('/dashboard')
        }
      })
  }, [router])

  if (pending) {
    const invite = pending.type === 'invite'
    const box = { margin: '22px 0 18px', padding: '14px 16px', border: '1px solid #E5ECEC', borderRadius: 12, background: '#F8FAFA', fontSize: 13.5, color: 'var(--slate)', wordBreak: 'break-all' as const }
    const small = { color: '#8A9A9D', fontSize: 11.5, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase' as const, marginBottom: 4 }
    return (
      <AuthShell>
        <div className="form-welcome">{invite ? 'You\u2019re invited' : 'Reset your password'}</div>
        <div className="form-sub">
          {invite
            ? (orgName ? <><strong style={{ color: 'var(--slate)' }}>{orgName}</strong> has invited you to their inventaHQ workspace.</> : 'You\u2019ve been invited to an inventaHQ workspace.')
            : 'Continue to choose a new password for your inventaHQ account.'}
        </div>
        {pending.email && <div style={box}><div style={small}>{invite ? 'Signing in as' : 'Account'}</div>{pending.email}</div>}
        {!pending.email && <div style={{ height: 22 }} />}
        <button type="button" className="btn-signin" disabled={busy} onClick={onConfirm}>
          {busy ? 'Please wait…' : invite ? 'Accept invitation' : 'Continue'}
        </button>
        <div style={{ fontSize: 12.5, color: '#8A9A9D', marginTop: 16, lineHeight: 1.5 }}>
          {invite ? 'Next, you\u2019ll choose a password for your account.' : 'Didn\u2019t ask for this? You can close this page \u2014 nothing changes.'}
        </div>
      </AuthShell>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--slate)' }}>
      <p className="text-slate-400 text-sm">Setting up your account…</p>
    </div>
  )
}
