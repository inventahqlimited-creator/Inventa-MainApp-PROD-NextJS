'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'

export default function UpdatePasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  async function handleSubmit() {
    setError(null)
    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (error) {
      setError(error.message)
    } else {
      router.replace('/dashboard')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--slate)' }}>
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-white" style={{ fontFamily: 'var(--font-display)' }}>
            Set your password
          </h1>
          <p className="mt-1 text-sm text-slate-400">Choose a password to secure your account.</p>
        </div>

        <div className="mb-4">
          <label className="block text-xs text-slate-400 mb-1.5">New password</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            className="w-full rounded-lg px-3 py-2.5 text-sm text-white border border-white/10 bg-white/5 focus:outline-none focus:border-teal-500 placeholder:text-slate-600"
          />
        </div>
        <div className="mb-5">
          <label className="block text-xs text-slate-400 mb-1.5">Confirm password</label>
          <input
            type="password"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            placeholder="Re-enter password"
            className="w-full rounded-lg px-3 py-2.5 text-sm text-white border border-white/10 bg-white/5 focus:outline-none focus:border-teal-500 placeholder:text-slate-600"
          />
        </div>

        {error && (
          <div className="mb-4 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {error}
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={loading || !password || !confirm}
          className="w-full py-2.5 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-40 hover:opacity-90"
          style={{ background: 'var(--teal)' }}
        >
          {loading ? 'Saving…' : 'Set password'}
        </button>
      </div>
    </div>
  )
}
