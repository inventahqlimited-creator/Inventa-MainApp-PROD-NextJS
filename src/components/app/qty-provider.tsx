'use client'
// src/components/app/qty-provider.tsx
// Gives every screen the organisation's quantity format, so stock quantities show the same way everywhere.
import { createContext, useContext } from 'react'
import { fmtQty, qtyPlaces, qtyStep, roundQty, WHOLE_QTY, type QtyFmt } from '@/lib/qty'

const Ctx = createContext<QtyFmt>(WHOLE_QTY)

export function QtyProvider({ format, children }: { format: QtyFmt; children: React.ReactNode }) {
  return <Ctx.Provider value={format}>{children}</Ctx.Provider>
}

/** `q(n)` formats a quantity; pass `true` as the second argument for serial-tracked products (always whole). */
export function useQty() {
  const f = useContext(Ctx)
  return {
    format: f,
    q: (n: number | string | null | undefined, wholeOnly = false) => fmtQty(n, f, wholeOnly),
    places: (wholeOnly = false) => qtyPlaces(f, wholeOnly),
    step: (wholeOnly = false) => qtyStep(f, wholeOnly),
    round: (n: number, wholeOnly = false) => roundQty(n, f, wholeOnly),
  }
}
