'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const MAIN_NAV = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    icon: (
      <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
        <rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
      </svg>
    ),
  },
]

const MODULE_NAV = [
  {
    href: '/contacts',
    label: 'Contacts',
    icon: (
      <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
        <circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
        <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
      </svg>
    ),
  },
  {
    href: '/products',
    label: 'Products',
    icon: (
      <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
        <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
        <line x1="12" y1="22.08" x2="12" y2="12"/>
      </svg>
    ),
  },
  {
    href: '/purchases',
    label: 'Purchases',
    icon: (
      <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
        <line x1="3" y1="6" x2="21" y2="6"/>
        <path d="M16 10a4 4 0 0 1-8 0"/>
      </svg>
    ),
  },
  {
    href: '/sales',
    label: 'Sales',
    icon: (
      <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="12" y1="1" x2="12" y2="23"/>
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
      </svg>
    ),
  },
  {
    href: '/transfers',
    label: 'Transfers',
    icon: (
      <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="17 1 21 5 17 9"/>
        <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
        <polyline points="7 23 3 19 7 15"/>
        <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
      </svg>
    ),
  },
  {
    href: '/reports',
    label: 'Reports',
    icon: (
      <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="18" y1="20" x2="18" y2="10"/>
        <line x1="12" y1="20" x2="12" y2="4"/>
        <line x1="6" y1="20" x2="6" y2="14"/>
      </svg>
    ),
  },
]

const SYSTEM_NAV = [
  {
    href: '/audit',
    label: 'Audit Log',
    icon: (
      <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
      </svg>
    ),
  },
  {
    href: '/settings',
    label: 'Settings',
    icon: (
      <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="3"/>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
      </svg>
    ),
  },
]

function NavLink({ href, label, icon }: { href: string; label: string; icon: React.ReactNode }) {
  const pathname = usePathname()
  const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
  return (
    <Link href={href} className={`nav-item${active ? ' active' : ''}`}>
      {icon}
      {label}
    </Link>
  )
}

export default function AppSidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <svg width="255" height="41" viewBox="0 0 480 76" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <clipPath id="sl-L"><polygon points="0,0 185,0 165,76 0,76"/></clipPath>
            <clipPath id="sl-R"><polygon points="185,0 480,0 480,76 165,76"/></clipPath>
            <mask id="sl-M">
              <rect width="480" height="76" fill="white"/>
              <rect x="3" y="0" width="20" height="17" fill="black"/>
            </mask>
          </defs>
          <text x="3" y="60" fontFamily="'Plus Jakarta Sans',sans-serif" fontSize="54" fontWeight="800" letterSpacing="-2" fill="rgba(255,255,255,0.28)" clipPath="url(#sl-L)" mask="url(#sl-M)">inventaHQ</text>
          <text x="3" y="60" fontFamily="'Plus Jakarta Sans',sans-serif" fontSize="54" fontWeight="800" letterSpacing="-2" fill="#5EEAD4" clipPath="url(#sl-R)" mask="url(#sl-M)" paintOrder="stroke fill" stroke="#5EEAD4" strokeWidth="1.1" strokeLinejoin="round">inventaHQ</text>
        </svg>
      </div>

      <nav className="sidebar-nav" style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
        {/* Dashboard */}
        <div>
          {MAIN_NAV.map(item => <NavLink key={item.href} {...item} />)}
        </div>

        {/* Modules */}
        <div style={{ marginTop: 4 }}>
          <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '8px 0 4px' }} />
          <div className="nav-section-label">Modules</div>
          {MODULE_NAV.map(item => <NavLink key={item.href} {...item} />)}
        </div>

        {/* Spacer pushes System to bottom */}
        <div style={{ flex: 1 }} />

        {/* System — pinned to bottom */}
        <div style={{ paddingBottom: 8 }}>
          <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '8px 0 4px' }} />
          <div className="nav-section-label">System</div>
          {SYSTEM_NAV.map(item => <NavLink key={item.href} {...item} />)}
        </div>
      </nav>
    </aside>
  )
}
