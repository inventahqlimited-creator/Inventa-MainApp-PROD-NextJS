// src/lib/xero/paged.ts
// Supabase returns at most 1000 rows per query. These helpers read every row, a page at a time.
const PAGE = 1000

/** Runs `build(from, to)` for successive pages until a short page comes back. `build` must use a stable order. */
export async function fetchAllRows<T>(build: (from: number, to: number) => PromiseLike<{ data: unknown[] | null }>, maxRows = 50_000): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; from < maxRows; from += PAGE) {
    const { data } = await build(from, from + PAGE - 1)
    const rows = (data ?? []) as T[]
    out.push(...rows)
    if (rows.length < PAGE) break
  }
  return out
}
