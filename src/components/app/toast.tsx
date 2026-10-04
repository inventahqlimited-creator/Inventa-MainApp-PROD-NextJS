'use client'
// src/components/app/toast.tsx
// One toast for the whole app (same look as the Settings toast).
//   toast.success('Product created')      toast.error('Could not save')
//   toast.later('success', 'Order created')  — queue a toast, then navigate: it shows on the next page.
// <ToastProvider /> sits once in the app layout and draws them.
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'

type Kind = 'success' | 'error'
type Item = { id: number; kind: Kind; msg: string; href?: string | null; hrefLabel?: string }
type Opts = { href?: string | null; hrefLabel?: string }

const KEY = 'inventa_toast_queue'
const listeners = new Set<(t: Item) => void>()
let nextId = 1

function emit(kind: Kind, msg: string, o: Opts = {}) {
  const item: Item = { id: nextId++, kind, msg, href: o.href ?? null, hrefLabel: o.hrefLabel }
  listeners.forEach(l => l(item))
}

export const toast = {
  success: (msg: string, o?: Opts) => emit('success', msg, o),
  error: (msg: string, o?: Opts) => emit('error', msg, o),
  /** Show a toast on the next page: call this just before router.push(...). */
  later(kind: Kind, msg: string) {
    try {
      const q = JSON.parse(sessionStorage.getItem(KEY) ?? '[]') as { kind: Kind; msg: string }[]
      q.push({ kind, msg })
      sessionStorage.setItem(KEY, JSON.stringify(q.slice(-3)))
    } catch { /* storage blocked: skip */ }
  },
}

export default function ToastProvider() {
  const [items, setItems] = useState<Item[]>([])
  const pathname = usePathname()

  useEffect(() => {
    const on = (t: Item) => {
      setItems(cur => [...cur.slice(-3), t])
      window.setTimeout(() => setItems(cur => cur.filter(x => x.id !== t.id)), t.kind === 'error' ? 6000 : 3500)
    }
    listeners.add(on)
    return () => { listeners.delete(on) }
  }, [])

  // toasts queued just before a page change
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(KEY)
      if (!raw) return
      sessionStorage.removeItem(KEY)
      for (const q of JSON.parse(raw) as { kind: Kind; msg: string }[]) emit(q.kind, q.msg)
    } catch { /* ignore */ }
  }, [pathname])

  if (items.length === 0) return null
  return (
    <div className="toast-container" role="status" aria-live="polite">
      {items.map(t => (
        <div key={t.id} className={`toast toast-${t.kind}`}>
          <div className="toast-icon">
            {t.kind === 'success'
              ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
              : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>}
          </div>
          <div className="toast-body">
            <div className="toast-title">{t.msg}</div>
            {t.href && <a href={t.href} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, fontWeight: 600, color: 'inherit', textDecoration: 'underline' }}>{t.hrefLabel ?? 'Open'}</a>}
          </div>
          <button className="toast-close" onClick={() => setItems(cur => cur.filter(x => x.id !== t.id))} aria-label="Dismiss">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
      ))}
    </div>
  )
}
