'use client'

// src/components/app/tax-select.tsx
// Tax picker for line-item tables. Uses the app's standard dropdown styling
// (modal-dd-btn / inv-dropdown / fp-item) and renders the menu in a portal so it
// isn't clipped by the table's horizontal scroll container.

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

type Option = { id: string; label: string }

export default function TaxSelect({
  value,
  label,
  options,
  onChange,
  width = 140,
  title = 'Tax Rate',
}: {
  value: string | null | undefined        // selected tax_rate_id ('' / null = No Tax)
  label?: string | null                   // text to show when value isn't in options (legacy lines)
  options: Option[]
  onChange: (id: string) => void
  width?: number
  title?: string
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number; minWidth: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const current = options.find(o => o.id === value)
  const shown = current?.label ?? (label || 'No Tax')

  // Position the menu under the button (fixed, so scroll containers can't clip it)
  useLayoutEffect(() => {
    if (!open || !btnRef.current) return
    const place = () => {
      const r = btnRef.current!.getBoundingClientRect()
      const menuH = menuRef.current?.offsetHeight ?? 0
      const below = r.bottom + 4
      const top = below + menuH > window.innerHeight - 8 && r.top - menuH - 4 > 8 ? r.top - menuH - 4 : below
      setPos({ top, left: r.left, minWidth: Math.max(r.width, 200) })
    }
    place()
    requestAnimationFrame(place) // re-place once the menu has a height
  }, [open])

  // Close on outside click, Escape, scroll or resize
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    const onScroll = (e: Event) => { if (!menuRef.current?.contains(e.target as Node)) setOpen(false) }
    const onResize = () => setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onResize)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
    }
  }, [open])

  function pick(id: string) {
    onChange(id)
    setOpen(false)
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className="modal-dd-btn"
        data-dropdown
        onClick={e => { e.stopPropagation(); setOpen(o => !o) }}
        style={{ width, height: 32, fontSize: 13, padding: '0 10px', background: 'var(--white)' }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{shown}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ flexShrink: 0 }}><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      {open && typeof document !== 'undefined' && createPortal(
        <div
          ref={menuRef}
          data-dropdown
          className="inv-dropdown filter-pick-dropdown"
          onMouseDown={e => e.stopPropagation()}
          style={{
            display: 'block',
            position: 'fixed',
            top: pos?.top ?? -9999,
            left: pos?.left ?? -9999,
            right: 'auto',
            minWidth: pos?.minWidth ?? 200,
            zIndex: 2000,
            visibility: pos ? 'visible' : 'hidden',
          }}
        >
          <div className="col-dropdown-title">{title}</div>
          <div className={`fp-item${!value ? ' active' : ''}`} onClick={() => pick('')}>No Tax</div>
          {options.map(o => (
            <div key={o.id} className={`fp-item${value === o.id ? ' active' : ''}`} onClick={() => pick(o.id)}>{o.label}</div>
          ))}
        </div>,
        document.body,
      )}
    </>
  )
}
