'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function LoginForm() {
  const router = useRouter()
  const supabase = createClient()
  const [isHub, setIsHub] = useState(false)

  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [showPw, setShowPw]     = useState(false)
  const [view, setView]         = useState<'signin' | 'forgot' | 'forgot-sent'>('signin')
  const [forgotEmail, setForgotEmail] = useState('')

  useEffect(() => {
    setIsHub(window.location.hostname === 'hub.inventahq.com')
  }, [])

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({ email, password })
      if (authErr) { setError('Incorrect email or password. Please try again.'); setPassword(''); setLoading(false); return }

      const { data: membership } = await supabase
        .from('org_members')
        .select('org_id, role')
        .eq('user_id', authData.user.id)
        .single()

      const m = membership as { org_id: string; role: string } | null

      if (!m) {
        await supabase.auth.signOut()
        setError('Your account is not linked to any organisation. Contact your administrator.')
        setLoading(false)
        return
      }

      if (isHub && m.role !== 'admin') {
        await supabase.auth.signOut()
        setError('Hub access is for administrators only. Please use app.inventahq.com instead.')
        setLoading(false)
        return
      }

      router.refresh()
      router.push(isHub ? '/admin' : '/')
    } catch { setError('Something went wrong. Please try again.'); setLoading(false) }
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
    <>
      <style>{`
        .login-page { display: flex; height: 100vh; font-family: var(--font-ui); background: var(--slate); }
        .left-panel {
          flex: 1; background: var(--slate); display: flex; flex-direction: column;
          justify-content: space-between; padding: 48px 93px; overflow: hidden; position: relative;
        }
        .left-panel::before {
          content: ''; position: absolute; inset: 0;
          background-image: linear-gradient(rgba(13,148,136,0.18) 1px, transparent 1px), linear-gradient(90deg, rgba(13,148,136,0.18) 1px, transparent 1px);
          background-size: 48px 48px;
          mask-image: radial-gradient(ellipse 80% 80% at 30% 50%, black 30%, transparent 80%);
          -webkit-mask-image: radial-gradient(ellipse 80% 80% at 30% 50%, black 30%, transparent 80%);
        }
        .left-panel::after {
          content: ''; position: absolute; width: 600px; height: 600px; border-radius: 50%;
          background: radial-gradient(circle, rgba(13,148,136,0.18) 0%, transparent 65%);
          top: -100px; left: -200px; pointer-events: none;
        }
        .left-top { position: relative; z-index: 2; }
        .left-body { position: relative; z-index: 2; flex: 1; display: flex; flex-direction: column; justify-content: center; padding: 0; }
        .left-bottom { position: relative; z-index: 2; font-size: 12px; color: rgba(255,255,255,0.25); }
        .tagline-eyebrow { font-size: 11px; font-weight: 600; letter-spacing: 0.14em; color: var(--teal-light); margin-bottom: 16px; opacity: 0.7; text-transform: uppercase; }
        .tagline { font-family: var(--font-display); font-size: 61px; font-weight: 800; line-height: 1.08; letter-spacing: -0.03em; color: white; max-width: 702px; }
        .tagline em { font-style: normal; color: var(--teal-light); }
        .tagline-sub { font-size: 15px; color: rgba(255,255,255,0.45); margin-top: 20px; line-height: 1.6; max-width: 460px; }
        .stat-row { display: flex; gap: 36px; margin-top: 40px; }
        .stat { display: flex; flex-direction: column; gap: 4px; }
        .stat-val { font-family: var(--font-display); font-size: 22px; font-weight: 800; letter-spacing: -0.03em; color: white; }
        .stat-label { font-size: 11.5px; color: rgba(255,255,255,0.35); font-weight: 500; }
        .stat-divider { width: 1px; background: rgba(255,255,255,0.1); align-self: stretch; margin: 4px 0; }
        .right-panel {
          width: 597px; flex-shrink: 0; background: var(--gray-50);
          display: flex; align-items: center; justify-content: center;
          padding: 40px 20px; position: relative;
        }
        .right-panel::before {
          content: ''; position: absolute; top: 0; left: 0; right: 0; height: 4px;
          background: linear-gradient(90deg, var(--teal) 0%, var(--teal-light) 100%);
        }
        .form-card { width: 100%; max-width: 380px; }
        .form-welcome { font-family: var(--font-display); font-size: 24px; font-weight: 800; letter-spacing: -0.025em; color: var(--slate); margin-bottom: 6px; }
        .form-sub { font-size: 13.5px; color: var(--gray-400); margin-bottom: 32px; }
        .field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 18px; }
        .field label { font-size: 12px; font-weight: 600; color: var(--slate); }
        .field input { height: 47px; padding: 0 14px; border: 1.5px solid var(--gray-200); border-radius: 13px; background: white; font-family: var(--font-ui); font-size: 14px; color: var(--gray-900); outline: none; width: 100%; transition: border-color 150ms, box-shadow 150ms; }
        .field input:focus { border-color: var(--teal); box-shadow: 0 0 0 3px rgba(13,148,136,0.12); }
        .pw-wrap { position: relative; }
        .pw-wrap input { padding-right: 44px; }
        .pw-toggle { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; color: var(--gray-400); display: flex; align-items: center; }
        .remforg { display: flex; align-items: center; justify-content: space-between; margin-bottom: 28px; }
        .remember { display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 13px; color: var(--gray-400); }
        .remember input { accent-color: var(--teal); }
        .forgot-link { font-size: 13px; color: var(--teal); background: none; border: none; cursor: pointer; font-weight: 500; }
        .btn-signin { width: 100%; height: 48px; background: var(--teal); color: white; border: none; border-radius: 13px; font-family: var(--font-display); font-size: 15px; font-weight: 700; cursor: pointer; box-shadow: 0 4px 14px rgba(13,148,136,0.28); transition: background 150ms; }
        .btn-signin:hover { background: var(--teal-hover); }
        .btn-signin:disabled { opacity: 0.7; cursor: not-allowed; }
        .error-box { background: #FEF2F2; border: 1.5px solid #FECACA; border-radius: 13px; padding: 12px 14px; font-size: 13px; color: #B91C1C; margin-bottom: 18px; }
        .back-btn { background: none; border: none; cursor: pointer; font-size: 13px; color: var(--gray-400); display: flex; align-items: center; gap: 6px; padding: 0; margin-bottom: 24px; }
        .sent-icon { width: 52px; height: 52px; border-radius: 50%; background: var(--teal-surface); border: 1.5px solid var(--teal-pale); display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; color: var(--teal); }
        .hub-badge { display: inline-flex; align-items: center; gap: 7px; background: rgba(13,148,136,0.08); border: 1px solid rgba(13,148,136,0.2); border-radius: 8px; padding: 6px 12px; margin-bottom: 20px; }
        .hub-badge-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--teal); }
        .hub-badge-text { font-size: 11px; font-weight: 700; color: var(--teal); letter-spacing: 0.08em; text-transform: uppercase; }
        .hub-badge-sub { font-size: 11px; color: var(--gray-400); }
        @media (max-width: 900px) { .left-panel { display: none; } .right-panel { width: 100%; } }
      `}</style>

      <div className="login-page">
        <div className="left-panel">
          <div className="left-top">
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
          <div className="left-body">
            <div className="tagline-eyebrow">No guessing. Just control.</div>
            <h1 className="tagline">Every unit.<br/>Every location.<br/><em>Always accounted for.</em></h1>
            <p className="tagline-sub">Real-time stock visibility across every warehouse, order, and transfer — so nothing slips through.</p>
            <div className="stat-row">
              <div className="stat"><div className="stat-val">100%</div><div className="stat-label">Stock visibility</div></div>
              <div className="stat-divider"/>
              <div className="stat"><div className="stat-val">Live</div><div className="stat-label">Order tracking</div></div>
              <div className="stat-divider"/>
              <div className="stat"><div className="stat-val">Zero</div><div className="stat-label">Blind spots</div></div>
            </div>
          </div>
          <div className="left-bottom">© 2026 inventaHQ. All rights reserved.</div>
        </div>

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
                {error && <div className="error-box">{error}</div>}
                <div className="field">
                  <label>Email address</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" required autoComplete="email"/>
                </div>
                <div className="field">
                  <label>Password</label>
                  <div className="pw-wrap">
                    <input type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required autoComplete="current-password"/>
                    <button type="button" className="pw-toggle" onClick={() => setShowPw(!showPw)}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    </button>
                  </div>
                </div>
                <div className="remforg">
                  <label className="remember"><input type="checkbox"/> Remember me</label>
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
