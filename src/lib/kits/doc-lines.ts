// src/lib/kits/doc-lines.ts — which lines of a kit appear on a printed document (Settings > Kits & Bundles > documents).
import type { DocMode } from './settings'

export type KitFlag = { kit_group?: string | null; is_kit_parent?: boolean | null }

/** parent = the kit line only · components = the kit's items only · both = the kit line followed by its items */
export function keepKitLine(f: KitFlag | undefined | null, mode: DocMode): boolean {
  if (!f || !f.kit_group) return true
  if (f.is_kit_parent) return mode !== 'components'
  return mode !== 'parent'
}

/** An item shown under its kit is marked with an arrow so it reads as part of the kit. Items shown on their own keep their name. */
export function kitItemName(name: string, f: KitFlag | undefined | null, mode: DocMode): string {
  return f && f.kit_group && !f.is_kit_parent && mode === 'both' ? `↳ ${name}` : name
}
