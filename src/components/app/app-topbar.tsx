'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function AppTopbar({
  displayName,
  initials,
  role,
  orgName,
  email,
  canCreateContact = true,
  canCreateProduct = true,
  canViewProducts = true,
}: {
  displayName: string
  initials: string
  role: string
  orgName: string
  email: string
  canCreateContact?: boolean
  canCreateProduct?: boolean
  canViewProducts?: boolean
}) {
  const router = useRouter()
  const supabase = createClient()
  const [profileOpen, setProfileOpen] = useState(false)
  const [quickOpen, setQuickOpen] = useState(false)
  const profileRef = useRef<HTMLDivElement>(null)
  const quickRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false)
      }
      if (quickRef.current && !quickRef.current.contains(e.target as Node)) {
        setQuickOpen(false)
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const roleLabel =
    role === 'admin' ? 'Administrator' :
    role === 'manager' ? 'Manager' :
    role === 'read_only' ? 'Read Only' : 'Staff'

  // Show name if set, fall back to email
  const nameDisplay = displayName && displayName !== email ? displayName : email

  return (
    <header className="topbar">
      <div className="search-wrap">
        <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input className="search-input" placeholder="Search contacts, products, orders…" />
      </div>

      <div className="topbar-spacer" />

      <div className="topbar-actions">

        {/* + Quick actions — FIRST */}
        <div style={{ position: 'relative' }} ref={quickRef}>
          <button
            className="plus-btn"
            title="Quick actions"
            onClick={() => setQuickOpen(o => !o)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </button>

          {quickOpen && (
            <div className="inv-dropdown" style={{ display: 'block', minWidth: 230, right: 0, left: 'auto' }}>
              {(canCreateContact || (canViewProducts && canCreateProduct)) && (
                <div className="dd-section-label">CONTACTS &amp; PRODUCTS</div>
              )}
              {canCreateContact && (
              <div className="dd-item" onClick={() => { setQuickOpen(false); router.push('/contacts?new=1') }}>
                <div className="dd-icon-wrap">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                    <circle cx="12" cy="7" r="4"/>
                  </svg>
                </div>
                New Contact
              </div>
              )}
              {canViewProducts && canCreateProduct && (
              <div className="dd-item" onClick={() => { setQuickOpen(false); router.push('/products?new=1') }}>
                <div className="dd-icon-wrap">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                  </svg>
                </div>
                New Product
              </div>
              )}

              <div className="dd-sep" />

              <div className="dd-section-label">ORDERS</div>
              <div className="dd-item" onClick={() => { setQuickOpen(false); router.push('/sales/new') }}>
                <div className="dd-icon-wrap">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="12" y1="1" x2="12" y2="23"/>
                    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                  </svg>
                </div>
                New Sales Order
              </div>
              <div className="dd-item" onClick={() => { setQuickOpen(false); router.push('/purchases/new') }}>
                <div className="dd-icon-wrap">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
                    <line x1="3" y1="6" x2="21" y2="6"/>
                    <path d="M16 10a4 4 0 0 1-8 0"/>
                  </svg>
                </div>
                New Purchase Order
              </div>
              <div className="dd-item" onClick={() => { setQuickOpen(false); router.push('/transfers/new') }}>
                <div className="dd-icon-wrap">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="17 1 21 5 17 9"/>
                    <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
                    <polyline points="7 23 3 19 7 15"/>
                    <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
                  </svg>
                </div>
                New Transfer
              </div>
            </div>
          )}
        </div>

        {/* Notification bell — SECOND */}
        <button className="icon-btn" title="Notifications">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
          </svg>
        </button>

        {/* Help — THIRD */}
        <button className="icon-btn" title="Help">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        </button>

        <div className="topbar-divider" />

        {/* Profile dropdown — LAST */}
        <div style={{ position: 'relative' }} ref={profileRef}>
          <div className="topbar-user" onClick={() => setProfileOpen(o => !o)}>
            <div className="topbar-avatar">{initials}</div>
            <div className="topbar-user-info">
              <div className="topbar-user-name">{nameDisplay}</div>
              <div className="topbar-user-role">{roleLabel}</div>
            </div>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--gray-400)" strokeWidth="2.5" style={{ marginLeft: 4, flexShrink: 0 }}>
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </div>

          {profileOpen && (
            <div className="inv-dropdown" style={{ display: 'block', minWidth: 220, right: 0, left: 'auto' }}>
              <div className="profile-dropdown-header">
                <div className="profile-dropdown-biz">{orgName}</div>
                <div className="profile-dropdown-email">{email}</div>
              </div>
              <div className="dd-item dd-item-danger" onClick={handleSignOut}>
                <div className="dd-icon-wrap">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                    <polyline points="16 17 21 12 16 7"/>
                    <line x1="21" y1="12" x2="9" y2="12"/>
                  </svg>
                </div>
                Log Out
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
