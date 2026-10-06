'use client'
// Signs the person out after the organisation's session timeout with no activity (mouse, keys, touch, scroll).
// Activity is shared between tabs, so working in one tab keeps the others alive.
import { useEffect } from 'react'

const KEY = 'inv_last_active'

export default function IdleGuard({ minutes }: { minutes: number }) {
  useEffect(() => {
    const limit = minutes * 60_000
    const read = () => { try { return Number(localStorage.getItem(KEY)) || Date.now() } catch { return Date.now() } }
    const touch = () => { try { localStorage.setItem(KEY, String(Date.now())) } catch { /* private mode */ } }
    let last = 0
    const onActivity = () => { const n = Date.now(); if (n - last > 5_000) { last = n; touch() } }
    touch()
    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'] as const
    events.forEach(e => window.addEventListener(e, onActivity, { passive: true }))
    const timer = setInterval(() => {
      if (Date.now() - read() > limit) window.location.href = '/auth/timeout'
    }, 15_000)
    return () => { events.forEach(e => window.removeEventListener(e, onActivity)); clearInterval(timer) }
  }, [minutes])
  return null
}
