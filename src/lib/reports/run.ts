// src/lib/reports/run.ts
// Picks the right query for a report id, and loads the option lists the filter bar needs.
import type { Filters, Opt, ReportResult } from './registry'
import { REPORT_MAP } from './registry'
import { type Db, fetchAll, loadBins, loadLocations, loadProducts } from './util'
import { ageingReport, contactsReport, expiryReport, minLevelReport, productsReport, stockCountReport, stockListReport, stockValuationReport } from './stock-reports'
import {
  costHistoryReport, purchaseOrdersReport, purchaseProductsReport, purchaseSuppliersReport, salesCustomersReport, salesOrdersReport, salesProductsReport, salesProfitReport,
  transferOrdersReport, transferProductsReport,
} from './trade-reports'

type Runner = (db: Db, orgId: string, f: Filters) => Promise<ReportResult>

const RUNNERS: Record<string, Runner> = {
  'contacts': contactsReport,
  'products': productsReport,
  'stock-list': stockListReport,
  'stock-valuation': stockValuationReport,
  'stock-count': stockCountReport,
  'min-level': minLevelReport,
  'expiry': expiryReport,
  'ageing': ageingReport,
  'sales-orders': salesOrdersReport,
  'sales-products': salesProductsReport,
  'sales-customers': salesCustomersReport,
  'sales-profit': salesProfitReport,
  'purchase-orders': purchaseOrdersReport,
  'purchase-products': purchaseProductsReport,
  'purchase-suppliers': purchaseSuppliersReport,
  'cost-history': costHistoryReport,
  'transfer-orders': transferOrdersReport,
  'transfer-products': transferProductsReport,
}

export async function runReport(id: string, db: Db, orgId: string, filters: Filters): Promise<ReportResult> {
  if (!REPORT_MAP.has(id)) throw new Error('Unknown report')
  return RUNNERS[id](db, orgId, filters)
}

export interface Lookups {
  locations: Opt[]; customers: Opt[]; suppliers: Opt[]; products: Opt[]; tags: Opt[]; tiers: Opt[]; countries: Opt[]; priceLevels: Opt[]; bins: Opt[]
}

const uniq = (xs: (string | null | undefined)[]): Opt[] => [...new Set(xs.map(x => (x ?? '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b)).map(v => ({ value: v, label: v }))

export async function loadLookups(db: Db, orgId: string): Promise<Lookups> {
  const [locs, bins, contacts, products, levels] = await Promise.all([
    loadLocations(db, orgId),
    loadBins(db, orgId),
    fetchAll<{ id: string; name: string; type: string | null; tier: string | null; country: string | null; bill_country: string | null; is_active: boolean | null }>((a, b) => db.from('contacts').select('id, name, type, tier, country, bill_country, is_active').eq('org_id', orgId).order('name').range(a, b)),
    loadProducts(db, orgId),
    db.from('price_levels').select('id, name').eq('org_id', orgId).order('name'),
  ])
  const byName = (a: Opt, b: Opt) => a.label.localeCompare(b.label)
  const c = contacts.rows
  return {
    locations: [...locs.entries()].map(([value, label]) => ({ value, label })).sort(byName),
    bins: [...bins.entries()].map(([value, b]) => ({ value, label: `${b.name}${b.location_id && locs.get(b.location_id) ? ` · ${locs.get(b.location_id)}` : ''}` })).sort(byName),
    customers: c.filter(x => x.type !== 'supplier').map(x => ({ value: x.id, label: x.name })),
    suppliers: c.filter(x => x.type === 'supplier').map(x => ({ value: x.id, label: x.name })),
    products: products.list.map(p => ({ value: p.id, label: p.sku ? `${p.name} (${p.sku})` : p.name })),
    tags: uniq(products.list.flatMap(p => p.tags ?? [])),
    tiers: uniq(c.map(x => x.tier)),
    countries: uniq(c.map(x => x.bill_country || x.country)),
    priceLevels: ((levels.data ?? []) as { id: string; name: string }[]).map(l => ({ value: l.id, label: l.name })),
  }
}
