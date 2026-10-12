'use client'
// src/components/app/payment-terms-provider.tsx
// The organisation's payment terms, for every dropdown that offers them.
import { createContext, useContext } from 'react'
import { DEFAULT_TERMS, type PaymentTerm } from '@/lib/payment-terms'

const Ctx = createContext<PaymentTerm[]>(DEFAULT_TERMS)

export function PaymentTermsProvider({ terms, children }: { terms: PaymentTerm[]; children: React.ReactNode }) {
  return <Ctx.Provider value={terms.length > 0 ? terms : DEFAULT_TERMS}>{children}</Ctx.Provider>
}

export const usePaymentTerms = () => useContext(Ctx)

/** Names for a dropdown. A value saved earlier that is no longer in the list stays selectable. */
export function useTermNames(current?: string | null): string[] {
  const names = useContext(Ctx).map(t => t.name)
  const c = (current ?? '').trim()
  return c && !names.some(n => n.toLowerCase() === c.toLowerCase()) ? [...names, c] : names
}
