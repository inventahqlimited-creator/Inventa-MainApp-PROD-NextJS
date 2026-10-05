// src/lib/permissions.ts
// The one list of permissions in InventaHQ — used by the role editor, the menus, the screens and the server.
//   • Admin always has everything and cannot be edited.
//   • Manager, Staff and Read only are fixed roles with set permissions (below).
//   • A custom role is a saved set of permissions (org_roles.permissions); a user with a custom role gets exactly that set.
//   • Ticking a permission also ticks the ones it needs (DEPENDS), so a role can never be in an impossible state.
// Safe to import from the browser and the server (no imports).

export type PermGroup = {
  id: string
  title: string
  perms: PermDef[]
}
export type PermDef = { key: string; label: string; hint?: string; needs?: string[] }

// Order here is the order shown in the role editor.
export const PERMISSION_GROUPS = [
  {
    id: 'dashboard', title: 'Dashboard',
    perms: [
      { key: 'view_dashboard', label: 'View dashboard' },
      { key: 'view_dashboard_financials', label: 'View financial figures', hint: 'Sales totals and values on the dashboard', needs: ['view_dashboard'] },
    ],
  },
  {
    id: 'contacts', title: 'Contacts',
    perms: [
      { key: 'view_contacts', label: 'View contacts' },
      { key: 'create_contacts', label: 'Create contacts', needs: ['view_contacts'] },
      { key: 'edit_contacts', label: 'Edit contacts', hint: 'Includes archive and reactivate', needs: ['view_contacts'] },
      { key: 'import_contacts', label: 'Import contacts', needs: ['create_contacts'] },
      { key: 'export_contacts', label: 'Export contacts', needs: ['view_contacts'] },
    ],
  },
  {
    id: 'products', title: 'Products and stock',
    perms: [
      { key: 'view_products', label: 'View products', hint: 'Opens the Products module and shows stock levels' },
      { key: 'create_products', label: 'Add products', needs: ['view_products'] },
      { key: 'edit_products', label: 'Edit products', hint: 'Includes archive, cost price and sell price', needs: ['view_products', 'view_pricing', 'view_cost'] },
      { key: 'view_pricing', label: 'View pricing', hint: 'Sell prices', needs: ['view_products'] },
      { key: 'view_cost', label: 'View cost price', hint: 'What you pay for products', needs: ['view_products'] },
      { key: 'import_products', label: 'Import products', needs: ['create_products'] },
      { key: 'export_products', label: 'Export products', needs: ['view_products'] },
      { key: 'view_movements', label: 'View stock movements', needs: ['view_products'] },
      { key: 'view_adjustments', label: 'View stock adjustments', needs: ['view_products'] },
      { key: 'create_adjustments', label: 'Create stock adjustments', hint: 'Includes completing them and running stocktakes', needs: ['view_adjustments'] },
      { key: 'edit_adjustments', label: 'Edit stock adjustments', needs: ['view_adjustments'] },
      { key: 'cancel_adjustments', label: 'Cancel stock adjustments', needs: ['view_adjustments'] },
    ],
  },
  {
    id: 'sales', title: 'Sales',
    perms: [
      { key: 'view_sales', label: 'View sales orders', hint: 'All orders' },
      { key: 'create_sales', label: 'Create orders and quotes', hint: 'Includes clone order', needs: ['view_sales'] },
      { key: 'edit_sales', label: 'Edit orders', hint: 'Includes convert quote to order, and changing prices and discounts', needs: ['view_sales'] },
      { key: 'pick_sales', label: 'Pick', needs: ['view_sales'] },
      { key: 'pack_sales', label: 'Pack', needs: ['view_sales'] },
      { key: 'close_sales', label: 'Close order', hint: 'Includes bulk close', needs: ['view_sales'] },
      { key: 'cancel_sales', label: 'Cancel order', needs: ['view_sales'] },
      { key: 'print_sales_pick', label: 'Print pick lists', needs: ['view_sales'] },
      { key: 'print_sales_pack', label: 'Print packing lists', needs: ['view_sales'] },
      { key: 'print_sales_invoice', label: 'Print invoices and quotes', needs: ['view_sales'] },
      { key: 'create_po_from_so', label: 'Create purchase order from a sales order', needs: ['view_sales', 'create_purchases'] },
      { key: 'view_sales_cost', label: 'View cost and margin on orders', needs: ['view_sales'] },
      { key: 'post_sales_xero', label: 'Post to Xero', hint: 'Post an order’s invoice from the order', needs: ['view_sales'] },
      { key: 'view_sales_history', label: 'View Order History', needs: ['view_sales'] },
    ],
  },
  {
    id: 'purchases', title: 'Purchases',
    perms: [
      { key: 'view_purchases', label: 'View purchase orders' },
      { key: 'create_purchases', label: 'Create purchase orders', hint: 'Includes clone order', needs: ['view_purchases'] },
      { key: 'edit_purchases', label: 'Edit purchase orders', needs: ['view_purchases'] },
      { key: 'receive_purchases', label: 'Receive stock', hint: 'Includes auto-receive and closing the order', needs: ['view_purchases'] },
      { key: 'cancel_purchases', label: 'Cancel purchase orders', needs: ['view_purchases'] },
      { key: 'print_purchases', label: 'Print purchase orders', needs: ['view_purchases'] },
      { key: 'create_so_from_po', label: 'Create sales order from a purchase order', needs: ['view_purchases', 'create_sales'] },
      { key: 'post_purchase_xero', label: 'Post bill to Xero', hint: 'Post an order’s bill from the order', needs: ['view_purchases'] },
      { key: 'view_purchase_history', label: 'View Order History', needs: ['view_purchases'] },
    ],
  },
  {
    id: 'transfers', title: 'Transfers',
    perms: [
      { key: 'view_transfers', label: 'View transfers' },
      { key: 'create_transfers', label: 'Create transfers', hint: 'Includes clone order', needs: ['view_transfers'] },
      { key: 'edit_transfers', label: 'Edit transfers', needs: ['view_transfers'] },
      { key: 'pick_transfers', label: 'Pick', needs: ['view_transfers'] },
      { key: 'complete_transfers', label: 'Complete transfer', hint: 'This is when stock moves', needs: ['view_transfers'] },
      { key: 'cancel_transfers', label: 'Cancel transfer', needs: ['view_transfers'] },
      { key: 'print_transfers', label: 'Print pick lists', needs: ['view_transfers'] },
      { key: 'view_transfer_history', label: 'View Order History', needs: ['view_transfers'] },
    ],
  },
  {
    id: 'reports', title: 'Reports',
    perms: [
      { key: 'view_reports_contacts', label: 'View contact reports' },
      { key: 'view_reports_products', label: 'View product reports' },
      { key: 'view_reports_stock', label: 'View stock reports' },
      { key: 'view_reports_sales', label: 'View sales reports' },
      { key: 'view_reports_purchases', label: 'View purchase reports' },
      { key: 'view_reports_transfers', label: 'View transfer reports' },
      { key: 'view_financial_reports', label: 'View financial reports', hint: 'Stock valuation, sales profit and item cost history' },
      { key: 'export_reports', label: 'Export reports' },
    ],
  },
  {
    id: 'xero', title: 'Xero',
    perms: [
      { key: 'xero_view', label: 'View Xero page and status' },
      { key: 'xero_post', label: 'Post invoices, bills and journals', hint: 'From the Xero page, one or many', needs: ['xero_view'] },
      { key: 'xero_sync', label: 'Run sync', hint: 'Sync now and Sync all', needs: ['xero_view'] },
      { key: 'xero_sync_records', label: 'Sync and import contacts and products', needs: ['xero_view'] },
      { key: 'xero_skip_adjustments', label: 'Mark a stock adjustment “Don’t send to Xero”', needs: ['view_adjustments'] },
      { key: 'xero_settings', label: 'Change Xero settings', hint: 'Accounts, tax mapping, posting options, schedule and stock tracking', needs: ['xero_view'] },
    ],
  },
  {
    id: 'settings', title: 'Settings and users',
    perms: [
      { key: 'manage_company', label: 'Manage company settings', hint: 'Company details, logo, currencies, locations and bins' },
      { key: 'manage_tax_rates', label: 'Manage tax rates' },
      { key: 'manage_contact_settings', label: 'Manage contact settings', hint: 'Custom fields and lists' },
      { key: 'manage_product_settings', label: 'Manage product settings', hint: 'Units, categories, price levels, tracking and custom fields' },
      { key: 'manage_sales_settings', label: 'Manage sales settings' },
      { key: 'manage_purchase_settings', label: 'Manage purchase settings' },
      { key: 'manage_transfer_settings', label: 'Manage transfer settings' },
      { key: 'view_users', label: 'View users' },
      { key: 'manage_users', label: 'Invite, edit and remove users', needs: ['view_users'] },
      { key: 'manage_roles', label: 'Manage roles and permissions', needs: ['view_users'] },
      { key: 'manage_security', label: 'Manage security settings' },
      { key: 'view_audit_log', label: 'View Audit Log' },
      { key: 'export_audit_log', label: 'Export Audit Log', needs: ['view_audit_log'] },
    ],
  },
] as const satisfies readonly PermGroup[]

/** The same groups, typed loosely for screens that loop over them. */
export const GROUPS: readonly PermGroup[] = PERMISSION_GROUPS

export type PermKey = (typeof PERMISSION_GROUPS)[number]['perms'][number]['key']
export type PermissionSet = Record<PermKey, boolean>

export const ALL_KEYS: PermKey[] = PERMISSION_GROUPS.flatMap(g => g.perms.map(p => p.key as PermKey))
const KEY_SET = new Set<string>(ALL_KEYS)
export const isPermKey = (k: string): k is PermKey => KEY_SET.has(k)

const NEEDS: Record<string, readonly string[]> = Object.fromEntries(
  PERMISSION_GROUPS.flatMap(g => g.perms.map(p => [p.key, (p as PermDef).needs ?? []] as const)),
)

/** What a permission needs (directly). */
export const needsOf = (k: PermKey): PermKey[] => [...(NEEDS[k] ?? [])] as PermKey[]

/** Everything that needs this permission (directly): switching it off switches these off too. */
export const neededBy = (k: PermKey): PermKey[] => ALL_KEYS.filter(x => (NEEDS[x] ?? []).includes(k))

export const emptySet = (): PermissionSet => Object.fromEntries(ALL_KEYS.map(k => [k, false])) as PermissionSet
export const fullSet = (): PermissionSet => Object.fromEntries(ALL_KEYS.map(k => [k, true])) as PermissionSet

/** Adds every permission that a ticked one needs (repeats until nothing changes). Unknown keys are dropped. */
export function closeSet(input: Record<string, unknown> | null | undefined): PermissionSet {
  const out = emptySet()
  for (const [k, v] of Object.entries(input ?? {})) if (isPermKey(k) && v === true) out[k] = true
  let changed = true
  while (changed) {
    changed = false
    for (const k of ALL_KEYS) {
      if (!out[k]) continue
      for (const n of NEEDS[k] ?? []) if (!out[n as PermKey]) { out[n as PermKey] = true; changed = true }
    }
  }
  return out
}

/** Tick or untick one permission, keeping the set consistent. */
export function toggle(set: PermissionSet, key: PermKey, on: boolean): PermissionSet {
  const next = { ...set }
  if (on) { next[key] = true; return closeSet(next) }
  const off = new Set<PermKey>([key])
  let grew = true
  while (grew) {
    grew = false
    for (const k of ALL_KEYS) if (!off.has(k) && (NEEDS[k] ?? []).some(n => off.has(n as PermKey))) { off.add(k); grew = true }
  }
  for (const k of off) next[k] = false
  return next
}

// ── Fixed roles ─────────────────────────────────────────────────────────────

export type FixedRole = 'admin' | 'manager' | 'staff' | 'read_only'
export const FIXED_ROLES: FixedRole[] = ['admin', 'manager', 'staff', 'read_only']
export const ROLE_LABELS: Record<FixedRole, string> = { admin: 'Administrator', manager: 'Manager', staff: 'Staff', read_only: 'Read Only' }
export const ROLE_BLURBS: Record<FixedRole, string> = {
  admin: 'Everything, including settings and users. Cannot be edited.',
  manager: 'Everything except settings, users and roles, and changing Xero settings. Can see the Audit Log.',
  staff: 'Day-to-day work: create and edit orders, pick, pack, receive, transfers and stock adjustments. No costs, financial reports, Xero or settings.',
  read_only: 'Can look but not change anything. No costs, financial reports, Xero or settings.',
}

const SETTINGS_KEYS = PERMISSION_GROUPS.find(g => g.id === 'settings')!.perms.map(p => p.key as PermKey)

const MANAGER: PermissionSet = (() => {
  const s = fullSet()
  for (const k of SETTINGS_KEYS) if (k !== 'view_audit_log' && k !== 'export_audit_log') s[k] = false
  s.xero_settings = false
  return s
})()

const STAFF: PermissionSet = closeSet(Object.fromEntries([
  'view_dashboard',
  'view_contacts', 'create_contacts', 'edit_contacts',
  'view_products', 'create_products', 'view_pricing', 'view_movements', 'view_adjustments', 'create_adjustments', 'edit_adjustments',
  'view_sales', 'create_sales', 'edit_sales', 'pick_sales', 'pack_sales', 'close_sales', 'print_sales_pick', 'print_sales_pack', 'print_sales_invoice', 'view_sales_history',
  'view_purchases', 'create_purchases', 'edit_purchases', 'receive_purchases', 'print_purchases', 'view_purchase_history',
  'view_transfers', 'create_transfers', 'edit_transfers', 'pick_transfers', 'complete_transfers', 'print_transfers', 'view_transfer_history',
  'view_reports_contacts', 'view_reports_products', 'view_reports_stock', 'view_reports_sales', 'view_reports_purchases', 'view_reports_transfers',
].map(k => [k, true])))

const READ_ONLY: PermissionSet = closeSet(Object.fromEntries([
  'view_dashboard', 'view_contacts', 'view_products', 'view_pricing', 'view_movements', 'view_adjustments',
  'view_sales', 'view_sales_history', 'view_purchases', 'view_purchase_history', 'view_transfers', 'view_transfer_history',
  'view_reports_contacts', 'view_reports_products', 'view_reports_stock', 'view_reports_sales', 'view_reports_purchases', 'view_reports_transfers',
].map(k => [k, true])))

export const FIXED_ROLE_PERMS: Record<FixedRole, PermissionSet> = { admin: fullSet(), manager: MANAGER, staff: STAFF, read_only: READ_ONLY }

/** Ready-made starting points when creating a custom role (editable once created). */
export const ROLE_TEMPLATES: { id: string; name: string; blurb: string; perms: PermissionSet }[] = [
  { id: 'blank', name: 'Start empty', blurb: 'Nothing ticked', perms: emptySet() },
  {
    id: 'sales', name: 'Sales', blurb: 'Contacts, sales orders and sales reports',
    perms: closeSet(Object.fromEntries(['view_dashboard', 'view_contacts', 'create_contacts', 'edit_contacts', 'view_products', 'view_pricing',
      'view_sales', 'create_sales', 'edit_sales', 'print_sales_pick', 'print_sales_pack', 'print_sales_invoice', 'view_sales_history', 'view_reports_sales'].map(k => [k, true]))),
  },
  {
    id: 'purchasing', name: 'Purchasing', blurb: 'Purchase orders, suppliers and receiving',
    perms: closeSet(Object.fromEntries(['view_dashboard', 'view_contacts', 'create_contacts', 'edit_contacts', 'view_products', 'view_pricing', 'view_cost',
      'view_purchases', 'create_purchases', 'edit_purchases', 'receive_purchases', 'print_purchases', 'view_purchase_history', 'view_reports_purchases'].map(k => [k, true]))),
  },
  {
    id: 'warehouse', name: 'Warehouse', blurb: 'Pick, pack, receive, transfers and stock adjustments — no prices or costs',
    perms: closeSet(Object.fromEntries(['view_products', 'view_movements', 'view_adjustments', 'create_adjustments', 'edit_adjustments',
      'view_sales', 'pick_sales', 'pack_sales', 'close_sales', 'print_sales_pick', 'print_sales_pack',
      'view_purchases', 'receive_purchases', 'print_purchases',
      'view_transfers', 'create_transfers', 'edit_transfers', 'pick_transfers', 'complete_transfers', 'print_transfers', 'view_reports_stock'].map(k => [k, true]))),
  },
  {
    id: 'accounts', name: 'Accounts', blurb: 'See everything, post to Xero and view financial reports — no stock actions',
    perms: closeSet(Object.fromEntries(['view_dashboard', 'view_dashboard_financials', 'view_contacts', 'export_contacts', 'view_products', 'view_pricing', 'view_cost', 'export_products',
      'view_movements', 'view_adjustments', 'view_sales', 'view_sales_cost', 'post_sales_xero', 'print_sales_invoice', 'view_sales_history',
      'view_purchases', 'post_purchase_xero', 'print_purchases', 'view_purchase_history', 'view_transfers', 'view_transfer_history',
      'view_reports_contacts', 'view_reports_products', 'view_reports_stock', 'view_reports_sales', 'view_reports_purchases', 'view_reports_transfers',
      'view_financial_reports', 'export_reports', 'xero_view', 'xero_post', 'xero_sync', 'xero_sync_records'].map(k => [k, true]))),
  },
]

/**
 * A person's permissions.
 * @param role the fixed role on their membership
 * @param custom the permissions of their custom role, or null when they have none (an Admin is always Admin)
 */
export function resolvePermissions(role: string | null | undefined, custom: Record<string, unknown> | null | undefined): PermissionSet {
  const r = String(role ?? '').toLowerCase()
  if (r === 'admin' || r === 'owner') return fullSet()
  if (custom) return closeSet(custom)
  return { ...(FIXED_ROLE_PERMS[(FIXED_ROLES as string[]).includes(r) ? (r as FixedRole) : 'read_only']) }
}

/** The report ids that need "View financial reports" on top of their section (see lib/reports/registry.ts). */
export const FINANCIAL_REPORT_IDS = ['stock-valuation', 'sales-profit', 'cost-history'] as const
export const REPORT_SECTION_PERM: Record<string, PermKey> = {
  contacts: 'view_reports_contacts', products: 'view_reports_products', stock: 'view_reports_stock',
  sales: 'view_reports_sales', purchases: 'view_reports_purchases', transfers: 'view_reports_transfers',
}

// ── Where a person may go ───────────────────────────────────────────────────

const SETTINGS_ANY: PermKey[] = [...SETTINGS_KEYS.filter(k => k !== 'view_audit_log' && k !== 'export_audit_log'), 'xero_settings']
export const REPORT_VIEW_KEYS: PermKey[] = Object.values(REPORT_SECTION_PERM)

/** Which menu entries a person sees. */
export function menuAccess(p: PermissionSet) {
  return {
    dashboard: p.view_dashboard,
    contacts: p.view_contacts,
    products: p.view_products,
    purchases: p.view_purchases,
    sales: p.view_sales,
    transfers: p.view_transfers,
    reports: REPORT_VIEW_KEYS.some(k => p[k]),
    audit: p.view_audit_log,
    settings: SETTINGS_ANY.some(k => p[k]),
    xero: p.xero_view,
  }
}

/** The first screen a person may open (used when they land on one they can't see). */
export function homePath(p: PermissionSet): string {
  const m = menuAccess(p)
  const order: [boolean, string][] = [
    [m.dashboard, '/dashboard'], [m.sales, '/sales'], [m.purchases, '/purchases'], [m.transfers, '/transfers'],
    [m.products, '/products'], [m.contacts, '/contacts'], [m.reports, '/reports'], [m.settings, '/settings'],
  ]
  return order.find(([ok]) => ok)?.[1] ?? '/no-access'
}
