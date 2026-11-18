'use client'

import { AUTH_CSS, AuthLeftPanel } from './auth-shell'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { applyRememberChoice, getRememberedEmail } from '@/lib/auth/remember'

const LINK_ERRORS: Record<string, string> = {
  invalid_link: 'That link is invalid or has already been used. Please request a new one.',
  session_failed: 'That link has expired or was already used. Please request a new one.',
  auth_callback_failed: 'We could not sign you in from that link. Please request a new one.',
  session_timeout: 'You were signed out because of inactivity. Please sign in again.',
  otp_expired: 'That link has expired. Please request a new one.',
  access_denied: 'That link has expired or was already used. Please request a new one.',
}

export default function LoginForm() {
  const router = useRouter()
  const supabase = createClient()
  const [isHub, setIsHub] = useState(false)

  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [notice, setNotice]     = useState('')
  const [showPw, setShowPw]     = useState(false)
  const [remember, setRemember] = useState(true)
  const [view, setView]         = useState<'signin' | 'forgot' | 'forgot-sent'>('signin')
  const [forgotEmail, setForgotEmail] = useState('')

  useEffect(() => {
    setIsHub(window.location.hostname === 'hub.inventahq.com')

    // Prefill the email from the last "Remember me" sign-in
    const saved = getRememberedEmail()
    if (saved) setEmail(saved)

    // A password-reset / invite link that landed on the login page (for example when the email link was
    // sent to the site root): hand it to the confirm page, which knows how to finish it.
    const { search, hash } = window.location
    const q = new URLSearchParams(search)
    const h = new URLSearchParams(hash.replace(/^#/, ''))
    if (q.get('code') || q.get('token_hash') || h.get('access_token')) {
      router.replace(`/auth/confirm${search}${hash}`)
      return
    }

    if (q.get('welcome') === '1') setNotice('Your password is set. Sign in with your email and new password.')

    // Show why a link failed instead of silently showing the sign-in form
    const code = q.get('error') ?? h.get('error_code') ?? h.get('error')
    if (code) setError(LINK_ERRORS[code] ?? 'Something went wrong with that link. Please try again.')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({ email, password })
      if (authErr) { setError('Incorrect email or password. Please try again.'); setPassword(''); setLoading(false); return }
      applyRememberChoice(remember, email)

      const { data: memberships, error: memberErr } = await supabase
        .from('org_members')
        .select('org_id, role, invite_status')
        .eq('user_id', authData.user.id)

      const list = (memberships ?? []) as { org_id: string; role: string; invite_status: string }[]

      if (isHub) {
        const hubAccess = list.find(m => m.role === 'admin' && m.invite_status === 'accepted')
        if (!hubAccess) {
          await supabase.auth.signOut()
          setError('Hub access is for administrators only. If you are an org user, please sign in at app.inventahq.com.')
          setLoading(false)
          return
        }
        router.refresh()
        router.push('/admin')
      } else {
        const appAccess = list.find(m => m.invite_status === 'accepted')
        if (!appAccess) {
          // Signed in through an invite but not yet marked accepted (the invite row has no user attached yet): accept it now
          const acc = await fetch('/auth/accept', { method: 'POST' }).then(r => r.json()).catch(() => null) as { accepted?: number } | null
          if (acc && (acc.accepted ?? 0) > 0) { router.refresh(); router.push('/'); return }
          await supabase.auth.signOut()
          const pending = list.find(m => m.invite_status === 'pending')
          if (pending) {
            setError('Your invite is still pending. Please check your email and accept the invitation first.')
          } else {
            setError('Your account is not linked to any organisation. Contact your administrator.')
          }
          setLoading(false)
          return
        }
        router.refresh()
        router.push('/')
      }
    } catch { setError('Something went wrong. Please try again.'); setLoading(false) }
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      // Sent from the server so the link works on any device or browser
      const res = await fetch('/auth/forgot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail }),
      })
      const json = await res.json().catch(() => ({}))
      setLoading(false)
      if (!res.ok) { setError(json.error ?? 'Could not send the reset link. Please try again.'); return }
      setView('forgot-sent')
    } catch {
      setLoading(false)
      setError('Could not send the reset link. Please check your connection and try again.')
    }
  }

  return (
    <>
      <style>{AUTH_CSS}</style>

      <div className="login-page">
        <AuthLeftPanel />

        <div className="right-panel">
          <div className="form-card">
            {view === 'signin' && (
              <form onSubmit={handleSignIn}>
                {isHub && (
                  <div className="hub-badge">
                    <div className="hub-badge-dot"/>
                    <span className="hub-badge-text">Hub</span>
                    <span className="hub-badge-sub">— Internal Admin Portal</span>
                  </div>
                )}
                <div className="form-welcome">Welcome back</div>
                <div className="form-sub">
                  {isHub
                    ? 'Sign in to inventaHQ Hub. Admin access only.'
                    : 'Sign in to your inventaHQ workspace.'
                  }
                </div>
                {notice && !error && <div className="notice-box">{notice}</div>}
                {error && <div className="error-box">{error}</div>}
                <div className="field">
                  <label>Email address</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" required autoComplete="username" name="email"/>
                </div>
                <div className="field">
                  <label>Password</label>
                  <div className="pw-wrap">
                    <input type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required autoComplete="current-password" name="password"/>
                    <button type="button" className="pw-toggle" onClick={() => setShowPw(!showPw)}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    </button>
                  </div>
                </div>
                <div className="remforg">
                  <label className="remember"><input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)}/> Remember me</label>
                  <button type="button" className="forgot-link" onClick={() => { setView('forgot'); setError('') }}>Forgot password?</button>
                </div>
                <button type="submit" className="btn-signin" disabled={loading}>
                  {loading ? 'Signing in…' : isHub ? 'Sign in to Hub' : 'Sign in'}
                </button>
              </form>
            )}

            {view === 'forgot' && (
              <form onSubmit={handleForgot}>
                <button type="button" className="back-btn" onClick={() => { setView('signin'); setError('') }}>← Back to sign in</button>
                <div className="form-welcome" style={{ fontSize: '20px' }}>Reset your password</div>
                <div className="form-sub" style={{ marginBottom: '28px' }}>Enter your email and we&apos;ll send a reset link.</div>
                {error && <div className="error-box">{error}</div>}
                <div className="field">
                  <label>Email address</label>
                  <input type="email" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} placeholder="you@company.com" required/>
                </div>
                <button type="submit" className="btn-signin" disabled={loading}>{loading ? 'Sending…' : 'Send reset link'}</button>
              </form>
            )}

            {view === 'forgot-sent' && (
              <div style={{ textAlign: 'center' }}>
                <div className="sent-icon">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.18h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.82a16 16 0 0 0 6.29 6.29l.98-.98a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                </div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '17px', fontWeight: 700, color: 'var(--slate)', marginBottom: '8px' }}>Check your inbox</div>
                <div style={{ fontSize: '13.5px', color: 'var(--gray-400)', lineHeight: 1.6 }}>Reset link sent to <strong style={{ color: 'var(--slate)' }}>{forgotEmail}</strong>. Expires in 15 minutes.</div>
                <button className="btn-signin" style={{ marginTop: '28px' }} onClick={() => setView('signin')}>Back to sign in</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
