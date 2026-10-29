'use client'
// src/components/app/addons-provider.tsx
// Tells every screen which add-ons this organisation has switched on (set from the Hub), so add-on screens stay hidden otherwise.
import { createContext, useContext } from 'react'
import { normalizeAddons, type AddonKey, type Addons } from '@/lib/addons'

const Ctx = createContext<Addons>(normalizeAddons(null))
export function AddonsProvider({ addons, children }: { addons: Addons; children: React.ReactNode }) {
  return <Ctx.Provider value={addons}>{children}</Ctx.Provider>
}
export const useAddon = (key: AddonKey): boolean => useContext(Ctx)[key]
