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
      const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({ email, password })
      if (authErr) { setError('Incorrect email or password. Please try again.'); setPassword(''); setLoading(false); return }
      const { data: membership } = await supabase.from('org_members').select('org_id, role').eq('user_id', authData.user.id).single()
      if (!membership) { await supabase.auth.signOut(); setError('Your account is not linked to any organisation. Contact your administrator.'); setLoading(false); return }
      router.refresh(); router.push('/')
    } catch { setError('Something went wrong. Please try again.'); setLoading(false) }
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const { error: resetErr } = await supabase.auth.resetPasswordForEmail(forgotEmail, { redirectTo: `${window.location.origin}/auth/callback` })
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
        .left-body { position: relative; z-index: 2; flex: 1; display: flex; flex-direction: column; justify-content: flex-end; padding: 0 0 48px; }
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
          content: ''; position: absolute; top: 0; left: 0; right: 0;
