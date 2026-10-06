'use client'
// The bell in the top bar: live alerts (low stock, overdue sales / purchase orders) from /api/org/notifications.
// "Read" is remembered per person in this browser only.
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

type Alert = { id: string; kind: string; level: 'warning' | 'critical'; title: string; body: string; href: string }
const KEY = 'inv_notif_read'

const localDate = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const loadRead = (): Set<string> => { try { return new Set(JSON.parse(localStorage.getItem(KEY) ?? '[]')) } catch { return new Set() } }

export default function NotificationBell() {
  const router = useRouter()
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [read, setRead] = useState<Set<string>>(new Set())
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/org/notifications?today=${localDate()}`, { cache: 'no-store' })
      if (!res.ok) return
      const d = await res.json()
      const list: Alert[] = d.alerts ?? []
      setAlerts(list)
      // forget read marks for alerts that no longer exist
      const keep = new Set(list.map(a => a.id)); const r = loadRead()
      const pruned = new Set([...r].filter(id => keep.has(id)))
      setRead(pruned)
      try { localStorage.setItem(KEY, JSON.stringify([...pruned])) } catch { /* private mode */ }
    } catch { /* offline */ }
  }, [])

  useEffect(() => {
    setRead(loadRead())
    refresh()
    const t = setInterval(refresh, 5 * 60_000)
    return () => clearInterval(t)
  }, [refresh])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  function persist(next: Set<string>) { setRead(next); try { localStorage.setItem(KEY, JSON.stringify([...next])) } catch { /* private mode */ } }
  const unread = alerts.filter(a => !read.has(a.id)).length
  const critical = alerts.some(a => a.level === 'critical' && !read.has(a.id))

  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button className="icon-btn" title="Notifications" style={{ position: 'relative' }} onClick={() => { setOpen(o => !o); if (!open) refresh() }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
        {unread > 0 && (
          <span style={{ position: 'absolute', top: 3, right: 3, minWidth: 16, height: 16, background: critical ? 'var(--danger)' : '#F59E0B', color: '#fff', fontSize: 9.5, fontWeight: 700, borderRadius: 20, border: '2px solid white', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px', lineHeight: 1 }}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div style={{ position: 'fixed', top: 62, right: 16, width: 380, maxWidth: 'calc(100vw - 32px)', background: 'var(--white)', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 16, boxShadow: '0 12px 40px rgba(0,0,0,0.15)', zIndex: 800, overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid var(--gray-100)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--slate)', fontFamily: 'var(--font-display)' }}>Notifications</div>
            <button onClick={() => persist(new Set(alerts.map(a => a.id)))} style={{ fontSize: 12, color: 'var(--teal)', fontWeight: 600, border: 'none', background: 'transparent', cursor: 'pointer' }}>Mark all read</button>
          </div>
          <div style={{ maxHeight: 400, overflowY: 'auto' }}>
            {alerts.length === 0 && <div style={{ padding: 32, textAlign: 'center', fontSize: 13, color: 'var(--gray-400)' }}>No notifications</div>}
            {alerts.map(a => {
              const isRead = read.has(a.id)
              const crit = a.level === 'critical'
              return (
                <div
                  key={a.id}
                  onClick={() => { persist(new Set([...read, a.id])); setOpen(false); router.push(a.href) }}
                  style={{ display: 'flex', gap: 12, padding: '12px 16px', cursor: 'pointer', background: isRead ? 'transparent' : 'rgba(239,246,255,0.5)', borderBottom: '1px solid var(--gray-100)' }}
                >
                  <div style={{ width: 30, height: 30, borderRadius: 8, background: crit ? '#FEE2E2' : '#FEF3C7', color: crit ? 'var(--danger)' : '#B45309', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: isRead ? 500 : 700, color: 'var(--slate)', fontFamily: 'var(--font-display)' }}>
                      {a.title}{crit && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, background: '#FEE2E2', color: 'var(--danger)', padding: '2px 6px', borderRadius: 20 }}>Critical</span>}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2, lineHeight: 1.4 }}>{a.body}</div>
                  </div>
                  {!isRead && <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--teal)', flexShrink: 0, marginTop: 4 }} />}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
