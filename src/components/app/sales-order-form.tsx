'use client'

// New / view / edit sales order — built to behave like the purchase order screens.
// New order  : <SalesOrderForm … />                     (starts in edit mode)
// Saved order: <SalesOrderForm order={…} … />           (opens in view mode, Edit button switches to edit)

import { useState, useMemo, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import NumInput from '@/components/app/num-input'
import TaxSelect from '@/components/app/tax-select'

type Customer = {
  id: string
  name: string
  email: string | null
  phone: string | null
  bill_street: string | null
  bill_city: string | null
  bill_country: string | null
  terms: string | null
  currency: string | null
  price_level_id: string | null
  default_location: string | null
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

type ProductPrice = { price_level_id: string; price: number; break_qty: number }

type Product = {
  id: string
  name: string
  sku: string | null
  sell_uom: string | null
  sell_price: number | null
  sell_tax_rate_id?: string | null
  tax_rate: string | number | null
  description: string | null
  track_stock: boolean | null
  type: string
  price_levels?: ProductPrice[]
}

type StockLevel = {
  product_id: string
  location_id: string
  quantity: number | string | null
  committed: number | string | null
}

type TaxRate = { id: string; name: string; rate: number; is_default?: boolean | null }
type PriceLevel = { id: string; name: string; is_default?: boolean | null }

type LineItem = {
  id?: string
  product_id: string
  product_name: string
  product_sku: string
  unit: string
  quantity: number
  unit_price: number
  discount: number
  tax_rate: number
  tax_rate_id?: string | null
  tax_name?: string | null
  line_notes: string
  quantity_picked?: number | null
  _manual?: boolean // price typed by hand — price level changes leave it alone
}

type ChargeLine = {
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

export type SalesOrder = {
  id: string
  so_number: string | null
  status: string
  customer_id: string | null
  customer_name: string | null
  location_id: string | null
  location_name: string | null
  order_date: string | null
  expected_date: string | null
  terms: string | null
  notes: string | null
  ref: string | null
  currency: string | null
  price_level_id: string | null
  total_amount: number | null
  order_discount: number | null
  order_discount_type: string | null
  order_discount_amount: number | null
  lines: LineItem[]
  cost_lines: ChargeLine[]
}

type Props = {
  orgId: string
  order?: SalesOrder | null
  customers: Customer[]
  locations: Location[]
  products: Product[]
  defaultTerms?: string | null
  defaultLocationId?: string | null
  priceLevels?: PriceLevel[]
  taxRates?: TaxRate[]
  currencies?: string[]
  baseCurrency?: string
  decimalPlaces?: number
  stockLevels?: StockLevel[]
  fulfilmentMode?: string // 'full' | 'pick-only' | 'none' (Settings → Sales)
}

// Item picker columns: SKU | Product | Unit | Available | Committed | Price
const PICK_COLS = '110px minmax(160px, 1fr) 70px 80px 85px 90px'
const TERMS = ['Net 7', 'Net 14', 'Net 30', 'Net 60', 'COD', 'Prepaid']

function fmtMoney(n: number) {
  return `$${n.toFixed(2)}`
}

function parseTaxRate(v: string | number | null | undefined): number {
  if (v == null || v === '') return 0
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  const n = Number(v)
  if (Number.isFinite(n)) return n
  const m = String(v).match(/(\d+(?:\.\d+)?)\s*%/)
  return m ? parseFloat(m[1]) : 0
}

function lineTotal(l: LineItem) {
  return l.quantity * l.unit_price * (1 - l.discount / 100)
}

// Statuses: Draft → Open → Picking → Closed (or Cancelled). Older stock-based statuses fold into Open / Picking.
const OPEN_GROUP = ['open', 'no stock', 'stock available', 'partial stock']
const PICKING_GROUP = ['picking', 'partially picked', 'picked', 'partially packed', 'packed']

function displayStatus(status: string) {
  const s = status.toLowerCase()
  if (OPEN_GROUP.includes(s)) return 'Open'
  if (PICKING_GROUP.includes(s)) return 'Picking'
  if (s === 'draft') return 'Draft'
  if (s === 'closed') return 'Closed'
  if (s === 'cancelled') return 'Cancelled'
  return status
}

function statusClass(status: string) {
  switch (displayStatus(status)) {
    case 'Open': return 'badge-open'
    case 'Picking': return 'badge-partial'
    case 'Closed': return 'badge-closed'
    case 'Cancelled': return 'badge-cancelled'
    default: return 'badge-draft'
  }
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

// Dropdown in the same style as the rest of the app (modal-dd-btn + inv-dropdown)
function Dd({ label, value, options, onPick, open, setOpen, disabled, placeholder }: {
  label: string
  value: string
  options: { id: string; label: string }[]
  onPick: (id: string) => void
  open: boolean
  setOpen: (o: boolean) => void
  disabled?: boolean
  placeholder?: string
}) {
  return (
    <div className="modal-field" data-dropdown onClick={e => e.stopPropagation()}>
      <label className="modal-label">{label}</label>
      <div style={{ position: 'relative' }}>
        <button className="modal-dd-btn" type="button" disabled={disabled} onClick={() => setOpen(!open)} style={{ background: disabled ? 'var(--gray-50)' : 'var(--white)', cursor: disabled ? 'default' : 'pointer' }}>
          <span style={{ color: value ? undefined : 'var(--gray-400)' }}>{value || placeholder || 'Select…'}</span>
          {!disabled && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>}
        </button>
        {open && !disabled && (
          <div className="inv-dropdown filter-pick-dropdown" style={{ display: 'block', minWidth: 170 }}>
            <div className="col-dropdown-title">{label}</div>
            {options.map(o => (
              <div key={o.id} className={`fp-item${o.label === value ? ' active' : ''}`} onClick={() => { onPick(o.id); setOpen(false) }}>{o.label}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// Opens in view mode for saved orders; "Cancel" while editing discards changes by remounting with the saved order.
export default function SalesOrderForm(props: Props) {
  const [mode, setMode] = useState<'view' | 'edit'>(props.order ? 'view' : 'edit')
  const [formKey, setFormKey] = useState(0)
  return (
    <SalesOrderFormInner
      key={formKey}
      {...props}
      mode={mode}
      setMode={setMode}
      onDiscard={() => { setFormKey(k => k + 1); setMode('view') }}
    />
  )
}

function SalesOrderFormInner({
  order,
  customers,
  locations,
  products,
  defaultTerms,
  defaultLocationId,
  priceLevels = [],
  taxRates = [],
  currencies = [],
  baseCurrency = 'NZD',
  decimalPlaces = 2,
  stockLevels = [],
  fulfilmentMode = 'full',
  mode,
  setMode,
  onDiscard,
}: Props & {
  mode: 'view' | 'edit'
  setMode: (m: 'view' | 'edit') => void
  onDiscard: () => void
}) {
  const router = useRouter()
  const isNew = !order

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
  // Sales orders use the product's SELL tax rate
  function sellTaxFor(p: Product) {
    const t = taxById(p.sell_tax_rate_id) ?? (p.tax_rate != null && p.tax_rate !== '' ? taxByRate(parseTaxRate(p.tax_rate)) : undefined)
    if (t) return taxFields(t.id)
    const rate = parseTaxRate(p.tax_rate)
    return { tax_rate_id: null, tax_name: rate ? `${rate}%` : 'No Tax', tax_rate: rate }
  }
  function withTaxName<T extends { tax_rate: number; tax_rate_id?: string | null; tax_name?: string | null }>(l: T): T {
    if (l.tax_rate_id && l.tax_name) return l
    const t = taxById(l.tax_rate_id) ?? taxByRate(Number(l.tax_rate) || 0)
    return t ? { ...l, tax_rate_id: t.id, tax_name: t.name } : { ...l, tax_name: l.tax_name ?? (Number(l.tax_rate) ? `${l.tax_rate}%` : 'No Tax') }
  }
  const taxOptions = taxRates.map(t => ({ id: t.id, label: t.name }))
  const scrollRef = useRef<HTMLDivElement>(null)

  const statusLower = (order?.status ?? 'draft').toLowerCase()
  const anyPicked = (order?.lines ?? []).some(l => Number(l.quantity_picked) > 0)
  const statusEditable = isNew || (['draft', ...OPEN_GROUP].includes(statusLower) && !anyPicked)
  const editable = statusEditable && mode === 'edit'
  const isDraft = isNew || statusLower === 'draft'
  const shownStatus = displayStatus(order?.status ?? 'Draft')
  const fallbackTerms = defaultTerms ?? 'Net 14'

  const initialCustomer = order?.customer_id ? customers.find(c => c.id === order.customer_id) ?? null : null
  const initialLocation = order?.location_id
    ? locations.find(l => l.id === order.location_id) ?? null
    : isNew && defaultLocationId ? locations.find(l => l.id === defaultLocationId) ?? null : null

  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(initialCustomer)
  const [customerSearch, setCustomerSearch] = useState('')
  const [customerDropOpen, setCustomerDropOpen] = useState(false)
  const [customerRef, setCustomerRef] = useState(order?.ref ?? '')
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(initialLocation)
  const [orderDate, setOrderDate] = useState(order?.order_date ?? new Date().toISOString().split('T')[0])
  const [expectedDate, setExpectedDate] = useState(order?.expected_date ?? '')
  const [terms, setTerms] = useState(order?.terms ?? fallbackTerms)
  const [currency, setCurrency] = useState(order?.currency ?? initialCustomer?.currency ?? baseCurrency)
  const [priceLevelId, setPriceLevelId] = useState<string | null>(order ? order.price_level_id : null)
  const [openDd, setOpenDd] = useState<null | 'location' | 'terms' | 'level' | 'currency'>(null)
  const [notes, setNotes] = useState(order?.notes ?? '')
  const [lines, setLines] = useState<LineItem[]>(() =>
    (order?.lines ?? []).map(l => withTaxName({
      ...l,
      quantity: Number(l.quantity) || 0,
      unit_price: Number(l.unit_price) || 0,
      discount: Number(l.discount) || 0,
      tax_rate: Number(l.tax_rate) || 0,
      line_notes: l.line_notes ?? '',
      _manual: true, // saved prices are kept as they are
    })))
  const [charges, setCharges] = useState<ChargeLine[]>(() =>
    (order?.cost_lines ?? []).map(l => withTaxName({ ...l, amount: Number(l.amount) || 0, tax_rate: Number(l.tax_rate) || 0, description: l.description ?? '' })))
  const [itemSearch, setItemSearch] = useState('')
  const [itemDropOpen, setItemDropOpen] = useState(false)
  const [chargeSearch, setChargeSearch] = useState('')
  const [chargeDropOpen, setChargeDropOpen] = useState(false)
  const [orderDiscountType, setOrderDiscountType] = useState<'%' | '$'>((order?.order_discount_type as '%' | '$') ?? '%')
  const [orderDiscount, setOrderDiscount] = useState<number>(Number(order?.order_discount) || 0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [confirmCancelOrder, setConfirmCancelOrder] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)
  const [closing, setClosing] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  const currencyOptions = useMemo(() => {
    const codes = Array.from(new Set([baseCurrency, ...currencies, currency, selectedCustomer?.currency ?? ''].filter(Boolean)))
    return codes.map(c => ({ id: c, label: c }))
  }, [baseCurrency, currencies, currency, selectedCustomer])

  const levelOptions = [{ id: '', label: 'Standard price' }, ...priceLevels.map(l => ({ id: l.id, label: l.name }))]
  const levelName = priceLevels.find(l => l.id === priceLevelId)?.name ?? 'Standard price'

  const filteredCustomers = useMemo(() =>
    customers.filter(c => c.name.toLowerCase().includes(customerSearch.toLowerCase())),
    [customers, customerSearch])

  const productById = useMemo(() => new Map(products.map(p => [p.id, p])), [products])

  // Stock + non-stock items for lines (services go under Additional Charges)
  const filteredProducts = useMemo(() => {
    const q = itemSearch.toLowerCase()
    return products.filter(p =>
      p.type !== 'Service' && (!q || p.name.toLowerCase().includes(q) || (p.sku ?? '').toLowerCase().includes(q))
    ).slice(0, 20)
  }, [products, itemSearch])

  const filteredChargeProducts = useMemo(() => {
    const q = chargeSearch.toLowerCase()
    return products.filter(p =>
      p.type === 'Service' && (!q || p.name.toLowerCase().includes(q) || (p.sku ?? '').toLowerCase().includes(q))
    ).slice(0, 20)
  }, [products, chargeSearch])

  // Stock per product for the picker — at the ship-from location, or all locations until one is chosen
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

  // Line stock in view mode: does the ship-from location hold any of this item?
  const showStock = !isNew && mode === 'view' && !['closed', 'shipped', 'delivered', 'cancelled'].includes(statusLower)
  function lineStock(l: LineItem): 'in' | 'no' | null {
    const p = products.find(x => x.id === l.product_id)
    if (!p || p.type === 'Service' || p.track_stock === false) return null
    return (stockByProduct[l.product_id]?.onHand ?? 0) > 0 ? 'in' : 'no'
  }
  const pickMode = fulfilmentMode === 'full' || fulfilmentMode === 'pick-only'
  const inPicking = ['picking', 'partially picked', 'picked'].includes(statusLower)
  const canFulfil = !isNew && mode === 'view' && (OPEN_GROUP.includes(statusLower) || inPicking)
  // Fully picked once every stocked line has its full quantity picked
  const allPicked = lines
    .filter(l => { const p = products.find(x => x.id === l.product_id); return !!p && p.type !== 'Service' && p.track_stock !== false && Number(l.quantity) > 0 })
    .every(l => Number(l.quantity_picked ?? 0) >= Number(l.quantity))
  // Open orders: Pick Order (Full / Pick Only) or Close Order (None). Picking orders: keep picking, or close once fully picked.
  const showPick = canFulfil && (inPicking ? !allPicked : pickMode)
  const showPack = canFulfil && inPicking && allPicked && fulfilmentMode === 'full'
  const showClose = canFulfil && (inPicking ? allPicked && fulfilmentMode !== 'full' : !pickMode)

  // Price for a product at a price level and quantity (quantity breaks supported); falls back to the standard sell price
  function priceFor(p: Product, levelId: string | null, qty: number): number {
    if (levelId && p.price_levels?.length) {
      const forLevel = p.price_levels.filter(x => x.price_level_id === levelId)
      if (forLevel.length) {
        const eligible = forLevel.filter(x => (Number(x.break_qty) || 1) <= Math.max(qty, 1))
        const pick = (eligible.length ? eligible : forLevel).reduce((a, b) => ((Number(b.break_qty) || 1) > (Number(a.break_qty) || 1) ? b : a))
        return Number(pick.price) || 0
      }
    }
    return Number(p.sell_price) || 0
  }

  function repriceAll(levelId: string | null) {
    setLines(prev => prev.map(l => {
      const p = productById.get(l.product_id)
      return p && !l._manual ? { ...l, unit_price: priceFor(p, levelId, l.quantity) } : l
    }))
  }

  function changePriceLevel(id: string) {
    const next = id || null
    setPriceLevelId(next)
    repriceAll(next)
  }

  // Selecting a customer fills terms, currency, price level and (if none chosen yet) the ship-from location
  function selectCustomer(c: Customer) {
    setSelectedCustomer(c)
    setTerms(c.terms ?? defaultTerms ?? 'Net 14')
    setCurrency(c.currency ?? baseCurrency)
    setPriceLevelId(c.price_level_id ?? null)
    repriceAll(c.price_level_id ?? null)
    if (!selectedLocation && c.default_location) {
      const loc = locations.find(l => l.id === c.default_location || l.name === c.default_location)
      if (loc) setSelectedLocation(loc)
    }
    setCustomerDropOpen(false)
  }

  function clearCustomer() {
    setSelectedCustomer(null)
    setTerms(fallbackTerms)
    setCurrency(baseCurrency)
    setPriceLevelId(null)
    repriceAll(null)
  }

  function addLine(p: Product) {
    setLines(prev => [...prev, {
      product_id: p.id,
      product_name: p.name,
      product_sku: p.sku ?? '',
      unit: p.sell_uom ?? 'Each',
      quantity: 1,
      unit_price: priceFor(p, priceLevelId, 1),
      discount: 0,
      ...sellTaxFor(p),
      line_notes: '',
    }])
    setItemSearch('')
    setItemDropOpen(false)
  }

  function updateLine(idx: number, field: keyof LineItem, value: string | number) {
    setLines(prev => prev.map((l, i) => {
      if (i !== idx) return l
      const next = { ...l, [field]: value } as LineItem
      if (field === 'unit_price') next._manual = true
      if (field === 'quantity' && !l._manual) {
        const p = productById.get(l.product_id)
        if (p) next.unit_price = priceFor(p, priceLevelId, Number(value) || 0)
      }
      return next
    }))
  }

  function setLineTax(idx: number, id: string) {
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, ...taxFields(id) } : l))
  }

  function removeLine(idx: number) {
    setLines(prev => prev.filter((_, i) => i !== idx))
  }

  function addCharge(p: Product) {
    setCharges(prev => [...prev, {
      product_id: p.id,
      product_name: p.name,
      product_sku: p.sku ?? '',
      description: p.description ?? '',
      amount: priceFor(p, priceLevelId, 1),
      ...sellTaxFor(p),
    }])
    setChargeSearch('')
    setChargeDropOpen(false)
  }

  function updateCharge(idx: number, field: keyof ChargeLine, value: string | number) {
    setCharges(prev => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l))
  }

  function setChargeTax(idx: number, id: string) {
    setCharges(prev => prev.map((l, i) => i === idx ? { ...l, ...taxFields(id) } : l))
  }

  function removeCharge(idx: number) {
    setCharges(prev => prev.filter((_, i) => i !== idx))
  }

  // ── Totals (same maths as purchase orders) ──
  const subtotal = lines.reduce((sum, l) => sum + lineTotal(l), 0)
  const chargesTotal = charges.reduce((sum, l) => sum + l.amount, 0)
  const preDiscountTotal = subtotal + chargesTotal
  const orderDiscountAmount = orderDiscountType === '%'
    ? preDiscountTotal * (orderDiscount / 100)
    : Math.min(orderDiscount, preDiscountTotal)
  const discountedBase = preDiscountTotal - orderDiscountAmount
  const discountFactor = preDiscountTotal > 0 ? discountedBase / preDiscountTotal : 1
  const taxTotal =
    lines.reduce((sum, l) => sum + lineTotal(l) * discountFactor * (l.tax_rate / 100), 0) +
    charges.reduce((sum, l) => sum + l.amount * discountFactor * (l.tax_rate / 100), 0)
  const total = discountedBase + taxTotal

  async function save(status: 'Draft' | 'Open') {
    if (!selectedCustomer) { setError('Please select a customer.'); return }
    if (!selectedLocation) { setError('Please select a ship-from location.'); return }
    if (lines.length === 0) { setError('Add at least one line item.'); return }
    setSaving(true)
    setError(null)

    const payload = {
      customer_id: selectedCustomer.id,
      customer_name: selectedCustomer.name,
      location_id: selectedLocation.id,
      location_name: selectedLocation.name,
      status,
      order_date: orderDate,
      expected_date: expectedDate || null,
      ref: customerRef || null,
      terms,
      notes: notes || null,
      currency,
      price_level_id: priceLevelId,
      price_level_name: priceLevelId ? levelName : null,
      total_amount: total,
      order_discount: orderDiscount || null,
      order_discount_type: orderDiscount > 0 ? orderDiscountType : null,
      order_discount_amount: orderDiscountAmount > 0 ? orderDiscountAmount : null,
      lines: lines.map((l, i) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { _manual, ...rest } = l
        return { ...rest, sort_order: i }
      }),
      cost_lines: charges.map((l, i) => ({ ...l, sort_order: i })),
    }

    try {
      const res = await fetch(isNew ? '/api/org/sales' : `/api/org/sales/${order!.id}`, {
        method: isNew ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      setSaving(false)
      if (!res.ok) { setError(data.error ?? 'Something went wrong'); return }
      if (isNew) { router.push(`/sales/${data.id}`); return }
      setMode('view')
      router.refresh()
    } catch {
      setSaving(false)
      setError('Network error — please try again.')
    }
  }

  async function closeOrder() {
    setClosing(true)
    setError(null)
    try {
      const res = await fetch(`/api/org/sales/${order!.id}/close`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setConfirmClose(false); setError(data.error ?? 'Could not close this order'); return }
      setConfirmClose(false)
      router.refresh()
    } catch {
      setConfirmClose(false)
      setError('Network error — please try again.')
    } finally {
      setClosing(false)
    }
  }

  async function cancelOrder() {
    setCancelling(true)
    setError(null)
    try {
      const res = await fetch(`/api/org/sales/${order!.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'Cancelled' }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error ?? 'Could not cancel this order'); return }
      setConfirmCancelOrder(false)
      router.refresh()
    } catch {
      setError('Network error — please try again.')
    } finally {
      setCancelling(false)
    }
  }

  // Save errors render at the top of the scroll area — always bring them into view
  useEffect(() => {
    if (error) scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [error])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const insideDropdown = (e.target as Element)?.closest?.('[data-dropdown]')
      if (!insideDropdown) {
        setCustomerDropOpen(false)
        setOpenDd(null)
        setItemDropOpen(false)
        setChargeDropOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const thStyle = { fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'var(--gray-400)', fontFamily: 'var(--font-ui)' }
  const searchIcon = (
    <svg style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--gray-400)', pointerEvents: 'none', zIndex: 1 }} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
  )
  const trashIcon = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
  const closeX = <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ background: 'var(--white)', borderBottom: '1px solid var(--gray-100)', padding: '16px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => router.push('/sales')} className="sq-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--slate)' }}>
              {isNew ? 'New Sales Order' : order!.so_number ?? 'Sales Order'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 1 }}>
              {isNew ? 'Order # will be assigned on save' : order!.customer_name ?? 'No customer selected'}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {!isNew && mode === 'edit' && <span style={{ fontSize: 12, color: 'var(--gray-400)', fontFamily: 'var(--font-ui)' }}>Editing</span>}
          {isNew
            ? <><span style={{ fontSize: 12, color: 'var(--gray-400)', fontFamily: 'var(--font-ui)' }}>Draft</span><div style={{ width: 8, height: 8, borderRadius: '50%', background: '#F59E0B' }} /></>
            : <span className={`badge ${statusClass(order!.status)}`}>{shownStatus}</span>}
          {!isNew && mode === 'view' && statusEditable && (
            <button className="btn btn-outline" style={{ height: 34, marginLeft: 4 }} onClick={() => { setError(null); setMode('edit') }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
              Edit
            </button>
          )}
        </div>
      </div>

      {/* Scrollable content */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '24px 28px 100px' }}>

        {error && (
          <div style={{ background: '#FEF2F2', border: '1.5px solid #FECACA', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#B91C1C', marginBottom: 20 }}>{error}</div>
        )}

        {!isNew && !statusEditable && (
          <div style={{ background: '#F8FAFC', border: '1.5px solid var(--gray-200)', borderRadius: 10, padding: '10px 16px', fontSize: 13, color: 'var(--gray-400)', marginBottom: 20 }}>
            This order is <strong style={{ color: 'var(--slate)' }}>{shownStatus}</strong> and cannot be edited.
          </div>
        )}

        {/* Row 1: Customer + Ship From */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20, alignItems: 'start' }}>

          {/* Customer card */}
          <div className="npo-card">
            <div className="npo-card-title">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              Customer
            </div>

            {!selectedCustomer ? (
              <div style={{ position: 'relative' }} data-dropdown onClick={e => e.stopPropagation()}>
                <svg style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--gray-400)', pointerEvents: 'none' }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input
                  className="modal-input"
                  placeholder="Search customers…"
                  value={customerSearch}
                  onChange={e => setCustomerSearch(e.target.value)}
                  onFocus={() => setCustomerDropOpen(true)}
                  disabled={!editable}
                  style={{ paddingLeft: 32, background: 'var(--gray-50)' }}
                  autoComplete="off"
                />
                {customerDropOpen && (
                  <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: 'var(--white)', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 12, boxShadow: 'var(--shadow-lg)', maxHeight: 220, overflowY: 'auto', zIndex: 100, padding: 6 }}>
                    {filteredCustomers.length === 0 ? (
                      <div style={{ padding: '10px 12px', color: 'var(--gray-400)', fontSize: 13 }}>No customers found</div>
                    ) : filteredCustomers.map(c => (
                      <div key={c.id} className="fp-item" onClick={() => selectCustomer(c)}>
                        <div style={{ fontWeight: 600, color: 'var(--slate)', fontSize: 13 }}>{c.name}</div>
                        {c.email && <div style={{ fontSize: 11, color: 'var(--gray-400)' }}>{c.email}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ background: 'var(--teal-surface)', border: '1.5px solid var(--teal-pale)', borderRadius: 12, padding: '14px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: 'var(--slate)', letterSpacing: '-0.02em' }}>{selectedCustomer.name}</div>
                    {selectedCustomer.phone && <div style={{ fontSize: 12.5, color: 'var(--gray-400)', marginTop: 2 }}>{selectedCustomer.phone}</div>}
                    {selectedCustomer.email && <div style={{ fontSize: 12.5, color: 'var(--teal)', marginTop: 2 }}>{selectedCustomer.email}</div>}
                    {(selectedCustomer.bill_street || selectedCustomer.bill_city) && (
                      <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 4 }}>
                        {[selectedCustomer.bill_street, selectedCustomer.bill_city, selectedCustomer.bill_country].filter(Boolean).join(', ')}
                      </div>
                    )}
                  </div>
                  {editable && (
                    <button onClick={clearCustomer} style={{ width: 24, height: 24, borderRadius: 6, border: 'none', background: 'rgba(13,148,136,0.15)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--teal)', flexShrink: 0 }}>{closeX}</button>
                  )}
                </div>
              </div>
            )}

            <div className="modal-field" style={{ marginTop: 12 }}>
              <label className="modal-label">Customer Order #</label>
              <input className="modal-input" value={customerRef} onChange={e => setCustomerRef(e.target.value)} disabled={!editable} placeholder="Customer's PO / reference number" style={{ background: editable ? 'var(--white)' : 'var(--gray-50)' }} />
            </div>
          </div>

          {/* Ship From card */}
          <div className="npo-card">
            <div className="npo-card-title">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
              Ship From
            </div>

            {!selectedLocation ? (
              <div className="modal-field" data-dropdown onClick={e => e.stopPropagation()}>
                <label className="modal-label">Location <span className="req">*</span></label>
                <div style={{ position: 'relative' }}>
                  <button className="modal-dd-btn" onClick={() => setOpenDd(openDd === 'location' ? null : 'location')} type="button" disabled={!editable} style={{ background: 'var(--white)' }}>
                    <span style={{ color: 'var(--gray-400)' }}>Select location…</span>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
                  </button>
                  {openDd === 'location' && (
                    <div className="inv-dropdown filter-pick-dropdown" style={{ display: 'block', minWidth: 220 }}>
                      <div className="col-dropdown-title">Ship From</div>
                      {locations.map(l => (
                        <div key={l.id} className="fp-item" onClick={() => { setSelectedLocation(l); setOpenDd(null) }}>{l.name}</div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
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
                    <button onClick={() => setSelectedLocation(null)} style={{ width: 24, height: 24, borderRadius: 6, border: 'none', background: 'rgba(13,148,136,0.15)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--teal)', flexShrink: 0 }}>{closeX}</button>
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
              <input className="modal-input" type="date" value={orderDate} onChange={e => setOrderDate(e.target.value)} disabled={!editable} style={{ background: editable ? 'var(--white)' : 'var(--gray-50)' }} />
            </div>
            <div className="modal-field">
              <label className="modal-label">Delivery Date</label>
              <input className="modal-input" type="date" value={expectedDate} onChange={e => setExpectedDate(e.target.value)} disabled={!editable} style={{ background: editable ? 'var(--white)' : 'var(--gray-50)' }} />
            </div>
            <Dd label="Payment Terms" value={terms} options={TERMS.map(t => ({ id: t, label: t }))} onPick={setTerms} open={openDd === 'terms'} setOpen={o => setOpenDd(o ? 'terms' : null)} disabled={!editable} />
            <Dd label="Price Level" value={levelName} options={levelOptions} onPick={changePriceLevel} open={openDd === 'level'} setOpen={o => setOpenDd(o ? 'level' : null)} disabled={!editable} />
            <Dd label="Currency" value={currency} options={currencyOptions} onPick={setCurrency} open={openDd === 'currency'} setOpen={o => setOpenDd(o ? 'currency' : null)} disabled={!editable} />
            <div />
            <div className="modal-field" style={{ gridColumn: 'span 3' }}>
              <label className="modal-label">Comments / Notes</label>
              <textarea className="modal-input" value={notes} onChange={e => setNotes(e.target.value)} disabled={!editable} rows={2} placeholder="Notes or instructions for this order…" style={{ resize: 'vertical', height: 60, lineHeight: 1.5, background: editable ? 'var(--white)' : 'var(--gray-50)' }} />
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
                  {showStock && <th className="li-th" style={{ width: 100 }}>Stock</th>}
                  <th className="li-th" style={{ width: 100, textAlign: 'right' }}>Unit Price</th>
                  <th className="li-th" style={{ width: 80, textAlign: 'right' }}>Disc %</th>
                  <th className="li-th" style={{ width: 140 }}>Tax</th>
                  <th className="li-th" style={{ width: 110, textAlign: 'right' }}>Line Total</th>
                  {editable && <th className="li-th" style={{ width: 36 }} />}
                </tr>
              </thead>
              <tbody>
                {lines.length === 0 && (
                  <tr>
                    <td colSpan={(editable ? 9 : 8) + (showStock ? 1 : 0)} style={{ textAlign: 'center', padding: '24px 0', color: 'var(--gray-400)', fontSize: 13 }}>
                      {editable ? 'No items added. Search below to add products.' : 'No line items on this order.'}
                    </td>
                  </tr>
                )}
                {lines.map((l, idx) => (
                  <tr key={l.id ?? idx} style={{ borderBottom: '1px solid var(--gray-100)' }}>
                    <td className="li-td"><span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--gray-400)' }}>{l.product_sku}</span></td>
                    <td className="li-td"><span style={{ fontWeight: 600, color: 'var(--slate)', fontSize: 13 }}>{l.product_name}</span></td>
                    <td className="li-td" style={{ textAlign: 'center' }}>
                      {editable
                        ? <input className="li-input" value={l.unit} onChange={e => updateLine(idx, 'unit', e.target.value)} style={{ width: 60, textAlign: 'center' }} />
                        : <span style={{ fontSize: 13 }}>{l.unit}</span>}
                    </td>
                    <td className="li-td" style={{ textAlign: 'right' }}>
                      {editable
                        ? <NumInput className="li-input right" value={l.quantity} onChange={n => updateLine(idx, 'quantity', n)} min={0} style={{ width: 70, textAlign: 'right' }} />
                        : <span style={{ fontSize: 13 }}>{l.quantity}</span>}
                    </td>
                    {showStock && (
                      <td className="li-td">
                        {(() => {
                          const st = lineStock(l)
                          if (!st) return <span style={{ color: 'var(--gray-300)' }}>—</span>
                          return st === 'no'
                            ? <span className="badge" style={{ background: '#FEE2E2', color: '#B91C1C' }}>No Stock</span>
                            : <span className="badge" style={{ background: '#DCFCE7', color: '#15803D' }}>In Stock</span>
                        })()}
                      </td>
                    )}
                    <td className="li-td" style={{ textAlign: 'right' }}>
                      {editable
                        ? <NumInput className="li-input right" value={l.unit_price} onChange={n => updateLine(idx, 'unit_price', n)} decimals={decimalPlaces} min={0} style={{ width: 90, textAlign: 'right' }} />
                        : <span style={{ fontSize: 13, fontFamily: 'var(--font-display)' }}>{fmtMoney(l.unit_price)}</span>}
                    </td>
                    <td className="li-td" style={{ textAlign: 'right' }}>
                      {editable
                        ? <NumInput className="li-input right" value={l.discount} onChange={n => updateLine(idx, 'discount', n)} min={0} max={100} style={{ width: 70, textAlign: 'right' }} />
                        : <span style={{ fontSize: 13 }}>{l.discount}%</span>}
                    </td>
                    <td className="li-td">
                      {editable
                        ? <TaxSelect value={l.tax_rate_id} label={l.tax_name} options={taxOptions} onChange={id => setLineTax(idx, id)} />
                        : <span style={{ fontSize: 13 }}>{l.tax_name ?? `${l.tax_rate}%`}</span>}
                    </td>
                    <td className="li-td" style={{ textAlign: 'right', fontWeight: 600, color: 'var(--slate)', fontFamily: 'var(--font-display)' }}>
                      {fmtMoney(lineTotal(l))}
                    </td>
                    {editable && (
                      <td className="li-td">
                        <button onClick={() => removeLine(idx)} style={{ width: 26, height: 26, borderRadius: 7, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--gray-400)' }}
                          onMouseOver={e => (e.currentTarget.style.color = 'var(--danger)')}
                          onMouseOut={e => (e.currentTarget.style.color = 'var(--gray-400)')}>{trashIcon}</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Add item search */}
          {editable && (
            <div style={{ padding: '10px 0 2px', position: 'relative' }} data-dropdown onClick={e => e.stopPropagation()}>
              <div style={{ position: 'relative' }}>
                {searchIcon}
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
                        <span style={thStyle}>SKU</span>
                        <span style={thStyle}>Product</span>
                        <span style={{ ...thStyle, textAlign: 'center' }}>Unit</span>
                        <span style={{ ...thStyle, textAlign: 'right' }} title={selectedLocation ? `At ${selectedLocation.name}` : 'All locations'}>Available</span>
                        <span style={{ ...thStyle, textAlign: 'right' }}>Committed</span>
                        <span style={{ ...thStyle, textAlign: 'right' }}>Price</span>
                      </div>
                      <div style={{ maxHeight: 260, overflowY: 'auto', padding: 6 }}>
                        {filteredProducts.map(p => {
                          const st = stockByProduct[p.id] ?? { onHand: 0, committed: 0, available: 0 }
                          const tracked = p.track_stock !== false && p.type === 'Stock'
                          const price = priceFor(p, priceLevelId, 1)
                          return (
                            <div key={p.id} className="fp-item" style={{ display: 'grid', gridTemplateColumns: PICK_COLS, alignItems: 'center', gap: 8 }} onClick={() => addLine(p)}>
                              <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--gray-400)' }}>{p.sku ?? '—'}</span>
                              <span style={{ fontWeight: 600, color: 'var(--slate)', fontSize: 13 }}>{p.name}</span>
                              <span style={{ fontSize: 12, color: 'var(--gray-400)', textAlign: 'center' }}>{p.sell_uom ?? 'Each'}</span>
                              <span style={{ fontSize: 13, fontWeight: 600, textAlign: 'right', color: !tracked ? 'var(--gray-400)' : st.available <= 0 ? 'var(--danger)' : '#059669' }}>{tracked ? st.available : '—'}</span>
                              <span style={{ fontSize: 13, textAlign: 'right', color: 'var(--gray-400)' }}>{tracked ? st.committed : '—'}</span>
                              <span style={{ fontSize: 13, color: 'var(--teal)', fontWeight: 600, textAlign: 'right' }}>{price ? `$${price.toFixed(decimalPlaces)}` : '—'}</span>
                            </div>
                          )
                        })}
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

          {/* Additional charges (freight, services…) */}
          {(editable || charges.length > 0) && (
            <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px dashed var(--gray-200)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--gray-400)' }}><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--slate)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>Additional Charges</span>
                <span style={{ fontSize: 11, color: 'var(--gray-400)' }}>Freight, installation and other service charges</span>
              </div>

              {charges.length > 0 && (
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
                      {charges.map((l, idx) => (
                        <tr key={l.id ?? idx} style={{ borderBottom: '1px solid var(--gray-100)' }}>
                          <td className="li-td"><span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--gray-400)' }}>{l.product_sku}</span></td>
                          <td className="li-td"><span style={{ fontWeight: 600, color: 'var(--slate)', fontSize: 13 }}>{l.product_name}</span></td>
                          <td className="li-td">
                            {editable
                              ? <input className="li-input" value={l.description} onChange={e => updateCharge(idx, 'description', e.target.value)} placeholder="Optional description…" style={{ width: '100%', minWidth: 160 }} />
                              : <span style={{ fontSize: 13, color: 'var(--gray-400)' }}>{l.description}</span>}
                          </td>
                          <td className="li-td" style={{ textAlign: 'right' }}>
                            {editable
                              ? <NumInput className="li-input right" value={l.amount} onChange={n => updateCharge(idx, 'amount', n)} decimals={decimalPlaces} min={0} style={{ width: 90, textAlign: 'right' }} />
                              : <span style={{ fontSize: 13 }}>{fmtMoney(l.amount)}</span>}
                          </td>
                          <td className="li-td">
                            {editable
                              ? <TaxSelect value={l.tax_rate_id} label={l.tax_name} options={taxOptions} onChange={id => setChargeTax(idx, id)} />
                              : <span style={{ fontSize: 13 }}>{l.tax_name ?? `${l.tax_rate}%`}</span>}
                          </td>
                          <td className="li-td" style={{ textAlign: 'right', fontWeight: 600, color: 'var(--slate)', fontFamily: 'var(--font-display)' }}>
                            {fmtMoney(l.amount * (1 + l.tax_rate / 100))}
                          </td>
                          {editable && (
                            <td className="li-td">
                              <button onClick={() => removeCharge(idx)} style={{ width: 26, height: 26, borderRadius: 7, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--gray-400)' }}
                                onMouseOver={e => (e.currentTarget.style.color = 'var(--danger)')}
                                onMouseOut={e => (e.currentTarget.style.color = 'var(--gray-400)')}>{trashIcon}</button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {editable && (
                <div style={{ position: 'relative' }} data-dropdown onClick={e => e.stopPropagation()}>
                  <div style={{ position: 'relative' }}>
                    {searchIcon}
                    <input
                      className="modal-input"
                      placeholder="Search services to add charges…"
                      value={chargeSearch}
                      onChange={e => { setChargeSearch(e.target.value); setChargeDropOpen(true) }}
                      onFocus={() => setChargeDropOpen(true)}
                      style={{ paddingLeft: 32, background: 'var(--gray-50)', width: '100%' }}
                      autoComplete="off"
                    />
                  </div>
                  {chargeDropOpen && (
                    <div style={{ position: 'absolute', top: 'calc(100% - 4px)', left: 0, right: 0, background: 'var(--white)', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 14, boxShadow: 'var(--shadow-lg)', zIndex: 200, overflow: 'hidden' }}>
                      {filteredChargeProducts.length > 0 ? (
                        <>
                          <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr auto', padding: '8px 14px 6px', background: 'var(--gray-50)', borderBottom: '1px solid var(--gray-100)' }}>
                            <span style={thStyle}>SKU</span>
                            <span style={thStyle}>Service</span>
                            <span style={{ ...thStyle, textAlign: 'right' }}>Price</span>
                          </div>
                          <div style={{ maxHeight: 220, overflowY: 'auto', padding: 6 }}>
                            {filteredChargeProducts.map(p => (
                              <div key={p.id} className="fp-item" style={{ display: 'grid', gridTemplateColumns: '100px 1fr auto', alignItems: 'center', gap: 8 }} onClick={() => addCharge(p)}>
                                <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--gray-400)' }}>{p.sku ?? '—'}</span>
                                <span style={{ fontWeight: 600, color: 'var(--slate)', fontSize: 13 }}>{p.name}</span>
                                <span style={{ fontSize: 13, color: 'var(--teal)', fontWeight: 600, textAlign: 'right' }}>{priceFor(p, priceLevelId, 1) ? `$${priceFor(p, priceLevelId, 1).toFixed(2)}` : '—'}</span>
                              </div>
                            ))}
                          </div>
                        </>
                      ) : (
                        <div style={{ padding: '14px 16px', fontSize: 13, color: 'var(--gray-400)' }}>
                          {chargeSearch ? `No services matching "${chargeSearch}"` : 'No service products available'}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Totals */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--gray-100)' }}>
            <div style={{ minWidth: 300, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--gray-400)' }}>
                <span>Subtotal</span>
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, color: 'var(--slate)' }}>{fmtMoney(subtotal)}</span>
              </div>
              {chargesTotal > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--gray-400)' }}>
                  <span>Additional Charges</span>
                  <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, color: 'var(--slate)' }}>{fmtMoney(chargesTotal)}</span>
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
                    {orderDiscountAmount > 0 ? `−${fmtMoney(orderDiscountAmount)}` : fmtMoney(0)}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--gray-400)' }}>
                <span>Tax</span>
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, color: 'var(--slate)' }}>{fmtMoney(taxTotal)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--slate)', letterSpacing: '-0.02em', paddingTop: 6, borderTop: '2px solid var(--slate)' }}>
                <span>Total {currency}</span>
                <span>{fmtMoney(total)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom action bar */}
      <div style={{ background: 'var(--white)', borderTop: '1px solid var(--gray-100)', padding: '14px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 -4px 16px rgba(0,0,0,0.06)', flexShrink: 0 }}>
        {mode === 'edit' ? (
          <button onClick={() => setConfirmLeave(true)} className="btn btn-outline" style={{ height: 38 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            Cancel
          </button>
        ) : (
          <button onClick={() => router.push('/sales')} className="btn btn-outline" style={{ height: 38 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
            Back to Sales
          </button>
        )}
        {error && <div style={{ flex: 1, margin: '0 16px', fontSize: 12.5, color: '#B91C1C', textAlign: 'right' }}>{error}</div>}

        {/* View mode actions */}
        {!isNew && mode === 'view' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {statusEditable && (
              <button className="btn btn-outline" style={{ height: 38, color: 'var(--danger)', borderColor: '#FECACA' }} onClick={() => setConfirmCancelOrder(true)}>
                Cancel Order
              </button>
            )}
            {isDraft && (
              <button className="btn btn-primary" style={{ height: 38, padding: '0 20px', fontSize: 14 }} onClick={() => save('Open')} disabled={saving}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                {saving ? 'Submitting…' : 'Submit Order'}
              </button>
            )}
            {showPick && (
              <button className="btn btn-primary" style={{ height: 38, padding: '0 20px', fontSize: 14 }} onClick={() => router.push(`/sales/${order!.id}/pick`)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><polyline points="3 8 12 13 21 8"/><line x1="12" y1="13" x2="12" y2="22"/></svg>
                Pick Order
              </button>
            )}
            {showPack && (
              <button className="btn btn-primary" style={{ height: 38, padding: '0 20px', fontSize: 14 }} onClick={() => router.push(`/sales/${order!.id}/pack`)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
                Pack Order
              </button>
            )}
            {showClose && (
              <button className="btn btn-primary" style={{ height: 38, padding: '0 20px', fontSize: 14 }} onClick={() => setConfirmClose(true)} disabled={closing}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                Close Order
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
              {saving ? 'Creating…' : isNew ? 'Create Sales Order' : 'Submit Order'}
            </button>
          </div>
        )}
        {mode === 'edit' && !isDraft && (
          <button className="btn btn-primary" style={{ height: 38, padding: '0 20px', fontSize: 14 }} onClick={() => save('Open')} disabled={saving}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        )}
      </div>

      {confirmLeave && (
        <ConfirmModal
          title={isNew ? 'Cancel this sales order?' : 'Discard changes?'}
          message={isNew
            ? "Are you sure you want to cancel? This sales order hasn't been saved and everything you've entered will be lost."
            : "Are you sure you want to cancel? Any changes you've made will be lost."}
          confirmLabel={isNew ? 'Yes, cancel' : 'Yes, discard'}
          cancelLabel="Keep editing"
          danger
          onConfirm={() => { setConfirmLeave(false); if (isNew) router.push('/sales'); else onDiscard() }}
          onCancel={() => setConfirmLeave(false)}
        />
      )}
      {confirmClose && (
        <ConfirmModal
          title="Close sales order?"
          message={`Stock for ${order?.so_number ?? 'this order'} will be allocated automatically (oldest stock first, including batch, serial, expiry and bin where tracked) and the order will be closed. This can't be undone.`}
          confirmLabel="Yes, close order"
          busy={closing}
          onConfirm={closeOrder}
          onCancel={() => setConfirmClose(false)}
        />
      )}
      {confirmCancelOrder && (
        <ConfirmModal
          title="Cancel sales order?"
          message={`Are you sure you want to cancel ${order?.so_number ?? 'this sales order'}? It will move to Cancelled.`}
          confirmLabel="Yes, cancel order"
          danger
          busy={cancelling}
          onConfirm={cancelOrder}
          onCancel={() => setConfirmCancelOrder(false)}
        />
      )}
    </div>
  )
}
