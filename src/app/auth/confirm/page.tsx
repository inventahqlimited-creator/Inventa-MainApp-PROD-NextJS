'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'

export default function AuthConfirmPage() {
  const router = useRouter()

  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    const query = new URLSearchParams(window.location.search)

    // Link that carries a one-time token (works in any browser): verify it, then continue
    const tokenHash = query.get('token_hash')
    const otpType = query.get('type')
    if (tokenHash && otpType) {
      supabase.auth
        .verifyOtp({ token_hash: tokenHash, type: otpType as 'recovery' | 'invite' | 'email' | 'magiclink' })
        .then(({ error }) => {
          if (error) { router.replace('/login?error=session_failed'); return }
          router.replace(otpType === 'recovery' ? '/auth/update-password' : '/dashboard')
        })
      return
    }

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
        } else {
          router.replace('/dashboard')
        }
      })
  }, [router])

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--slate)' }}>
      <p className="text-slate-400 text-sm">Setting up your account…</p>
    </div>
  )
}
