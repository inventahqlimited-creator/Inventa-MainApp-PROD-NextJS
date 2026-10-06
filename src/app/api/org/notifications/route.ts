// src/app/api/org/notifications/route.ts
// The bell's alerts, worked out live from the organisation's settings. Nothing is stored.
//   GET ?today=YYYY-MM-DD   (the person's local date, so "overdue" matches their calendar)
import { NextResponse } from 'next/server'
import { getAccess, can } from '@/lib/auth/access'
import { normalizeNotifications, overdueLevel, type AlertLevel } from '@/lib/notifications/config'

export type Alert = { id: string; kind: 'low_stock' | 'sales_overdue' | 'purchase_overdue'; level: AlertLevel; title: string; body: string; href: string }
const MAX = 100
const num = (v: unknown) => Number(v) || 0

export async function GET(req: Request) {
  const access = await getAccess()
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const q = new URL(req.url).searchParams.get('today') ?? ''
  const today = /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : new Date().toISOString().slice(0, 10)

  const { data: org } = await access.db.from('organisations').select('notification_settings').eq('id', access.orgId).single()
  const s = normalizeNotifications((org as { notification_settings?: unknown } | null)?.notification_settings)
  const alerts: Alert[] = []

  if (s.low_stock.enabled && can(access, 'view_products')) {
    const { data: prods } = await access.db.from('products')
      .select('id, name, sku, low_stock_threshold')
      .eq('org_id', access.orgId).eq('is_active', true).eq('type', 'Stock').eq('track_stock', true).gt('low_stock_threshold', 0)
    const list = (prods ?? []) as { id: string; name: string; sku: string | null; low_stock_threshold: number }[]
    if (list.length) {
      const { data: lv } = await access.db.from('stock_levels').select('product_id, quantity').eq('org_id', access.orgId).in('product_id', list.map(p => p.id))
      const onHand = new Map<string, number>()
      for (const r of (lv ?? []) as { product_id: string; quantity: number }[]) onHand.set(r.product_id, (onHand.get(r.product_id) ?? 0) + num(r.quantity))
      for (const p of list) {
        const oh = onHand.get(p.id) ?? 0
        if (oh < p.low_stock_threshold) {
          alerts.push({
            id: `low:${p.id}`, kind: 'low_stock', level: oh <= 0 ? 'critical' : 'warning',
            title: `Low stock — ${p.name}`,
            body: `On hand: ${oh} (minimum: ${p.low_stock_threshold})`,
            href: '/products',
          })
        }
      }
    }
  }

  if (s.sales_overdue.enabled && can(access, 'view_sales')) {
    const { data: so } = await access.db.from('sales_orders')
      .select('id, so_number, status, expected_date, customer_name')
      .eq('org_id', access.orgId).not('expected_date', 'is', null).lt('expected_date', today)
    for (const o of (so ?? []) as { id: string; so_number: string | null; status: string; expected_date: string; customer_name: string | null }[]) {
      if (!['open', 'partially picked', 'picking', 'picked', 'partially packed', 'packed'].includes(o.status.toLowerCase())) continue
      const lvl = overdueLevel(o.expected_date, today, s.sales_overdue)
      if (!lvl) continue
      alerts.push({
        id: `so:${o.id}:${lvl.level}`, kind: 'sales_overdue', level: lvl.level,
        title: `Sales order ${o.so_number ?? ''} is overdue`.replace('  ', ' '),
        body: `${o.customer_name ?? 'Customer'} — due ${o.expected_date.slice(0, 10)}, ${lvl.days} day${lvl.days === 1 ? '' : 's'} late`,
        href: `/sales/${o.id}`,
      })
    }
  }

  if (s.purchase_overdue.enabled && can(access, 'view_purchases')) {
    const { data: po } = await access.db.from('purchase_orders')
      .select('id, po_number, status, expected_date, supplier_name')
      .eq('org_id', access.orgId).not('expected_date', 'is', null).lt('expected_date', today)
    for (const o of (po ?? []) as { id: string; po_number: string | null; status: string; expected_date: string; supplier_name: string | null }[]) {
      if (['draft', 'closed', 'cancelled'].includes(o.status.toLowerCase())) continue
      const lvl = overdueLevel(o.expected_date, today, s.purchase_overdue)
      if (!lvl) continue
      alerts.push({
        id: `po:${o.id}:${lvl.level}`, kind: 'purchase_overdue', level: lvl.level,
        title: `Purchase order ${o.po_number ?? ''} not received`.replace('  ', ' '),
        body: `${o.supplier_name ?? 'Supplier'} — expected ${o.expected_date.slice(0, 10)}, ${lvl.days} day${lvl.days === 1 ? '' : 's'} late`,
        href: `/purchases/${o.id}`,
      })
    }
  }

  alerts.sort((a, b) => (a.level === b.level ? 0 : a.level === 'critical' ? -1 : 1))
  return NextResponse.json({ alerts: alerts.slice(0, MAX), total: alerts.length })
}
