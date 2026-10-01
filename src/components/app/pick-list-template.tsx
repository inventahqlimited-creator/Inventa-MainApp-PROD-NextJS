'use client'

// src/components/app/pick-list-template.tsx
// Settings → Sales → Sales Documents → Pick List. Tick what should appear on the printed pick list and watch the
// preview change. Product and Qty are always printed. Saved per organisation; every pick list print uses it.

import { useEffect, useMemo, useRef, useState } from 'react'
import { DEFAULT_PICK_LIST_CONFIG, PICK_LIST_OPTIONS, type PickListConfig } from '@/lib/pick-list/config'
import { renderPickListHtml, SAMPLE_PICK_LIST } from '@/lib/pick-list/render'
import type { PickListMode } from '@/lib/pick-list/types'

const PAGE_W = 794

export default function PickListTemplate({
  initial, onClose, onSaved,
}: {
  initial: PickListConfig
  onClose: () => void
  onSaved: (cfg: PickListConfig) => void
}) {
  const [cfg, setCfg] = useState<PickListConfig>(initial)
  const [mode, setMode] = useState<PickListMode>('single')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scale, setScale] = useState(0.7)
  const [frameH, setFrameH] = useState(1123)
  const pane = useRef<HTMLDivElement>(null)
  const frame = useRef<HTMLIFrameElement>(null)

  const dirty = useMemo(() => JSON.stringify(cfg) !== JSON.stringify(initial), [cfg, initial])

  const html = useMemo(
    () => renderPickListHtml(
      { orders: mode === 'single' ? [SAMPLE_PICK_LIST[1]] : SAMPLE_PICK_LIST, config: cfg, timezone: 'Pacific/Auckland' },
      { mode, preview: true, now: new Date('2026-10-02T09:52:00+13:00') },
    ),
    [cfg, mode],
  )

  // Fit the A4 preview to the space available
  useEffect(() => {
    const el = pane.current
    if (!el) return
    const fit = () => setScale(Math.min(1, Math.max(0.3, (el.clientWidth - 32) / PAGE_W)))
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  function measure() {
    const d = frame.current?.contentDocument
    if (d) setFrameH(Math.max(d.documentElement.scrollHeight, 400))
  }

  function toggle(group: keyof PickListConfig, key: string, value: boolean) {
    setCfg(c => ({ ...c, [group]: { ...c[group], [key]: value } }))
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/org/sales-settings', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pick_list_settings: cfg }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? 'Could not save the template')
        return
      }
      onSaved(cfg)
    } catch {
      setError('Network error — please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget && !saving) onClose() }}>
      <div className="modal-box" style={{ maxWidth: 1180, height: '90vh', maxHeight: '90vh' }}>
        <div className="modal-header">
          <div>
            <div className="modal-title">Pick List</div>
            <div className="modal-subtitle">Choose what appears on the printed pick list. Product and Qty are always shown.</div>
          </div>
          <button className="modal-close" onClick={onClose} disabled={saving} aria-label="Close">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
          {/* Options */}
          <div style={{ width: 300, flexShrink: 0, borderRight: '1px solid var(--gray-100)', overflowY: 'auto', padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 20 }}>
            {PICK_LIST_OPTIONS.map(g => (
              <div key={g.group}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--gray-400)', marginBottom: 8 }}>{g.title}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {g.items.map(it => {
                    const checked = it.always ? true : (cfg[g.group] as Record<string, boolean>)[it.key]
                    return (
                      <label key={it.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 8px', borderRadius: 8, cursor: it.always ? 'default' : 'pointer', opacity: it.always ? 0.6 : 1 }}>
                        <input
                          type="checkbox" checked={checked} disabled={!!it.always}
                          onChange={e => toggle(g.group, it.key, e.target.checked)}
                          style={{ width: 16, height: 16, accentColor: 'var(--teal)', cursor: it.always ? 'default' : 'pointer' }}
                        />
                        <span style={{ fontSize: 13, color: 'var(--slate)', fontWeight: 500 }}>{it.label}</span>
                        {it.always && <span style={{ marginLeft: 'auto', fontSize: 10.5, color: 'var(--gray-400)' }}>Always</span>}
                      </label>
                    )
                  })}
                </div>
              </div>
            ))}
            <button type="button" className="btn-sm btn-sm-ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setCfg(DEFAULT_PICK_LIST_CONFIG)}>Show everything</button>
          </div>

          {/* Preview */}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: 'var(--gray-50)' }}>
            <div style={{ padding: '12px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexShrink: 0 }}>
              <div style={{ fontSize: 12, color: 'var(--gray-400)' }}>Preview with sample data</div>
              <div className="modal-seg" style={{ width: 'auto' }}>
                {([['single', 'Single order'], ['consolidated-order', 'Consolidated · by order'], ['consolidated-product', 'Consolidated · by product']] as [PickListMode, string][]).map(([m, label]) => (
                  <button key={m} type="button" onClick={() => setMode(m)} className={mode === m ? 'active' : ''} style={{ padding: '5px 12px', fontSize: 12, fontWeight: 600, border: 'none', borderRadius: 7, cursor: 'pointer', background: mode === m ? 'var(--white)' : 'transparent', color: mode === m ? 'var(--teal)' : 'var(--gray-400)', boxShadow: mode === m ? '0 1px 3px rgba(0,0,0,0.08)' : 'none' }}>{label}</button>
                ))}
              </div>
            </div>
            <div ref={pane} style={{ flex: 1, overflow: 'auto', padding: '0 16px 20px' }}>
              <div style={{ width: PAGE_W * scale, height: frameH * scale, margin: '0 auto', position: 'relative' }}>
                <iframe
                  ref={frame}
                  title="Pick list preview"
                  srcDoc={html}
                  sandbox="allow-same-origin"
                  onLoad={measure}
                  style={{ width: PAGE_W, height: frameH, border: 0, transform: `scale(${scale})`, transformOrigin: 'top left', position: 'absolute', left: 0, top: 0, background: 'transparent' }}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          {error && <span style={{ marginRight: 'auto', fontSize: 12.5, color: '#B91C1C' }}>{error}</span>}
          <button className="btn btn-outline" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving || !dirty}>{saving ? 'Saving…' : 'Save template'}</button>
        </div>
      </div>
    </div>
  )
}
