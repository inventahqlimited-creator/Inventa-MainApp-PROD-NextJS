'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function LoginForm() {
  const router = useRouter()
  const supabase = createClient()

  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [showPw, setShowPw]     = useState(false)
  const [view, setView]         = useState<'signin' | 'forgot' | 'forgot-sent'>('signin')
  const [forgotEmail, setForgotEmail] = useState('')

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
        email, password,
      })

      if (authErr) {
        setError('Incorrect email or password. Please try again.')
        setPassword('')
        setLoading(false)
        return
      }

      // Verify org membership
      const { data: membership } = await supabase
        .from('org_members')
        .select('org_id, role')
        .eq('user_id', authData.user.id)
        .single()

      if (!membership) {
        await supabase.auth.signOut()
        setError('Your account is not linked to any organisation. Contact your administrator.')
        setLoading(false)
        return
      }

      // Middleware will handle the rest — just refresh to trigger it
      router.refresh()
      router.push('/')
    } catch {
      setError('Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const { error: resetErr } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
      redirectTo: `${window.location.origin}/auth/callback`,
    })
    setLoading(false)
    if (resetErr) { setError(resetErr.message); return }
    setView('forgot-sent')
  }

  return (
    <div style={{
      display: 'flex', height: '100vh', fontFamily: 'var(--font-ui)',
    }}>
      {/* Left panel */}
      <div style={{
        flex: 1, background: 'var(--slate)', display: 'flex', flexDirection: 'column',
        justifyContent: 'space-between', padding: '48px 93px', overflow: 'hidden',
        position: 'relative',
      }}>
        <div style={{ position: 'relative', zIndex: 2 }}>
          <svg style={{ display: 'block', width: '396px' }} viewBox="0 0 480 76" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <clipPath id="ll"><polygon points="0,0 185,0 165,76 0,76"/></clipPath>
              <clipPath id="lr"><polygon points="185,0 480,0 480,76 165,76"/></clipPath>
              <mask id="lm"><rect width="480" height="76" fill="white"/><rect x="3" y="0" width="20" height="17" fill="black"/></mask>
            </defs>
            <text x="3" y="60" fontFamily="'Plus Jakarta Sans',sans-serif" fontSize="54" fontWeight="800" letterSpacing="-2" fill="rgba(255,255,255,0.28)" clipPath="url(#ll)" mask="url(#lm)">inventaHQ</text>
            <text x="3" y="60" fontFamily="'Plus Jakarta Sans',sans-serif" fontSize="54" fontWeight="800" letterSpacing="-2" fill="#5EEAD4" clipPath="url(#lr)" mask="url(#lm)" paintOrder="stroke fill" stroke="#5EEAD4" strokeWidth="1.1" strokeLinejoin="round">inventaHQ</text>
          </svg>
        </div>

        <div style={{ position: 'relative', zIndex: 2 }}>
          <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.14em', color: 'var(--teal-light)', marginBottom: '16px', opacity: 0.7, textTransform: 'uppercase' }}>
            Inventory Intelligence Platform
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '61px', fontWeight: 800, lineHeight: 1.08, letterSpacing: '-0.03em', color: 'white', maxWidth: '702px' }}>
            Every unit.<br/>Every location.<br/><em style={{ fontStyle: 'normal', color: 'var(--teal-light)' }}>Always accounted for.</em>
          </h1>
          <p style={{ fontSize: '15px', color: 'rgba(255,255,255,0.45)', marginTop: '20px', lineHeight: 1.6, maxWidth: '460px' }}>
            Real-time stock visibility across every warehouse, order, and transfer — so nothing slips through.
          </p>
        </div>

        <div style={{ position: 'relative', zIndex: 2, fontSize: '12px', color: 'rgba(255,255,255,0.25)' }}>
          © 2026 inventaHQ. All rights reserved.
        </div>
      </div>

      {/* Right panel */}
      <div style={{
        width: '597px', flexShrink: 0, background: 'var(--gray-50)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '40px 20px', position: 'relative',
      }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: 'linear-gradient(90deg, var(--teal) 0%, var(--teal-light) 100%)' }} />

        <div style={{ width: '100%', maxWidth: '380px' }}>
          {view === 'signin' && (
            <form onSubmit={handleSignIn}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '24px', fontWeight: 800, letterSpacing: '-0.025em', color: 'var(--slate)', marginBottom: '6px' }}>
                Welcome back
              </h2>
              <p style={{ fontSize: '13.5px', color: 'var(--gray-400)', marginBottom: '32px' }}>
                Sign in to your inventaHQ workspace.
              </p>

              {error && (
                <div style={{ background: '#FEF2F2', border: '1.5px solid #FECACA', borderRadius: '13px', padding: '12px 14px', fontSize: '13px', color: '#B91C1C', marginBottom: '18px' }}>
                  {error}
                </div>
              )}

              <div style={{ marginBottom: '18px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--slate)', marginBottom: '6px' }}>Email address</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" required
                  style={{ width: '100%', height: '47px', padding: '0 14px', border: '1.5px solid var(--gray-200)', borderRadius: '13px', background: 'white', fontFamily: 'var(--font-ui)', fontSize: '14px', color: 'var(--gray-900)', outline: 'none' }} />
              </div>

              <div style={{ marginBottom: '18px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--slate)', marginBottom: '6px' }}>Password</label>
                <div style={{ position: 'relative' }}>
                  <input type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required
                    style={{ width: '100%', height: '47px', padding: '0 44px 0 14px', border: '1.5px solid var(--gray-200)', borderRadius: '13px', background: 'white', fontFamily: 'var(--font-ui)', fontSize: '14px', color: 'var(--gray-900)', outline: 'none' }} />
                  <button type="button" onClick={() => setShowPw(!showPw)}
                    style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray-400)', display: 'flex', alignItems: 'center' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: 'var(--gray-400)' }}>
                  <input type="checkbox" style={{ accentColor: 'var(--teal)' }} /> Remember me
                </label>
                <button type="button" onClick={() => { setView('forgot'); setError('') }}
                  style={{ fontSize: '13px', color: 'var(--teal)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500 }}>
                  Forgot password?
                </button>
              </div>

              <button type="submit" disabled={loading}
                style={{ width: '100%', height: '48px', background: 'var(--teal)', color: 'white', border: 'none', borderRadius: '13px', fontFamily: 'var(--font-display)', fontSize: '15px', fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1, boxShadow: '0 4px 14px rgba(13,148,136,0.28)' }}>
                {loading ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
          )}

          {view === 'forgot' && (
            <form onSubmit={handleForgot}>
              <button type="button" onClick={() => { setView('signin'); setError('') }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', color: 'var(--gray-400)', display: 'flex', alignItems: 'center', gap: '6px', padding: 0, marginBottom: '24px' }}>
                ← Back to sign in
              </button>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: 800, color: 'var(--slate)', marginBottom: '8px' }}>Reset your password</h2>
              <p style={{ fontSize: '13.5px', color: 'var(--gray-400)', marginBottom: '28px' }}>Enter your email and we&apos;ll send a reset link.</p>
              <div style={{ marginBottom: '18px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--slate)', marginBottom: '6px' }}>Email address</label>
                <input type="email" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} placeholder="you@company.com" required
                  style={{ width: '100%', height: '47px', padding: '0 14px', border: '1.5px solid var(--gray-200)', borderRadius: '13px', background: 'white', fontFamily: 'var(--font-ui)', fontSize: '14px', outline: 'none' }} />
              </div>
              <button type="submit" disabled={loading}
                style={{ width: '100%', height: '48px', background: 'var(--teal)', color: 'white', border: 'none', borderRadius: '13px', fontFamily: 'var(--font-display)', fontSize: '15px', fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}>
                {loading ? 'Sending…' : 'Send reset link'}
              </button>
            </form>
          )}

          {view === 'forgot-sent' && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: '52px', height: '52px', borderRadius: '50%', background: 'var(--teal-surface)', border: '1.5px solid var(--teal-pale)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', color: 'var(--teal)' }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.18h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.82a16 16 0 0 0 6.29 6.29l.98-.98a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
              </div>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '17px', fontWeight: 700, color: 'var(--slate)', marginBottom: '8px' }}>Check your inbox</h2>
              <p style={{ fontSize: '13.5px', color: 'var(--gray-400)', lineHeight: 1.6 }}>Reset link sent to <strong style={{ color: 'var(--slate)' }}>{forgotEmail}</strong>. It expires in 15 minutes.</p>
              <button onClick={() => setView('signin')}
                style={{ marginTop: '28px', width: '100%', height: '48px', background: 'var(--teal)', color: 'white', border: 'none', borderRadius: '13px', fontFamily: 'var(--font-display)', fontSize: '15px', fontWeight: 700, cursor: 'pointer' }}>
                Back to sign in
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
