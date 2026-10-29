// src/lib/kits/virtual-stock.ts — how many kits could be made from the stock of their items (never stored: worked out when shown).
export type BomRef = { component_id: string; quantity: number }

/**
 * Whole kits that the items on hand can make: the item that runs out first decides.
 * Items that are not stocked (services, non-stock items) never limit a kit. A kit with no stocked items has no virtual stock (null).
 */
export function virtualStock(bom: BomRef[], stockedAvailable: (componentId: string) => number | null): number | null {
  let best: number | null = null
  for (const line of bom) {
    const per = Number(line.quantity)
    if (!(per > 0)) continue
    const have = stockedAvailable(line.component_id)
    if (have === null) continue
    const n = Math.max(Math.floor((have + 1e-9) / per), 0)
    best = best === null ? n : Math.min(best, n)
  }
  return best
}
