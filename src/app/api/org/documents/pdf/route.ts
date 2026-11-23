// POST { type, id, overrides? } — one document as a PDF download. Used by the Download choice in the print dialog.
import { NextResponse } from 'next/server'
import { requirePerm } from '@/lib/auth/access'
import { renderDocumentPdf, isDocType, type DocType } from '@/lib/pdf'
import type { PackOverrides } from '@/lib/packing-list/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const PERM: Record<DocType, string> = {
  invoice: 'print_sales_invoice',
  purchase_order: 'print_purchases',
  packing_list: 'print_sales_pack',
  pick_list: 'print_sales_pick',
  credit_note: 'view_sales',
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { type?: unknown; id?: unknown; overrides?: unknown }
  if (!isDocType(body.type) || typeof body.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.id)) return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  const g = await requirePerm(PERM[body.type] as never)
  if ('res' in g) return g.res
  const overrides = body.type === 'packing_list' && body.overrides && typeof body.overrides === 'object' ? (body.overrides as PackOverrides) : undefined
  try {
    const d = await renderDocumentPdf(g.access.db, g.access.orgId, body.type, body.id, overrides)
    return new NextResponse(new Uint8Array(d.buffer), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${d.filename.replace(/"/g, '')}"`, 'Cache-Control': 'no-store' } })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not build the PDF' }, { status: 500 })
  }
}
