'use client'

import { useEffect } from 'react'

const PING_MS = 15_000

/** Keeps a support session alive only while a tab is open. Closing the tab ends it. */
export default function SupportGuard() {
  useEffect(() => {
    let stopped = false
    const exit = () => { stopped = true; window.location.replace('/auth/support-exit') }
    const ping = async () => {
      if (stopped) return
      try {
        const res = await fetch('/api/support/ping', { method: 'POST', credentials: 'same-origin', cache: 'no-store' })
        if (res.status === 401) exit()
      } catch { /* offline for a moment — the lease has plenty of slack */ }
    }
    ping()
    const t = setInterval(ping, PING_MS)
    const onHide = (e: PageTransitionEvent) => { if (!e.persisted) navigator.sendBeacon?.('/api/support/leaving') }
    const onShow = (e: PageTransitionEvent) => { if (e.persisted) ping() }
    window.addEventListener('pagehide', onHide)
    window.addEventListener('pageshow', onShow)
    return () => { clearInterval(t); window.removeEventListener('pagehide', onHide); window.removeEventListener('pageshow', onShow) }
  }, [])
  return null
}
