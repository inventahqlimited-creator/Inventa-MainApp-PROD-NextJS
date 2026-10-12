'use client'
// src/components/app/qty-provider.tsx
// Gives every screen the organisation's quantity format, so stock quantities show the same way everywhere.
// Serial-tracked products are always whole numbers — pass the product id (or true) as the "whole" argument.
import { createContext, useContext, useMemo } from 'react'
import { fmtQty, qtyPlaces, qtyStep, roundQty, WHOLE_QTY, type QtyFmt } from '@/lib/qty'

type Value = { format: QtyFmt; serialIds: Set<string> }
const Ctx = createContext<Value>({ format: WHOLE_QTY, serialIds: new Set() })

export function QtyProvider({ format, serialIds = [], children }: { format: QtyFmt; serialIds?: string[]; children: React.ReactNode }) {
  const value = useMemo(() => ({ format, serialIds: new Set(serialIds) }), [format, serialIds])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

/** true / a serial-tracked product's id → whole numbers only. */
export type Whole = boolean | string | null | undefined

export function useQty() {
  const { format: f, serialIds } = useContext(Ctx)
  const whole = (w: Whole) => (typeof w === 'string' ? serialIds.has(w) : !!w)
  return {
    format: f,
    q: (n: number | string | null | undefined, w?: Whole) => fmtQty(n, f, whole(w)),
    places: (w?: Whole) => qtyPlaces(f, whole(w)),
    step: (w?: Whole) => qtyStep(f, whole(w)),
    round: (n: number, w?: Whole) => roundQty(n, f, whole(w)),
  }
}
