'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import NumInput from '@/components/app/num-input'
import TaxSelect from '@/components/app/tax-select'
import { printPurchaseOrder } from '@/lib/purchase-order/print'
import { XeroPostNotice, XeroStatusBadge, usePostToXero, type XeroRowInfo } from '@/components/app/xero-sync-ui'
import { toast } from '@/components/app/toast'
import OrderHistory from '@/components/app/order-history'

type Supplier = {
  id: string
  name: string
  email: string | null
  phone: string | null
  bill_street: string | null
  bill_city: string | null
  bill_country: string | null
  terms: string | null
  currency: string | null
  price_level_id?: string | null
}

type Location = {
  id: string
  name: string
  address: string | null
  city: string | null
  country: string | null
  phone: string | null
  email: string | null
}

type Product = {
  id: string
  name: string
  sku: string | null
  buy_uom: string | null
  buy_tax_rate_id?: string | null
  cost_price: number | null
  tax_rate: string | number | null
  description: string | null
  track_stock: boolean | null
  type: string
  price_levels?: { price_level_id: string; price: number }[]
}

type StockLevel = {
  product_id: string
  location_id: string
  quantity: number | string | null
  committed: number | string | null
}

type TaxRate = {
  id: string
  name: string
  rate: number
  is_default?: boolean | null
}

type PriceLevel = {
  id: string
  name: string
}

type LineItem = {
  id?: string
  quantity_received?: number | null
  product_id: string
  product_name: string
  product_sku: string
  unit: string
  quantity_ordered: number
  unit_cost: number
  discount: number
  tax_rate: number
  tax_rate_id?: string | null
  tax_name?: string | null
  line_notes: string
}

type CostLine = {
  id?: string
  product_id: string
  product_name: string
  product_sku: string
  description: string
  amount: number
  tax_rate: number
  tax_rate_id?: string | null
  tax_name?: string | null
}

type PurchaseOrder = {
  id: string
  po_number: string | null
  status: string
  supplier_id: string | null
  supplier_name: string | null
  location_id: string | null
  location_name: string | null
  order_date: string | null
  expected_date: string | null
  terms: string | null
  notes: string | null
  reference: string | null
  currency: string | null
  total_amount: number | null
  order_discount: number | null
  order_discount_type: string | null
  order_discount_amount: number | null
  lines: LineItem[]
  cost_lines: CostLine[]
}

// Item picker columns: SKU | Product | Unit | Available | Committed | Price
const PICK_COLS = '110px minmax(160px, 1fr) 70px 80px 85px 90px'

function fmtMoney(n: number) {
  return `$${n.toFixed(2)}`
}

function parseTaxRate(v: string | number | null | undefined): number {
  // products.tax_rate is numeric in the DB (e.g. 15), but may also arrive as "15" or "GST 15%"
  if (v == null || v === '') return 0
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  const n = Number(v)
  if (Number.isFinite(n)) return n
  const m = String(v).match(/(\d+(?:\.\d+)?)\s*%/)
  return m ? parseFloat(m[1]) : 0
}

function lineTotal(l: LineItem) {
  return l.quantity_ordered * l.unit_cost * (1 - l.discount / 100)
}

function statusBadge(status: string): { label: string; color: string; bg: string } {
  switch (status.toLowerCase()) {
    case 'draft':
      return { label: 'Draft', color: '#92400E', bg: '#FEF3C7' }
    case 'open':
      return { label: 'Open', color: '#065F46', bg: '#D1FAE5' }
    case 'partially received':
      return { label: 'Partially Received', color: '#1E40AF', bg: '#DBEAFE' }
    case 'closed':
      return { label: 'Closed', color: '#374151', bg: '#F3F4F6' }
    case 'cancelled':
      return { label: 'Cancelled', color: '#991B1B', bg: '#FEE2E2' }
    default:
      return { label: status, color: '#374151', bg: '#F3F4F6' }
  }
}

function isEditable(status: string) {
  const s = status.toLowerCase()
  return s === 'draft' || s === 'open'
}

type Props = {
  orgId: string
  order: PurchaseOrder
  suppliers: Supplier[]
  locations: Location[]
  products: Product[]
  defaultTerms?: string | null
  priceLevels?: PriceLevel[]
  taxRates?: TaxRate[]
  decimalPlaces?: number
  stockLevels?: StockLevel[]
  relatedSoId?: string | null // sales order this was created from / created from it (shows Open Related Order)
  xeroBill?: { show: boolean; canPost: boolean; ready: boolean; info: XeroRowInfo | null } // Xero state of this order's bill (closed + something received = ready)
  startInEdit?: boolean // opened with ?edit=1 (Edit Order in the Purchases list)
}

// Same classes as the purchase order list, so the status tag looks identical everywhere
function statusClass(status: string) {
  const s = status.toLowerCase()
  if (s === 'open') return 'badge-open'
  if (s === 'partially received') return 'badge-partial'
  if (s === 'closed') return 'badge-closed'
  if (s === 'cancelled') return 'badge-cancelled'
  return 'badge-draft'
}

function ConfirmModal({ title, message, confirmLabel, cancelLabel = 'Go back', onConfirm, onCancel, danger, busy }: {
  title: string; message: string; confirmLabel: string; cancelLabel?: string
  onConfirm: () => void; onCancel: () => void; danger?: boolean; busy?: boolean
}) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onMouseDown={onCancel}>
      <div style={{ background: 'var(--white)', borderRadius: 16, padding: '28px 32px', maxWidth: 420, width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }} onMouseDown={e => e.stopPropagation()}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 700, color: 'var(--slate)', marginBottom: 10 }}>{title}</div>
        <div style={{ fontSize: 14, color: 'var(--gray-500)', lineHeight: 1.6, marginBottom: 24 }}>{message}</div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn btn-outline" style={{ height: 38 }} onClick={onCancel} disabled={busy}>{cancelLabel}</button>
          <button className="btn btn-primary" style={{ height: 38, padding: '0 20px', background: danger ? 'var(--danger)' : undefined, borderColor: danger ? 'var(--danger)' : undefined }} onClick={onConfirm} disabled={busy}>{busy ? 'Please wait…' : confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}


// Actions dropdown in the header of a saved purchase order (view mode)
function ActionsMenu({ orderId, poNumber, status, relatedSoId, canEdit, canCancel, onEdit, onCancel, onError, xero, onPostXero }: {
  xero?: { show: boolean; canPost: boolean; ready: boolean; info: XeroRowInfo | null }; onPostXero: () => void
  orderId: string; poNumber: string; status: string; relatedSoId: string | null
  canEdit: boolean; canCancel: boolean
  onEdit: () => void; onCancel: () => void
  onError: (message: string) => void
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const cancelled = status.toLowerCase() === 'cancelled'
  const ic = (d: string) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d={d} /></svg>
  const item = (label: string, onClick: (() => void) | null, opts: { danger?: boolean; soon?: boolean; icon?: React.ReactNode } = {}) => (
    <div
      key={label}
      className="fp-item"
      onClick={() => { if (!onClick || opts.soon) return; onClick() }}
      style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: onClick && !opts.soon ? 'pointer' : 'default', opacity: opts.soon ? 0.5 : 1, color: opts.danger ? 'var(--danger)' : undefined }}
    >
      <span style={{ width: 16, display: 'inline-flex', justifyContent: 'center', flexShrink: 0 }}>{opts.icon}</span>
      <span style={{ flex: 1 }}>{label}</span>
      {opts.soon && <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--gray-400)', background: 'var(--gray-100)', borderRadius: 5, padding: '1px 6px' }}>Soon</span>}
    </div>
  )
  const sep = (key: string) => <div key={key} style={{ height: 1, background: 'var(--gray-100)', margin: '5px 0' }} />

  return (
    <div ref={box} style={{ position: 'relative', display: 'inline-block' }}>
      <button className="btn btn-outline" style={{ height: 34, marginLeft: 4 }} onClick={() => setOpen(o => !o)} aria-haspopup="menu" aria-expanded={open}>
        Actions
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
      </button>
      {open && (
        <div className="inv-dropdown" role="menu" style={{ display: 'block', position: 'absolute', right: 0, top: 'calc(100% + 6px)', width: 230, padding: 6, zIndex: 60 }}>
          {canEdit && item('Edit Order', () => { setOpen(false); onEdit() }, { icon: ic('M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z') })}
          {!cancelled && item('Print', async () => {
            setOpen(false)
            const res = await printPurchaseOrder([orderId])
            if (!res.ok) onError(`${poNumber}: ${res.error}`)
          }, { icon: ic('M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z') })}
          {item('Email', null, { soon: true, icon: ic('M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM22 6l-10 7L2 6') })}
          {sep('s1')}
          {item('Clone Order', () => { setOpen(false); router.push(`/purchases/new?clone=${orderId}`) }, { icon: ic('M9 9h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V11a2 2 0 0 1 2-2zM5 15H4a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v1') })}
          {relatedSoId && item('Open Related Order', () => { setOpen(false); router.push(`/sales/${relatedSoId}`) }, { icon: ic('M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71') })}
          {!cancelled && item('Create Sales Order', () => { setOpen(false); router.push(`/sales/new?from_po=${orderId}`) }, { icon: ic('M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0') })}
          {xero?.show && xero.canPost && xero.ready && xero.info?.status !== 'synced' && item('Post bill to Xero', () => { setOpen(false); onPostXero() }, { icon: ic('M16 16l-4-4-4 4M12 12v9M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3') })}
          {xero?.show && xero.info?.status === 'synced' && xero.info.url && item('Open bill in Xero', () => { setOpen(false); window.open(xero.info?.url ?? '', '_blank', 'noopener') }, { icon: ic('M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3') })}
          {item('Order History', () => { setOpen(false); setHistoryOpen(true) }, { icon: ic('M12 8v4l3 3M3.05 11a9 9 0 1 1 .5 4M3 4v5h5') })}
          {canCancel && <>{sep('s2')}{item('Cancel Order', () => { setOpen(false); onCancel() }, { danger: true, icon: ic('M18 6 6 18M6 6l12 12') })}</>}
        </div>
      )}
      {historyOpen && <OrderHistory type="purchase" id={orderId} label={poNumber} onClose={() => setHistoryOpen(false)} />}
    </div>
  )
}

// Opens in view mode (or straight into edit mode from the Purchases list); Edit Order in the Actions menu switches to edit mode.
// "Cancel" while editing discards changes by remounting the form with the saved order.
export default function EditPurchaseOrder(props: Props) {
  const [mode, setMode] = useState<'view' | 'edit'>(props.startInEdit && isEditable(props.order.status) ? 'edit' : 'view')
  const [formKey, setFormKey] = useState(0)
  return (
    <PurchaseOrderForm
      key={formKey}
      {...props}
      mode={mode}
      setMode={setMode}
      onDiscard={() => { setFormKey(k => k + 1); setMode('view') }}
    />
  )
}

function PurchaseOrderForm({
  orgId,
  order,
  relatedSoId,
  suppliers,
  locations,
  products,
  defaultTerms,
  priceLevels = [],
  taxRates = [],
  decimalPlaces = 2,
  stockLevels = [],
  xeroBill,
  mode,
  setMode,
  onDiscard,
}: Props & {
  mode: 'view' | 'edit'
  setMode: (m: 'view' | 'edit') => void
  onDiscard: () => void
}) {
  const router = useRouter()
  const [xeroInfo, setXeroInfo] = useState<XeroRowInfo | null>(xeroBill?.info ?? null)
  const xeroPost = usePostToXero('bill', (_id, info) => { setXeroInfo(info) })

  // ── Tax helpers: lines store the chosen tax (id + name) plus its numeric rate ──
  const taxById = (id: string | null | undefined) => (id ? taxRates.find(t => t.id === id) : undefined)
  const taxByRate = (rate: number) =>
    taxRates.find(t => Number(t.rate) === rate && t.is_default) ?? taxRates.find(t => Number(t.rate) === rate)
  function taxFields(id: string | null | undefined) {
    const t = taxById(id)
    return t
      ? { tax_rate_id: t.id, tax_name: t.name, tax_rate: Number(t.rate) || 0 }
      : { tax_rate_id: null, tax_name: 'No Tax', tax_rate: 0 }
  }
  // Purchase orders use the product's BUY tax rate
  function buyTaxFor(p: Product) {
    const t = taxById(p.buy_tax_rate_id) ?? (p.tax_rate != null && p.tax_rate !== '' ? taxByRate(parseTaxRate(p.tax_rate)) : undefined)
    if (t) return taxFields(t.id)
    const rate = parseTaxRate(p.tax_rate)
    return { tax_rate_id: null, tax_name: rate ? `${rate}%` : 'No Tax', tax_rate: rate }
  }
  // Older lines saved before tax ids existed: resolve a name from the rate
  function withTaxName<T extends { tax_rate: number; tax_rate_id?: string | null; tax_name?: string | null }>(l: T): T {
    if (l.tax_rate_id && l.tax_name) return l
    const t = taxById(l.tax_rate_id) ?? taxByRate(Number(l.tax_rate) || 0)
    return t ? { ...l, tax_rate_id: t.id, tax_name: t.name } : { ...l, tax_name: l.tax_name ?? (Number(l.tax_rate) ? `${l.tax_rate}%` : 'No Tax') }
  }
  const taxOptions = taxRates.map(t => ({ id: t.id, label: t.name }))
  const scrollRef = useRef<HTMLDivElement>(null)
  const statusEditable = isEditable(order.status)
  const editable = statusEditable && mode === 'edit'
  const anyReceived = (order.lines ?? []).some(l => Number(l.quantity_received) > 0)
  const showReceived = anyReceived || !['draft', 'cancelled'].includes(String(order.status ?? '').toLowerCase())
  const badge = statusBadge(order.status)
  const fallbackTerms = defaultTerms ?? 'Net 14'

  // Initialise supplier from order data
  const initialSupplier = order.supplier_id
    ? suppliers.find(s => s.id === order.supplier_id) ?? null
    : null

  // Initialise location from order data
  const initialLocation = order.location_id
    ? locations.find(l => l.id === order.location_id) ?? null
    : null

  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(initialSupplier)
  const [supplierSearch, setSupplierSearch] = useState('')
  const [supplierDropOpen, setSupplierDropOpen] = useState(false)
  const [supplierOrderNum, setSupplierOrderNum] = useState(order.reference ?? '')
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(initialLocation)
  const [locationOpen, setLocationOpen] = useState(false)
  const [orderDate, setOrderDate] = useState(order.order_date ?? new Date().toISOString().split('T')[0])
  const [expectedDate, setExpectedDate] = useState(order.expected_date ?? '')
  const [terms, setTerms] = useState(order.terms ?? fallbackTerms)
  const [termsOpen, setTermsOpen] = useState(false)
  const [notes, setNotes] = useState(order.notes ?? '')
  const [lines, setLines] = useState<LineItem[]>(() => (order.lines ?? []).map(l => withTaxName({ ...l, quantity_ordered: Number(l.quantity_ordered) || 0, unit_cost: Number(l.unit_cost) || 0, discount: Number(l.discount) || 0, tax_rate: Number(l.tax_rate) || 0 })))
  const [costLines, setCostLines] = useState<CostLine[]>(() => (order.cost_lines ?? []).map(l => withTaxName({ ...l, amount: Number(l.amount) || 0, tax_rate: Number(l.tax_rate) || 0 })))
  const [itemSearch, setItemSearch] = useState('')
  const [itemDropOpen, setItemDropOpen] = useState(false)
  const [costSearch, setCostSearch] = useState('')
  const [costDropOpen, setCostDropOpen] = useState(false)
  const [orderDiscountType, setOrderDiscountType] = useState<'%' | '$'>(
    (order.order_discount_type as '%' | '$') ?? '%'
  )
  const [orderDiscount, setOrderDiscount] = useState<number>(Number(order.order_discount) || 0)
  const [supplierPriceLevelId, setSupplierPriceLevelId] = useState<string | null>(
    initialSupplier?.price_level_id ?? null
  )
  const [saving, setSaving] = useState(false)
  const [error, setErrorRaw] = useState<string | null>(null)
  const setError = (m: string | null) => { setErrorRaw(m); if (m) toast.error(m) }
  const [confirmCancelOrder, setConfirmCancelOrder] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  async function cancelOrder() {
    setCancelling(true)
    setError(null)
    try {
      const res = await fetch(`/api/org/purchases/${order.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'Cancelled' }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error ?? 'Could not cancel this order'); return }
      setConfirmCancelOrder(false)
      toast.success('Purchase order cancelled')
      router.refresh()
    } catch {
      setError('Network error — please try again.')
    } finally {
      setCancelling(false)
    }
  }

  const filteredSuppliers = useMemo(() =>
    suppliers.filter(s => s.name.toLowerCase().includes(supplierSearch.toLowerCase())),
    [suppliers, supplierSearch]
  )

  // Stock + NonStock only (exclude Service) for line items
  const filteredProducts = useMemo(() => {
    const q = itemSearch.toLowerCase()
    return products.filter(p =>
      p.type !== 'Service' && (
        !q ||
        p.name.toLowerCase().includes(q) ||
        (p.sku ?? '').toLowerCase().includes(q)
      )
    ).slice(0, 20)
  }, [products, itemSearch])

  // Stock per product for the item picker — selected delivery location, or all locations if none chosen yet
  const stockByProduct = useMemo(() => {
    const map: Record<string, { onHand: number; committed: number; available: number }> = {}
    for (const sl of stockLevels) {
      if (selectedLocation && sl.location_id !== selectedLocation.id) continue
      const m = (map[sl.product_id] ??= { onHand: 0, committed: 0, available: 0 })
      m.onHand += Number(sl.quantity) || 0
      m.committed += Number(sl.committed) || 0
      m.available = m.onHand - m.committed
    }
    return map
  }, [stockLevels, selectedLocation])

  // Service items only for additional costs
  const filteredCostProducts = useMemo(() => {
    const q = costSearch.toLowerCase()
    return products.filter(p =>
      p.type === 'Service' && (
        !q ||
        p.name.toLowerCase().includes(q) ||
        (p.sku ?? '').toLowerCase().includes(q)
      )
    ).slice(0, 20)
  },
    [products, costSearch]
  )

  function selectSupplier(s: Supplier & { price_level_id?: string | null }) {
    setSelectedSupplier(s)
    setTerms(s.terms ?? defaultTerms ?? 'Net 14')
    setSupplierPriceLevelId(s.price_level_id ?? null)
    setSupplierDropOpen(false)
  }

  function resolvePrice(p: Product): number {
    if (supplierPriceLevelId && p.price_levels) {
      const match = p.price_levels.find(pl => pl.price_level_id === supplierPriceLevelId)
      if (match != null) return Number(match.price) || 0
    }
    return Number(p.cost_price) || 0
  }

  function addLine(p: Product) {
    setLines(prev => [...prev, {
      product_id: p.id,
      product_name: p.name,
      product_sku: p.sku ?? '',
      unit: p.buy_uom ?? 'Each',
      quantity_ordered: 1,
      unit_cost: resolvePrice(p),
      discount: 0,
      ...buyTaxFor(p),
      line_notes: '',
    }])
    setItemSearch('')
    setItemDropOpen(false)
  }

  function updateLine(idx: number, field: keyof LineItem, value: string | number) {
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l))
  }

  function setLineTax(idx: number, id: string) {
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, ...taxFields(id) } : l))
  }

  function removeLine(idx: number) {
    setLines(prev => prev.filter((_, i) => i !== idx))
  }

  function addCostLine(p: Product) {
    setCostLines(prev => [...prev, {
      product_id: p.id,
      product_name: p.name,
      product_sku: p.sku ?? '',
      description: p.description ?? '',
      amount: Number(p.cost_price) || 0,
      ...buyTaxFor(p),
    }])
    setCostSearch('')
    setCostDropOpen(false)
  }

  function updateCostLine(idx: number, field: keyof CostLine, value: string | number) {
    setCostLines(prev => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l))
  }

  function setCostLineTax(idx: number, id: string) {
    setCostLines(prev => prev.map((l, i) => i === idx ? { ...l, ...taxFields(id) } : l))
  }

  function removeCostLine(idx: number) {
    setCostLines(prev => prev.filter((_, i) => i !== idx))
  }

  const subtotal = lines.reduce((sum, l) => {
    return sum + l.quantity_ordered * l.unit_cost * (1 - l.discount / 100)
  }, 0)

  const additionalCostsTotal = costLines.reduce((sum, l) => sum + l.amount, 0)

  const preDiscountTotal = subtotal + additionalCostsTotal

  const orderDiscountAmount = orderDiscountType === '%'
    ? preDiscountTotal * (orderDiscount / 100)
    : Math.min(orderDiscount, preDiscountTotal)

  const discountedBase = preDiscountTotal - orderDiscountAmount

  const gstTotal = lines.reduce((sum, l) => {
    const lt = l.quantity_ordered * l.unit_cost * (1 - l.discount / 100)
    const discountFactor = preDiscountTotal > 0 ? discountedBase / preDiscountTotal : 1
    return sum + lt * discountFactor * (l.tax_rate / 100)
  }, 0) + costLines.reduce((sum, l) => {
    const discountFactor = preDiscountTotal > 0 ? discountedBase / preDiscountTotal : 1
    return sum + l.amount * discountFactor * (l.tax_rate / 100)
  }, 0)

  const total = discountedBase + gstTotal

  async function save(newStatus: string) {
    if (!selectedSupplier) { setError('Please select a supplier.'); return }
    if (!selectedLocation) { setError('Please select a delivery location.'); return }
    if (lines.length === 0) { setError('Add at least one line item.'); return }
    setSaving(true)
    setError(null)

    const payload = {
      id: order.id,
      supplier_id: selectedSupplier.id,
      supplier_name: selectedSupplier.name,
      location_id: selectedLocation.id,
      location_name: selectedLocation.name,
      status: newStatus,
      order_date: orderDate,
      expected_date: expectedDate || null,
      reference: supplierOrderNum || null,
      terms,
      notes: notes || null,
      currency: selectedSupplier.currency ?? order.currency ?? 'NZD',
      total_amount: total,
      order_discount: orderDiscount || null,
      order_discount_type: orderDiscount > 0 ? orderDiscountType : null,
      order_discount_amount: orderDiscountAmount > 0 ? orderDiscountAmount : null,
      lines: lines.map((l, i) => ({ ...l, sort_order: i })),
      cost_lines: costLines.map((l, i) => ({ ...l, sort_order: i })),
    }

    try {
      const res = await fetch(`/api/org/purchases/${order.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      setSaving(false)
      if (!res.ok) { setError(data.error ?? 'Something went wrong'); return }
      toast.success('Purchase order saved')
      setMode('view')
      router.refresh()
    } catch {
      setSaving(false)
      setError('Network error — please try again.')
    }
  }

  // Make sure save errors are always visible (they render at the top of the scroll area)
  useEffect(() => {
    if (error) scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [error])

  const closeAll = () => {
    setSupplierDropOpen(false)
    setLocationOpen(false)
    setTermsOpen(false)
    setItemDropOpen(false)
    setCostDropOpen(false)
  }

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      // Close all dropdowns when clicking outside any dropdown wrapper
      // Each dropdown wrapper has onClick={e => e.stopPropagation()} — but we use
      // mousedown on document so timing never conflicts with onFocus
      const insideDropdown = (target as Element)?.closest?.('[data-dropdown]')
      if (!insideDropdown) closeAll()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const statusLower = order.status.toLowerCase()
  const isDraft = statusLower === 'draft'
  const isOpen = statusLower === 'open'
  const isReadOnly = !editable

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ background: 'var(--white)', borderBottom: '1px solid var(--gray-100)', padding: '16px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => router.push('/purchases')} className="sq-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--slate)' }}>
              {order.po_number ?? 'Purchase Order'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 1 }}>
              {order.supplier_name ?? 'No supplier selected'}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {mode === 'edit' && (
            <span style={{ fontSize: 12, color: 'var(--gray-400)', fontFamily: 'var(--font-ui)' }}>Editing</span>
          )}
          <span className={`badge ${statusClass(order.status)}`}>{order.status}</span>
          {xeroInfo?.status === 'synced' && (xeroInfo.url
            ? <a href={xeroInfo.url} target="_blank" rel="noreferrer" title="Open bill in Xero" style={{ textDecoration: 'none' }}><XeroStatusBadge info={xeroInfo} /></a>
            : <XeroStatusBadge info={xeroInfo} />)}
          {mode === 'view' && (
            <ActionsMenu
              orderId={order.id}
              poNumber={order.po_number ?? 'Order'}
              status={order.status}
              relatedSoId={relatedSoId ?? null}
              canEdit={statusEditable}
              canCancel={statusEditable && !anyReceived}
              onEdit={() => { setError(null); setMode('edit') }}
              onCancel={() => setConfirmCancelOrder(true)}
              onError={setError}
              xero={xeroBill ? { ...xeroBill, info: xeroInfo } : undefined}
              onPostXero={() => { setError(null); void xeroPost.post(order.id) }}
            />
          )}
        </div>
      </div>

      {/* Scrollable content */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '24px 28px 100px' }}>

        {error && (
          <div style={{ background: '#FEF2F2', border: '1.5px solid #FECACA', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#B91C1C', marginBottom: 20 }}>{error}</div>
        )}
        <XeroPostNotice message={xeroPost.message} onClose={xeroPost.clearMessage} flush />
        {!xeroPost.message && xeroBill?.show && xeroInfo?.status === 'failed' && (
          <div style={{ background: '#FEF2F2', border: '1.5px solid #FECACA', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#B91C1C', marginBottom: 20 }}>
            The last attempt to post this bill to Xero failed: {xeroInfo.error}
          </div>
        )}

        {!statusEditable && (
          <div style={{ background: '#F8FAFC', border: '1.5px solid var(--gray-200)', borderRadius: 10, padding: '10px 16px', fontSize: 13, color: 'var(--gray-400)', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            This order is <strong style={{ color: 'var(--slate)' }}>{badge.label}</strong> and cannot be edited.
          </div>
        )}

        {/* Row 1: Supplier + Location */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20, alignItems: 'start' }}>

          {/* Supplier card */}
          <div className="npo-card">
            <div className="npo-card-title">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              Supplier
            </div>

            {!selectedSupplier ? (
              editable ? (
                <div style={{ position: 'relative' }} data-dropdown onClick={e => e.stopPropagation()}>
                  <svg style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--gray-400)', pointerEvents: 'none' }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                  <input
                    className="modal-input"
                    placeholder="Search suppliers…"
                    value={supplierSearch}
                    onChange={e => setSupplierSearch(e.target.value)}
                    onFocus={() => setSupplierDropOpen(true)}
                    style={{ paddingLeft: 32, background: 'var(--gray-50)' }}
                    autoComplete="off"
                  />
                  {supplierDropOpen && (
                    <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: 'var(--white)', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 12, boxShadow: 'var(--shadow-lg)', maxHeight: 220, overflowY: 'auto', zIndex: 100, padding: 6 }}>
                      {filteredSuppliers.length === 0 ? (
                        <div style={{ padding: '10px 12px', color: 'var(--gray-400)', fontSize: 13 }}>No suppliers found</div>
                      ) : filteredSuppliers.map(s => (
                        <div key={s.id} className="fp-item" onClick={() => selectSupplier(s)}>
                          <div style={{ fontWeight: 600, color: 'var(--slate)', fontSize: 13 }}>{s.name}</div>
                          {s.email && <div style={{ fontSize: 11, color: 'var(--gray-400)' }}>{s.email}</div>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ fontSize: 13, color: 'var(--gray-400)', padding: '10px 0' }}>No supplier selected</div>
              )
            ) : (
              <div style={{ background: 'var(--teal-surface)', border: '1.5px solid var(--teal-pale)', borderRadius: 12, padding: '14px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: 'var(--slate)', letterSpacing: '-0.02em' }}>{selectedSupplier.name}</div>
                    {selectedSupplier.phone && <div style={{ fontSize: 12.5, color: 'var(--gray-400)', marginTop: 2 }}>{selectedSupplier.phone}</div>}
                    {selectedSupplier.email && <div style={{ fontSize: 12.5, color: 'var(--teal)', marginTop: 2 }}>{selectedSupplier.email}</div>}
                    {selectedSupplier.bill_city && <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 4 }}>{[selectedSupplier.bill_city, selectedSupplier.bill_country].filter(Boolean).join(', ')}</div>}
                  </div>
                  {editable && (
                    <button
                      onClick={() => { setSelectedSupplier(null); setTerms(fallbackTerms); setSupplierPriceLevelId(null) }}
                      style={{ width: 24, height: 24, borderRadius: 6, border: 'none', background: 'rgba(13,148,136,0.15)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--teal)', flexShrink: 0 }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  )}
                </div>
              </div>
            )}

            <div className="modal-field" style={{ marginTop: 12 }}>
              <label className="modal-label">Supplier Order #</label>
              <input
                className="modal-input"
                value={supplierOrderNum}
                onChange={e => setSupplierOrderNum(e.target.value)}
                placeholder="Supplier's reference number"
                style={{ background: 'var(--white)' }}
                readOnly={isReadOnly}
              />
            </div>
          </div>

          {/* Deliver To card */}
          <div className="npo-card">
            <div className="npo-card-title">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
              Deliver To
            </div>

            {!selectedLocation ? (
              editable ? (
                <div className="modal-field" data-dropdown onClick={e => e.stopPropagation()}>
                  <label className="modal-label">Location <span className="req">*</span></label>
                  <div style={{ position: 'relative' }}>
                    <button className="modal-dd-btn" onClick={() => setLocationOpen(o => !o)} type="button" style={{ background: 'var(--white)' }}>
                      <span style={{ color: 'var(--gray-400)' }}>Select location…</span>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
                    </button>
                    {locationOpen && (
                      <div className="inv-dropdown filter-pick-dropdown" style={{ display: 'block', minWidth: 220 }}>
                        <div className="col-dropdown-title">Deliver To</div>
                        {locations.map(l => (
                          <div key={l.id} className="fp-item" onClick={() => { setSelectedLocation(l); setLocationOpen(false) }}>{l.name}</div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 13, color: 'var(--gray-400)', padding: '10px 0' }}>No location selected</div>
              )
            ) : (
              <div style={{ background: 'var(--teal-surface)', border: '1.5px solid var(--teal-pale)', borderRadius: 12, padding: '14px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: 'var(--slate)', letterSpacing: '-0.02em' }}>{selectedLocation.name}</div>
                    {selectedLocation.phone && <div style={{ fontSize: 12.5, color: 'var(--gray-400)', marginTop: 2 }}>{selectedLocation.phone}</div>}
                    {selectedLocation.email && <div style={{ fontSize: 12.5, color: 'var(--teal)', marginTop: 2 }}>{selectedLocation.email}</div>}
                    {(selectedLocation.address || selectedLocation.city) && (
                      <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 4 }}>
                        {[selectedLocation.address, selectedLocation.city, selectedLocation.country].filter(Boolean).join(', ')}
                      </div>
                    )}
                  </div>
                  {editable && (
                    <button
                      onClick={() => setSelectedLocation(null)}
                      style={{ width: 24, height: 24, borderRadius: 6, border: 'none', background: 'rgba(13,148,136,0.15)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--teal)', flexShrink: 0 }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Order Details card */}
        <div className="npo-card" style={{ marginBottom: 20 }}>
          <div className="npo-card-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            Order Details
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginTop: 4 }}>
            <div className="modal-field">
              <label className="modal-label">Order Date <span className="req">*</span></label>
              <input
                className="modal-input"
                type="date"
                value={orderDate}
                onChange={e => setOrderDate(e.target.value)}
                style={{ background: 'var(--white)' }}
                readOnly={isReadOnly}
              />
            </div>
            <div className="modal-field">
              <label className="modal-label">Expected Delivery</label>
              <input
                className="modal-input"
                type="date"
                value={expectedDate}
                onChange={e => setExpectedDate(e.target.value)}
                style={{ background: 'var(--white)' }}
                readOnly={isReadOnly}
              />
            </div>
            <div className="modal-field" data-dropdown onClick={e => e.stopPropagation()}>
              <label className="modal-label">Payment Terms</label>
              {editable ? (
                <div style={{ position: 'relative' }}>
                  <button className="modal-dd-btn" onClick={() => setTermsOpen(o => !o)} type="button" style={{ background: 'var(--white)' }}>
                    <span>{terms}</span>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
                  </button>
                  {termsOpen && (
                    <div className="inv-dropdown filter-pick-dropdown" style={{ display: 'block', minWidth: 160 }}>
                      <div className="col-dropdown-title">Payment Terms</div>
                      {['Net 7', 'Net 14', 'Net 30', 'Net 60', 'COD', 'Prepaid'].map(t => (
                        <div key={t} className={`fp-item${terms === t ? ' active' : ''}`} onClick={() => { setTerms(t); setTermsOpen(false) }}>{t}</div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="modal-input" style={{ background: 'var(--gray-50)', color: 'var(--slate)', cursor: 'default' }}>{terms || '—'}</div>
              )}
            </div>
            <div className="modal-field" style={{ gridColumn: 'span 3' }}>
              <label className="modal-label">Comments / Notes</label>
              <textarea
                className="modal-input"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={2}
                placeholder="Internal notes or instructions for this order…"
                style={{ resize: 'vertical', height: 60, lineHeight: 1.5, background: 'var(--white)' }}
                readOnly={isReadOnly}
              />
            </div>
          </div>
        </div>

        {/* Line Items card */}
        <div className="npo-card" style={{ overflow: 'visible' }}>
          <div className="npo-card-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
            Line Items
          </div>
          <div style={{ overflowX: 'auto', margin: '0 -20px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
              <thead>
                <tr style={{ background: 'var(--gray-50)' }}>
                  <th className="li-th" style={{ width: 120 }}>SKU</th>
                  <th className="li-th">Product Name</th>
                  <th className="li-th" style={{ width: 70, textAlign: 'center' }}>Unit</th>
                  <th className="li-th" style={{ width: 80, textAlign: 'right' }}>Qty</th>
                  {showReceived && <th className="li-th" style={{ width: 90, textAlign: 'right' }}>Received</th>}
                  <th className="li-th" style={{ width: 100, textAlign: 'right' }}>Cost Price</th>
                  <th className="li-th" style={{ width: 80, textAlign: 'right' }}>Disc %</th>
                  <th className="li-th" style={{ width: 140 }}>Tax</th>
                  <th className="li-th" style={{ width: 110, textAlign: 'right' }}>Line Total</th>
                  {editable && <th className="li-th" style={{ width: 36 }} />}
                </tr>
              </thead>
              <tbody>
                {lines.length === 0 && (
                  <tr>
                    <td colSpan={(editable ? 9 : 8) + (showReceived ? 1 : 0)} style={{ textAlign: 'center', padding: '24px 0', color: 'var(--gray-400)', fontSize: 13 }}>
                      {editable ? 'No items added. Search below to add products.' : 'No line items on this order.'}
                    </td>
                  </tr>
                )}
                {lines.map((l, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid var(--gray-100)' }}>
                    <td className="li-td"><span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--gray-400)' }}>{l.product_sku}</span></td>
                    <td className="li-td"><span style={{ fontWeight: 600, color: 'var(--slate)', fontSize: 13 }}>{l.product_name}</span></td>
                    <td className="li-td" style={{ textAlign: 'center' }}>
                      {editable
                        ? <input className="li-input" value={l.unit} onChange={e => updateLine(idx, 'unit', e.target.value)} style={{ width: 60, textAlign: 'center' }} />
                        : <span style={{ fontSize: 13 }}>{l.unit}</span>
                      }
                    </td>
                    <td className="li-td" style={{ textAlign: 'right' }}>
                      {editable
                        ? <NumInput className="li-input right" value={l.quantity_ordered} onChange={n => updateLine(idx, 'quantity_ordered', n)} min={0} style={{ width: 70, textAlign: 'right' }} />
                        : <span style={{ fontSize: 13 }}>{l.quantity_ordered}</span>
                      }
                    </td>
                    {showReceived && (
                      <td className="li-td" style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: Number(l.quantity_received) > 0 ? (Number(l.quantity_received) >= l.quantity_ordered ? '#059669' : '#B45309') : 'var(--gray-400)' }}>{Number(l.quantity_received) || 0}</span>
                      </td>
                    )}
                    <td className="li-td" style={{ textAlign: 'right' }}>
                      {editable
                        ? <NumInput className="li-input right" value={l.unit_cost} onChange={n => updateLine(idx, 'unit_cost', n)} decimals={decimalPlaces} min={0} style={{ width: 90, textAlign: 'right' }} />
                        : <span style={{ fontSize: 13, fontFamily: 'var(--font-display)' }}>{fmtMoney(l.unit_cost)}</span>
                      }
                    </td>
                    <td className="li-td" style={{ textAlign: 'right' }}>
                      {editable
                        ? <NumInput className="li-input right" value={l.discount} onChange={n => updateLine(idx, 'discount', n)} min={0} max={100} style={{ width: 70, textAlign: 'right' }} />
                        : <span style={{ fontSize: 13 }}>{l.discount}%</span>
                      }
                    </td>
                    <td className="li-td">
                      {editable
                        ? <TaxSelect value={l.tax_rate_id} label={l.tax_name} options={taxOptions} onChange={id => setLineTax(idx, id)} />
                        : <span style={{ fontSize: 13 }}>{l.tax_name ?? `${l.tax_rate}%`}</span>
                      }
                    </td>
                    <td className="li-td" style={{ textAlign: 'right', fontWeight: 600, color: 'var(--slate)', fontFamily: 'var(--font-display)' }}>
                      {fmtMoney(lineTotal(l))}
                    </td>
                    {editable && (
                      <td className="li-td">
                        <button
                          onClick={() => removeLine(idx)}
                          style={{ width: 26, height: 26, borderRadius: 7, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--gray-400)' }}
                          onMouseOver={e => (e.currentTarget.style.color = 'var(--danger)')}
                          onMouseOut={e => (e.currentTarget.style.color = 'var(--gray-400)')}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Add item search — only when editable */}
          {editable && (
            <div style={{ padding: '10px 0 2px', position: 'relative' }} data-dropdown onClick={e => e.stopPropagation()}>
              <div style={{ position: 'relative' }}>
                <svg style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--gray-400)', pointerEvents: 'none', zIndex: 1 }} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input
                  className="modal-input"
                  placeholder="Search by SKU or name to add products…"
                  value={itemSearch}
                  onChange={e => { setItemSearch(e.target.value); setItemDropOpen(true) }}
                  onFocus={() => setItemDropOpen(true)}
                  style={{ paddingLeft: 32, background: 'var(--gray-50)', width: '100%' }}
                  autoComplete="off"
                />
              </div>
              {itemDropOpen && (
                <div style={{ position: 'absolute', top: 'calc(100% - 4px)', left: 0, right: 0, background: 'var(--white)', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 14, boxShadow: 'var(--shadow-lg)', zIndex: 200, overflow: 'hidden' }}>
                  {filteredProducts.length > 0 ? (
                    <>
                      <div style={{ display: 'grid', gridTemplateColumns: PICK_COLS, gap: 8, padding: '8px 20px 6px', background: 'var(--gray-50)', borderBottom: '1px solid var(--gray-100)' }}>
                      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'var(--gray-400)', fontFamily: 'var(--font-ui)' }}>SKU</span>
                      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'var(--gray-400)', fontFamily: 'var(--font-ui)' }}>Product</span>
                      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'var(--gray-400)', fontFamily: 'var(--font-ui)', textAlign: 'center' }}>Unit</span>
                      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'var(--gray-400)', fontFamily: 'var(--font-ui)', textAlign: 'right' }} title={selectedLocation ? `At ${selectedLocation.name}` : 'All locations'}>Available</span>
                      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'var(--gray-400)', fontFamily: 'var(--font-ui)', textAlign: 'right' }}>Committed</span>
                      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'var(--gray-400)', fontFamily: 'var(--font-ui)', textAlign: 'right' }}>Price</span>
                    </div>
                      <div style={{ maxHeight: 260, overflowY: 'auto', padding: 6 }}>
                        {filteredProducts.map(p => (
                          <div key={p.id} className="fp-item" style={{ display: 'grid', gridTemplateColumns: PICK_COLS, alignItems: 'center', gap: 8 }} onClick={() => addLine(p)}>
                          <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--gray-400)' }}>{p.sku ?? '—'}</span>
                          <span style={{ fontWeight: 600, color: 'var(--slate)', fontSize: 13 }}>{p.name}</span>
                          <span style={{ fontSize: 12, color: 'var(--gray-400)', textAlign: 'center' }}>{p.buy_uom ?? 'Each'}</span>
                          {(() => {
                            const st = stockByProduct[p.id] ?? { onHand: 0, committed: 0, available: 0 }
                            const tracked = p.track_stock !== false && p.type === 'Stock'
                            return (
                              <>
                                <span style={{ fontSize: 13, fontWeight: 600, textAlign: 'right', color: !tracked ? 'var(--gray-400)' : st.available <= 0 ? 'var(--danger)' : '#059669' }}>{tracked ? st.available : '—'}</span>
                                <span style={{ fontSize: 13, textAlign: 'right', color: 'var(--gray-400)' }}>{tracked ? st.committed : '—'}</span>
                              </>
                            )
                          })()}
                          <span style={{ fontSize: 13, color: 'var(--teal)', fontWeight: 600, textAlign: 'right' }}>{p.cost_price ? `$${Number(p.cost_price).toFixed(decimalPlaces)}` : '—'}</span>
                        </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div style={{ padding: '14px 16px', fontSize: 13, color: 'var(--gray-400)' }}>
                      {itemSearch ? `No products matching "${itemSearch}"` : 'No products available'}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Additional Costs */}
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px dashed var(--gray-200)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--gray-400)' }}><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--slate)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>Additional Costs</span>
              <span style={{ fontSize: 11, color: 'var(--gray-400)' }}>Freight, packing and other service charges</span>
            </div>

            {costLines.length > 0 && (
              <div style={{ overflowX: 'auto', margin: '0 -20px', marginBottom: 8 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
                  <thead>
                    <tr style={{ background: 'var(--gray-50)' }}>
                      <th className="li-th" style={{ width: 120 }}>SKU</th>
                      <th className="li-th">Name</th>
                      <th className="li-th">Description</th>
                      <th className="li-th" style={{ width: 110, textAlign: 'right' }}>Amount</th>
                      <th className="li-th" style={{ width: 140 }}>Tax</th>
                      <th className="li-th" style={{ width: 110, textAlign: 'right' }}>Line Total</th>
                      {editable && <th className="li-th" style={{ width: 36 }} />}
                    </tr>
                  </thead>
                  <tbody>
                    {costLines.map((l, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid var(--gray-100)' }}>
                        <td className="li-td"><span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--gray-400)' }}>{l.product_sku}</span></td>
                        <td className="li-td"><span style={{ fontWeight: 600, color: 'var(--slate)', fontSize: 13 }}>{l.product_name}</span></td>
                        <td className="li-td">
                          {editable
                            ? <input className="li-input" value={l.description} onChange={e => updateCostLine(idx, 'description', e.target.value)} placeholder="Optional description…" style={{ width: '100%', minWidth: 160 }} />
                            : <span style={{ fontSize: 13, color: 'var(--gray-400)' }}>{l.description || '—'}</span>
                          }
                        </td>
                        <td className="li-td" style={{ textAlign: 'right' }}>
                          {editable
                            ? <NumInput className="li-input right" value={l.amount} onChange={n => updateCostLine(idx, 'amount', n)} decimals={decimalPlaces} min={0} style={{ width: 90, textAlign: 'right' }} />
                            : <span style={{ fontSize: 13, fontFamily: 'var(--font-display)' }}>{fmtMoney(l.amount)}</span>
                          }
                        </td>
                        <td className="li-td">
                          {editable
                            ? <TaxSelect value={l.tax_rate_id} label={l.tax_name} options={taxOptions} onChange={id => setCostLineTax(idx, id)} />
                            : <span style={{ fontSize: 13 }}>{l.tax_name ?? `${l.tax_rate}%`}</span>
                          }
                        </td>
                        <td className="li-td" style={{ textAlign: 'right', fontWeight: 600, color: 'var(--slate)', fontFamily: 'var(--font-display)' }}>
                          {fmtMoney(l.amount * (1 + l.tax_rate / 100))}
                        </td>
                        {editable && (
                          <td className="li-td">
                            <button
                              onClick={() => removeCostLine(idx)}
                              style={{ width: 26, height: 26, borderRadius: 7, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--gray-400)' }}
                              onMouseOver={e => (e.currentTarget.style.color = 'var(--danger)')}
                              onMouseOut={e => (e.currentTarget.style.color = 'var(--gray-400)')}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Cost item search — only when editable */}
            {editable && (
              <div style={{ position: 'relative' }} data-dropdown onClick={e => e.stopPropagation()}>
                <div style={{ position: 'relative' }}>
                  <svg style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--gray-400)', pointerEvents: 'none', zIndex: 1 }} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                  <input
                    className="modal-input"
                    placeholder="Search by SKU or name to add costs…"
                    value={costSearch}
                    onChange={e => { setCostSearch(e.target.value); setCostDropOpen(true) }}
                    onFocus={() => setCostDropOpen(true)}
                    style={{ paddingLeft: 32, background: 'var(--gray-50)', width: '100%' }}
                    autoComplete="off"
                  />
                </div>
                {costDropOpen && (
                  <div style={{ position: 'absolute', top: 'calc(100% - 4px)', left: 0, right: 0, background: 'var(--white)', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 14, boxShadow: 'var(--shadow-lg)', zIndex: 200, overflow: 'hidden' }}>
                    {filteredCostProducts.length > 0 ? (
                      <>
                        <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr auto', padding: '8px 14px 6px', background: 'var(--gray-50)', borderBottom: '1px solid var(--gray-100)' }}>
                          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'var(--gray-400)', fontFamily: 'var(--font-ui)' }}>SKU</span>
                          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'var(--gray-400)', fontFamily: 'var(--font-ui)' }}>Service</span>
                          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'var(--gray-400)', fontFamily: 'var(--font-ui)', textAlign: 'right' }}>Price</span>
                        </div>
                        <div style={{ maxHeight: 220, overflowY: 'auto', padding: 6 }}>
                          {filteredCostProducts.map(p => (
                            <div key={p.id} className="fp-item" style={{ display: 'grid', gridTemplateColumns: '100px 1fr auto', alignItems: 'center', gap: 8 }} onClick={() => addCostLine(p)}>
                              <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--gray-400)' }}>{p.sku ?? '—'}</span>
                              <span style={{ fontWeight: 600, color: 'var(--slate)', fontSize: 13 }}>{p.name}</span>
                              <span style={{ fontSize: 13, color: 'var(--teal)', fontWeight: 600, textAlign: 'right' }}>{p.cost_price ? `$${Number(p.cost_price).toFixed(2)}` : '—'}</span>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <div style={{ padding: '14px 16px', fontSize: 13, color: 'var(--gray-400)' }}>
                        {costSearch ? `No services matching "${costSearch}"` : 'No service products available'}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Totals */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--gray-100)' }}>
            <div style={{ minWidth: 300, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--gray-400)' }}>
                <span>Subtotal</span>
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, color: 'var(--slate)' }}>{fmtMoney(subtotal)}</span>
              </div>
              {additionalCostsTotal > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--gray-400)' }}>
                  <span>Additional Costs</span>
                  <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, color: 'var(--slate)' }}>{fmtMoney(additionalCostsTotal)}</span>
                </div>
              )}
              {/* Order-level discount */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, color: 'var(--gray-400)' }} onClick={e => e.stopPropagation()}>
                <span>Order Discount</span>
                {editable ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <NumInput
                    value={orderDiscount}
                    onChange={setOrderDiscount}
                    decimals={orderDiscountType === '$' ? decimalPlaces : undefined}
                    min={0}
                    max={orderDiscountType === '%' ? 100 : undefined}
                    blankWhenZero
                    placeholder="0"
                    style={{ width: 70, textAlign: 'right', border: '1px solid var(--gray-200)', borderRadius: 6, padding: '3px 7px', fontSize: 13, fontFamily: 'var(--font-display)', color: 'var(--slate)', background: 'var(--white)', outline: 'none' }}
                    />
                    <button
                      onClick={() => setOrderDiscountType(t => t === '%' ? '$' : '%')}
                      style={{ width: 30, height: 28, borderRadius: 6, border: '1px solid var(--gray-200)', background: 'var(--gray-50)', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: 'var(--slate)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      title="Toggle discount type"
                    >{orderDiscountType}</button>
                    {orderDiscountAmount > 0 && (
                      <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, color: 'var(--danger)', minWidth: 60, textAlign: 'right' }}>−{fmtMoney(orderDiscountAmount)}</span>
                    )}
                  </div>
                ) : (
                  <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, color: orderDiscountAmount > 0 ? 'var(--danger)' : 'var(--slate)' }}>
                    {orderDiscountAmount > 0 ? `−${fmtMoney(orderDiscountAmount)}` : '—'}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--gray-400)' }}>
                <span>Tax</span>
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, color: 'var(--slate)' }}>{fmtMoney(gstTotal)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--slate)', letterSpacing: '-0.02em', paddingTop: 6, borderTop: '2px solid var(--slate)' }}>
                <span>Total</span>
                <span>{fmtMoney(total)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom action bar */}
      <div style={{ background: 'var(--white)', borderTop: '1px solid var(--gray-100)', padding: '14px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 -4px 16px rgba(0,0,0,0.06)', flexShrink: 0 }}>
        {mode === 'edit' ? (
          <button onClick={() => setConfirmDiscard(true)} className="btn btn-outline" style={{ height: 38 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            Cancel
          </button>
        ) : (
          <button onClick={() => router.push('/purchases')} className="btn btn-outline" style={{ height: 38 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
            Back to Purchases
          </button>
        )}
        {error && <div style={{ flex: 1, margin: '0 16px', fontSize: 12.5, color: '#B91C1C', textAlign: 'right' }}>{error}</div>}

        {/* View mode actions */}
        {mode === 'view' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {isDraft && (
              <button className="btn btn-primary" style={{ height: 38, padding: '0 20px', fontSize: 14 }} onClick={() => save('Open')} disabled={saving}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                {saving ? 'Submitting…' : 'Submit Order'}
              </button>
            )}
            {(isOpen || statusLower === 'partially received') && (
              <button
                className="btn btn-primary"
                style={{ height: 38, padding: '0 20px', fontSize: 14 }}
                onClick={() => router.push(`/purchases/${order.id}/receive`)}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3 15v4c0 1.1.9 2 2 2h14a2 2 0 0 0 2-2v-4"/><polyline points="17 9 12 14 7 9"/><line x1="12" y1="14" x2="12" y2="3"/></svg>
                Receive Stock
              </button>
            )}
          </div>
        )}

        {/* Edit mode actions */}
        {mode === 'edit' && isDraft && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button className="btn btn-outline" style={{ height: 38 }} onClick={() => save('Draft')} disabled={saving}>
              {saving ? 'Saving…' : 'Save Draft'}
            </button>
            <button className="btn btn-primary" style={{ height: 38, padding: '0 20px', fontSize: 14 }} onClick={() => save('Open')} disabled={saving}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              {saving ? 'Submitting…' : 'Submit Order'}
            </button>
          </div>
        )}
        {mode === 'edit' && isOpen && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button className="btn btn-primary" style={{ height: 38, padding: '0 20px', fontSize: 14 }} onClick={() => save('Open')} disabled={saving}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        )}
      </div>

      {confirmCancelOrder && (
        <ConfirmModal
          title="Cancel purchase order?"
          message={`Are you sure you want to cancel ${order.po_number ?? 'this purchase order'}? It will move to Cancelled and its quantities will no longer show as On Order.`}
          confirmLabel="Yes, cancel order"
          danger
          busy={cancelling}
          onConfirm={cancelOrder}
          onCancel={() => setConfirmCancelOrder(false)}
        />
      )}
      {confirmDiscard && (
        <ConfirmModal
          title="Discard changes?"
          message="Are you sure you want to cancel? Any changes you've made will be lost."
          confirmLabel="Yes, discard"
          cancelLabel="Keep editing"
          danger
          onConfirm={() => { setConfirmDiscard(false); onDiscard() }}
          onCancel={() => setConfirmDiscard(false)}
        />
      )}
    </div>
  )
}
