// src/lib/reports/registry.ts
// The catalogue of reports: what each one is called, which section it lives in, and which filters it offers.
// Shared by the server (engine) and the client (home + viewer). No server-only imports here.

export type ColType = 'text' | 'num' | 'qty' | 'money' | 'pct' | 'date' | 'badge' | 'blank'

export interface Col {
  key: string
  label: string
  type: ColType
  /** shown by default (everything else is available in the column picker) */
  off?: boolean
  /** add up in the footer total */
  sum?: boolean
  /** can't be hidden */
  required?: boolean
}

export type Row = Record<string, string | number | boolean | null> & { _href?: string }

export interface Tile { label: string; value: number | string; type: 'num' | 'money' | 'text' | 'pct'; hint?: string }

export interface ReportResult {
  columns: Col[]
  rows: Row[]
  tiles: Tile[]
  /** shown under the title, e.g. which cost basis was used */
  note?: string
  truncated?: boolean
}

export type FilterSource = 'locations' | 'customers' | 'suppliers' | 'products' | 'tags' | 'tiers' | 'countries' | 'priceLevels' | 'bins'
export interface Opt { value: string; label: string }

export interface FilterDef {
  key: string
  label: string
  kind: 'select' | 'multi' | 'daterange' | 'date' | 'toggle' | 'number' | 'text'
  options?: Opt[]
  source?: FilterSource
  /** always visible in the bar; the rest sit under "More filters" */
  primary?: boolean
  placeholder?: string
  /** only show while another filter has this value */
  showWhen?: { key: string; in: string[] }
  /** default value */
  def?: string | string[] | boolean | number
  /** for 'select': no "All" entry */
  noAll?: boolean
  /** extra text under the control */
  hint?: string
}

export type SectionId = 'contacts' | 'products' | 'stock' | 'sales' | 'purchases' | 'transfers'

export interface ReportDef {
  id: string
  section: SectionId
  title: string
  desc: string
  filters: FilterDef[]
}

export const SECTIONS: { id: SectionId; title: string; blurb: string; color: string; bg: string; icon: string }[] = [
  { id: 'contacts',  title: 'Contacts',  blurb: 'Customers and suppliers',          color: '#7C3AED', bg: '#EDE9FE', icon: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75' },
  { id: 'products',  title: 'Products',  blurb: 'Your catalogue',                   color: '#0D9488', bg: '#CCFBF1', icon: 'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16zM3.27 6.96 12 12.01l8.73-5.05M12 22.08V12' },
  { id: 'stock',     title: 'Stock',     blurb: 'What you hold and what it is worth', color: '#2563EB', bg: '#DBEAFE', icon: 'M22 12h-4l-3 9L9 3l-3 9H2' },
  { id: 'sales',     title: 'Sales',     blurb: 'Orders, customers and profit',     color: '#059669', bg: '#D1FAE5', icon: 'M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6' },
  { id: 'purchases', title: 'Purchases', blurb: 'Buying, suppliers and costs',      color: '#D97706', bg: '#FEF3C7', icon: 'M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0' },
  { id: 'transfers', title: 'Transfers', blurb: 'Stock moved between locations',    color: '#DB2777', bg: '#FCE7F3', icon: 'M17 1l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3' },
]

const DATE: FilterDef = { key: 'date', label: 'Date', kind: 'daterange', primary: true }
const LOC: FilterDef = { key: 'location', label: 'Location', kind: 'select', source: 'locations', primary: true }
const SEARCH: FilterDef = { key: 'q', label: 'Search', kind: 'text', placeholder: 'Search…' }
const INCL: FilterDef = { key: 'inclAll', label: 'Include cancelled & draft', kind: 'toggle' }

const SALES_STATUS: Opt[] = ['Draft', 'Open', 'No Stock', 'Partial Stock', 'Stock Available', 'Picking', 'Partially Picked', 'Picked', 'Packed', 'Closed', 'Cancelled'].map(v => ({ value: v, label: v }))
const PURCHASE_STATUS: Opt[] = ['Draft', 'Open', 'Partially Received', 'Closed', 'Cancelled'].map(v => ({ value: v, label: v }))
const TRANSFER_STATUS: Opt[] = ['Draft', 'Open', 'Picking', 'Picked', 'Closed', 'Cancelled'].map(v => ({ value: v, label: v }))
const PRODUCT_TYPE: Opt[] = [{ value: 'Stock', label: 'Stock item' }, { value: 'NonStock', label: 'Non-stock item' }, { value: 'Service', label: 'Service' }]
const COST_BASIS: Opt[] = [
  { value: 'avg', label: 'Average cost' },
  { value: 'last', label: 'Last purchase cost' },
  { value: 'std', label: 'Product cost price' },
]

export const REPORTS: ReportDef[] = [
  // ───────────── Contacts
  {
    id: 'contacts', section: 'contacts', title: 'Contact list',
    desc: 'Every customer and supplier with all their details, including custom fields.',
    filters: [
      { key: 'type', label: 'Type', kind: 'select', primary: true, options: [{ value: 'customer', label: 'Customers' }, { value: 'supplier', label: 'Suppliers' }] },
      { key: 'status', label: 'Status', kind: 'select', primary: true, options: [{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }] },
      { key: 'tier', label: 'Tier', kind: 'select', source: 'tiers' },
      { key: 'priceLevel', label: 'Price level', kind: 'select', source: 'priceLevels' },
      { key: 'country', label: 'Country', kind: 'select', source: 'countries' },
      { key: 'owing', label: 'Balance owing only', kind: 'toggle' },
      { key: 'created', label: 'Created', kind: 'daterange' },
      SEARCH,
    ],
  },
  // ───────────── Products
  {
    id: 'products', section: 'products', title: 'Product list',
    desc: 'Every product with prices, costs, tracking and custom fields.',
    filters: [
      { key: 'type', label: 'Product type', kind: 'select', primary: true, options: PRODUCT_TYPE },
      { key: 'status', label: 'Status', kind: 'select', primary: true, options: [{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }] },
      { key: 'tracking', label: 'Tracking', kind: 'multi', primary: true, options: [{ value: 'batch', label: 'Batch' }, { value: 'serial', label: 'Serial' }, { value: 'expiry', label: 'Expiry' }, { value: 'none', label: 'No tracking' }] },
      { key: 'supplier', label: 'Supplier', kind: 'select', source: 'suppliers' },
      { key: 'tag', label: 'Tag', kind: 'select', source: 'tags' },
      { key: 'priceMin', label: 'Sell price from', kind: 'number' },
      { key: 'priceMax', label: 'Sell price to', kind: 'number' },
      SEARCH,
    ],
  },
  // ───────────── Stock
  {
    id: 'stock-list', section: 'stock', title: 'Stock list',
    desc: 'On hand, committed, on order and available for every product at every location.',
    filters: [
      LOC,
      { key: 'level', label: 'Stock level', kind: 'select', primary: true, options: [{ value: 'in', label: 'In stock' }, { value: 'zero', label: 'Out of stock' }, { value: 'neg', label: 'Negative' }] },
      { key: 'supplier', label: 'Supplier', kind: 'select', source: 'suppliers' },
      { key: 'tag', label: 'Tag', kind: 'select', source: 'tags' },
      SEARCH,
    ],
  },
  {
    id: 'stock-valuation', section: 'stock', title: 'Stock valuation',
    desc: 'What your stock is worth, by product, location or both. Pick any past date to see it as it was.',
    filters: [
      LOC,
      { key: 'group', label: 'Group by', kind: 'select', primary: true, noAll: true, def: 'both', options: [{ value: 'both', label: 'Product & location' }, { value: 'product', label: 'Product' }, { value: 'location', label: 'Location' }] },
      { key: 'basis', label: 'Cost basis', kind: 'select', primary: true, noAll: true, def: 'avg', options: COST_BASIS, hint: 'Average cost falls back to last purchase cost, then the product cost price.' },
      { key: 'asAt', label: 'As at date', kind: 'date', hint: 'Leave empty for right now.' },
      { key: 'supplier', label: 'Supplier', kind: 'select', source: 'suppliers' },
      { key: 'tag', label: 'Tag', kind: 'select', source: 'tags' },
      { key: 'hideZero', label: 'Hide zero stock', kind: 'toggle', def: true },
      SEARCH,
    ],
  },
  {
    id: 'stock-count', section: 'stock', title: 'Stock count sheet',
    desc: 'A printable sheet for counting stock by location and bin, with space to write the counted quantity.',
    filters: [
      { ...LOC, noAll: false },
      { key: 'bin', label: 'Bin', kind: 'select', source: 'bins', primary: true },
      { key: 'sort', label: 'Sort by', kind: 'select', noAll: true, def: 'bin', options: [{ value: 'bin', label: 'Bin, then product' }, { value: 'sku', label: 'SKU' }, { value: 'name', label: 'Product name' }] },
      { key: 'supplier', label: 'Supplier', kind: 'select', source: 'suppliers' },
      { key: 'tag', label: 'Tag', kind: 'select', source: 'tags' },
      { key: 'hideZero', label: 'Hide zero stock', kind: 'toggle', def: true },
      SEARCH,
    ],
  },
  {
    id: 'min-level', section: 'stock', title: 'Minimum level alerts',
    desc: 'Products at or running towards their minimum stock level, with a suggested reorder quantity.',
    filters: [
      { key: 'mode', label: 'Show', kind: 'select', primary: true, noAll: true, def: 'below', options: [
        { value: 'below', label: 'Below minimum' },
        { value: 'below_pct', label: 'Below minimum by at least…' },
        { value: 'near', label: 'Approaching minimum (within …)' },
        { value: 'out', label: 'Out of stock' },
        { value: 'all', label: 'All products with a minimum' },
      ] },
      { key: 'pct', label: 'Percent', kind: 'number', primary: true, def: 10, showWhen: { key: 'mode', in: ['below_pct', 'near'] }, placeholder: '10', hint: '% of the minimum level' },
      LOC,
      { key: 'supplier', label: 'Supplier', kind: 'select', source: 'suppliers' },
      { key: 'tag', label: 'Tag', kind: 'select', source: 'tags' },
      SEARCH,
    ],
  },
  {
    id: 'expiry', section: 'stock', title: 'Expiry dates',
    desc: 'Batches and items that are expiring, or have already expired.',
    filters: [
      { key: 'window', label: 'Expiring', kind: 'select', primary: true, noAll: true, def: '90', options: [
        { value: 'expired', label: 'Already expired' },
        { value: '7', label: 'In the next 7 days' },
        { value: '30', label: 'In the next 30 days' },
        { value: '60', label: 'In the next 60 days' },
        { value: '90', label: 'In the next 90 days' },
        { value: '180', label: 'In the next 6 months' },
        { value: 'all', label: 'Any date' },
        { value: 'custom', label: 'Custom range' },
      ] },
      { key: 'range', label: 'Expiry between', kind: 'daterange', primary: true, showWhen: { key: 'window', in: ['custom'] } },
      LOC,
      { key: 'product', label: 'Product', kind: 'select', source: 'products' },
      { key: 'inclExpired', label: 'Include already expired', kind: 'toggle', def: true, showWhen: { key: 'window', in: ['7', '30', '60', '90', '180'] } },
      SEARCH,
    ],
  },
  {
    id: 'ageing', section: 'stock', title: 'Inventory ageing',
    desc: 'How long your stock has been sitting on the shelf, with the value in each age band.',
    filters: [
      LOC,
      { key: 'bands', label: 'Age bands', kind: 'select', primary: true, noAll: true, def: '30,60,90', options: [
        { value: '15,30,60', label: '0–15 · 16–30 · 31–60 · 60+' },
        { value: '30,60,90', label: '0–30 · 31–60 · 61–90 · 90+' },
        { value: '60,120,180', label: '0–60 · 61–120 · 121–180 · 180+' },
        { value: '90,180,365', label: '0–90 · 91–180 · 181–365 · 365+' },
      ] },
      { key: 'basis', label: 'Cost basis', kind: 'select', noAll: true, def: 'avg', options: COST_BASIS },
      { key: 'minAge', label: 'Only stock older than (days)', kind: 'number' },
      { key: 'supplier', label: 'Supplier', kind: 'select', source: 'suppliers' },
      { key: 'tag', label: 'Tag', kind: 'select', source: 'tags' },
      SEARCH,
    ],
  },
  // ───────────── Sales
  {
    id: 'sales-orders', section: 'sales', title: 'Sales by order',
    desc: 'One line per sales order with customer, status and value.',
    filters: [
      DATE,
      { key: 'status', label: 'Status', kind: 'multi', primary: true, options: SALES_STATUS },
      { key: 'customer', label: 'Customer', kind: 'select', source: 'customers', primary: true },
      LOC,
      { key: 'amtMin', label: 'Order value from', kind: 'number' },
      { key: 'amtMax', label: 'Order value to', kind: 'number' },
      INCL, SEARCH,
    ],
  },
  {
    id: 'sales-products', section: 'sales', title: 'Sales by product',
    desc: 'What sold, how much, and for how much.',
    filters: [
      DATE,
      { key: 'product', label: 'Product', kind: 'select', source: 'products', primary: true },
      { key: 'customer', label: 'Customer', kind: 'select', source: 'customers', primary: true },
      LOC,
      { key: 'tag', label: 'Tag', kind: 'select', source: 'tags' },
      { key: 'status', label: 'Order status', kind: 'multi', options: SALES_STATUS },
      INCL, SEARCH,
    ],
  },
  {
    id: 'sales-customers', section: 'sales', title: 'Sales by customer',
    desc: 'Who is buying: orders, revenue and average order value per customer.',
    filters: [
      DATE,
      { key: 'customer', label: 'Customer', kind: 'select', source: 'customers', primary: true },
      { key: 'tier', label: 'Tier', kind: 'select', source: 'tiers', primary: true },
      { key: 'country', label: 'Country', kind: 'select', source: 'countries' },
      LOC,
      { key: 'status', label: 'Order status', kind: 'multi', options: SALES_STATUS },
      INCL, SEARCH,
    ],
  },
  {
    id: 'sales-profit', section: 'sales', title: 'Sales profit',
    desc: 'Revenue, cost and margin, by order, product or customer.',
    filters: [
      DATE,
      { key: 'group', label: 'Group by', kind: 'select', primary: true, noAll: true, def: 'order', options: [{ value: 'order', label: 'Order' }, { value: 'product', label: 'Product' }, { value: 'customer', label: 'Customer' }] },
      { key: 'customer', label: 'Customer', kind: 'select', source: 'customers', primary: true },
      { key: 'product', label: 'Product', kind: 'select', source: 'products' },
      LOC,
      { key: 'marginBelow', label: 'Only margin below (%)', kind: 'number' },
      { key: 'status', label: 'Order status', kind: 'multi', options: SALES_STATUS },
      INCL, SEARCH,
    ],
  },
  // ───────────── Purchases
  {
    id: 'purchase-orders', section: 'purchases', title: 'Purchases by order',
    desc: 'One line per purchase order with supplier, status and value.',
    filters: [
      DATE,
      { key: 'status', label: 'Status', kind: 'multi', primary: true, options: PURCHASE_STATUS },
      { key: 'supplier', label: 'Supplier', kind: 'select', source: 'suppliers', primary: true },
      LOC,
      { key: 'amtMin', label: 'Order value from', kind: 'number' },
      { key: 'amtMax', label: 'Order value to', kind: 'number' },
      INCL, SEARCH,
    ],
  },
  {
    id: 'purchase-products', section: 'purchases', title: 'Purchases by product',
    desc: 'What you bought, how much, and what it cost.',
    filters: [
      DATE,
      { key: 'product', label: 'Product', kind: 'select', source: 'products', primary: true },
      { key: 'supplier', label: 'Supplier', kind: 'select', source: 'suppliers', primary: true },
      LOC,
      { key: 'tag', label: 'Tag', kind: 'select', source: 'tags' },
      { key: 'status', label: 'Order status', kind: 'multi', options: PURCHASE_STATUS },
      INCL, SEARCH,
    ],
  },
  {
    id: 'purchase-suppliers', section: 'purchases', title: 'Purchases by supplier',
    desc: 'Spend, order count, lead time and on-time delivery per supplier.',
    filters: [
      DATE,
      { key: 'supplier', label: 'Supplier', kind: 'select', source: 'suppliers', primary: true },
      { key: 'country', label: 'Country', kind: 'select', source: 'countries' },
      LOC,
      { key: 'status', label: 'Order status', kind: 'multi', options: PURCHASE_STATUS },
      INCL, SEARCH,
    ],
  },
  {
    id: 'cost-history', section: 'purchases', title: 'Item cost history',
    desc: 'How the cost of each item has changed over time, purchase by purchase.',
    filters: [
      DATE,
      { key: 'product', label: 'Product', kind: 'select', source: 'products', primary: true },
      { key: 'supplier', label: 'Supplier', kind: 'select', source: 'suppliers', primary: true },
      { key: 'tag', label: 'Tag', kind: 'select', source: 'tags' },
      { key: 'changedOnly', label: 'Only where the cost changed', kind: 'toggle' },
      INCL, SEARCH,
    ],
  },
  // ───────────── Transfers
  {
    id: 'transfer-orders', section: 'transfers', title: 'Transfers by order',
    desc: 'One line per transfer with route, status and quantities.',
    filters: [
      DATE,
      { key: 'status', label: 'Status', kind: 'multi', primary: true, options: TRANSFER_STATUS },
      { key: 'from', label: 'From location', kind: 'select', source: 'locations', primary: true },
      { key: 'to', label: 'To location', kind: 'select', source: 'locations', primary: true },
      INCL, SEARCH,
    ],
  },
  {
    id: 'transfer-products', section: 'transfers', title: 'Transfers by product',
    desc: 'Which products have moved, how many, and where.',
    filters: [
      DATE,
      { key: 'group', label: 'Group by', kind: 'select', primary: true, noAll: true, def: 'product', options: [{ value: 'product', label: 'Product' }, { value: 'route', label: 'Product & route' }] },
      { key: 'product', label: 'Product', kind: 'select', source: 'products', primary: true },
      { key: 'from', label: 'From location', kind: 'select', source: 'locations' },
      { key: 'to', label: 'To location', kind: 'select', source: 'locations' },
      { key: 'tag', label: 'Tag', kind: 'select', source: 'tags' },
      { key: 'status', label: 'Status', kind: 'multi', options: TRANSFER_STATUS },
      INCL, SEARCH,
    ],
  },
]

export const REPORT_MAP = new Map(REPORTS.map(r => [r.id, r]))

export type FilterValue = string | string[] | boolean | number | undefined
export type Filters = Record<string, FilterValue>

/** default filter values for a report (toggles / selects that have a default) */
export function defaultFilters(def: ReportDef): Filters {
  const f: Filters = {}
  for (const x of def.filters) if (x.def !== undefined) f[x.key] = x.def
  return f
}
