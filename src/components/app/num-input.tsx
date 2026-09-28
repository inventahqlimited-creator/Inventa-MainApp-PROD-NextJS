'use client'

// src/components/app/num-input.tsx
// Number field that selects its contents on click (so you can just type over it)
// and, when `decimals` is given, pads the value to that many places on blur (10 → 10.00).

import { useState } from 'react'

type Props = {
  value: number | null | undefined
  onChange: (n: number) => void
  decimals?: number          // e.g. org decimal_places for prices; omit for qty / %
  min?: number
  max?: number
  className?: string
  style?: React.CSSProperties
  placeholder?: string
  disabled?: boolean
  blankWhenZero?: boolean
}

function fmt(n: number | null | undefined, decimals?: number, blankWhenZero?: boolean) {
  if (n == null || !Number.isFinite(n)) return ''
  if (blankWhenZero && n === 0) return ''
  return decimals != null ? n.toFixed(decimals) : String(n)
}

export default function NumInput({ value, onChange, decimals, min, max, className, style, placeholder, disabled, blankWhenZero }: Props) {
  // While focused we show exactly what the user typed; otherwise the formatted value
  const [draft, setDraft] = useState<string | null>(null)

  function commit(raw: string) {
    let n = parseFloat(raw.replace(/[^0-9.\-]/g, ''))
    if (!Number.isFinite(n)) n = 0
    if (min != null && n < min) n = min
    if (max != null && n > max) n = max
    if (decimals != null) n = Number(n.toFixed(decimals))
    onChange(n)
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      className={className}
      style={style}
      placeholder={placeholder ?? (decimals != null ? (0).toFixed(decimals) : '0')}
      disabled={disabled}
      value={draft ?? fmt(value, decimals, blankWhenZero)}
      onFocus={e => {
        const text = fmt(value, decimals, blankWhenZero)
        setDraft(text)
        e.currentTarget.value = text
        e.currentTarget.select() // select everything so typing replaces it
      }}
      onMouseUp={e => e.preventDefault()} // keep the selection on click (Safari/Chrome)
      onChange={e => {
        const v = e.target.value
        if (!/^-?\d*\.?\d*$/.test(v)) return // numbers only
        setDraft(v)
        const n = parseFloat(v)
        if (Number.isFinite(n)) onChange(n) // live totals while typing
      }}
      onBlur={e => { commit(e.target.value); setDraft(null) }}
      onKeyDown={e => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur() }}
    />
  )
}
