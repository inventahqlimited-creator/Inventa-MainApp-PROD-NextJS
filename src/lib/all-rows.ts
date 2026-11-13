// src/lib/all-rows.ts
// Supabase returns at most 1000 rows per query, which silently cut off long lists (the last products, stock levels,
// contacts). allRows reads every row, a page at a time, and returns { data } like a normal query, so it drops into the
// existing Promise.all lists. `build` must use a stable order (add .order('id') last).
/* eslint-disable @typescript-eslint/no-explicit-any */
const PAGE = 1000

export async function allRows<T = any>(
  build: (from: number, to: number) => PromiseLike<{ data: any[] | null; error?: unknown }>,
  maxRows = 100_000,
): Promise<{ data: T[] }> {
  const out: T[] = []
  for (let from = 0; from < maxRows; from += PAGE) {
    const { data } = await build(from, from + PAGE - 1)
    const rows = (data ?? []) as T[]
    out.push(...rows)
    if (rows.length < PAGE) break
  }
  return { data: out }
}
