'use client'
// src/components/app/permissions-provider.tsx
// Gives every screen the signed-in person's permissions, so buttons and menu items they can't use are hidden.
// The server checks the same permissions on every request — hiding is only to keep the screen tidy.
import { createContext, useContext } from 'react'
import { fullSet, type PermKey, type PermissionSet } from '@/lib/permissions'

type Value = { perms: PermissionSet; isAdmin: boolean }
const Ctx = createContext<Value>({ perms: fullSet(), isAdmin: true })

export function PermissionsProvider({ perms, isAdmin, children }: { perms: PermissionSet; isAdmin: boolean; children: React.ReactNode }) {
  return <Ctx.Provider value={{ perms, isAdmin }}>{children}</Ctx.Provider>
}

export const usePerms = () => useContext(Ctx)
/** true when the person has ALL of these. */
export function useCan(...keys: PermKey[]): boolean {
  const { perms } = useContext(Ctx)
  return keys.every(k => perms[k])
}
/** true when the person has AT LEAST ONE of these. */
export function useCanAny(...keys: PermKey[]): boolean {
  const { perms } = useContext(Ctx)
  return keys.some(k => perms[k])
}
