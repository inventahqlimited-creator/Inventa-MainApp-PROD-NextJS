'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import NotificationBell from '@/components/app/notification-bell'
import GlobalSearch from '@/components/app/global-search'
import ProfileModal, { type ProfileData } from '@/components/app/profile-modal'
import { signOutIfSessionExpired } from '@/lib/auth/remember'

export default function AppTopbar({
  displayName,
  initials,
  role,
  orgName,
  email,
  avatarUrl = '',
  canCreateContact = true,
  canCreateProduct = true,
  canViewProducts = true,
}: {
  displayName: string
  initials: string
  role: string
  orgName: string
  email: string
  avatarUrl?: string
  canCreateContact?: boolean
  canCreateProduct?: boolean
  canViewProducts?: boolean
}) {
  const router = useRouter()
  const supabase = createClient()
  const [profileOpen, setProfileOpen] = useState(false)
  const [quickOpen, setQuickOpen] = useState(false)
  const [showProfile, setShowProfile] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [me, setMe] = useState({ name: displayName, avatar: avatarUrl })
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

  // "Remember me" unticked: end the session once the browser has been closed; also warm up /login for a quick sign-out
  useEffect(() => {
    signOutIfSessionExpired(supabase)
    router.prefetch('/login')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSignOut() {
    if (signingOut) return
    setSigningOut(true) // show the "Signing out…" screen straight away
    setProfileOpen(false)
    try { await supabase.auth.signOut() } catch { /* the cookie is cleared locally even if the network call fails */ }
    window.location.replace('/login')
  }

  const roleLabel =
    role === 'admin' ? 'Administrator' :
    role === 'manager' ? 'Manager' :
    role === 'read_only' ? 'Read Only' : 'Staff'

  // Show name if set, fall back to email
  const nameDisplay = me.name && me.name !== email ? me.name : email
  const meInitials = (nameDisplay || '?').split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)

  return (
    <>
    {signingOut && (
      <div
        role="status"
        aria-live="polite"
        style={{
          position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 14,
          background: 'rgba(15,45,53,0.92)', color: 'white', fontFamily: 'var(--font-ui)', fontSize: 15,
        }}
      >
        <div style={{ width: 28, height: 28, borderRadius: '50%', border: '3px solid rgba(255,255,255,0.25)', borderTopColor: 'var(--teal-light, #5EEAD4)', animation: 'inv-spin 0.8s linear infinite' }} />
        Signing out…
        <style>{'@keyframes inv-spin { to { transform: rotate(360deg) } }'}</style>
      </div>
    )}
    <header className="topbar">
      <GlobalSearch canViewProducts={canViewProducts} />

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
                  {/* Matches sidebar Contacts icon — two-person group */}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                    <circle cx="9" cy="7" r="4"/>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                  </svg>
                </div>
                New Contact
              </div>
              )}
              {canViewProducts && canCreateProduct && (
              <div className="dd-item" onClick={() => { setQuickOpen(false); router.push('/products?new=1') }}>
                <div className="dd-icon-wrap">
                  {/* Matches sidebar Products icon — box with inner lines */}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                    <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
                    <line x1="12" y1="22.08" x2="12" y2="12"/>
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

        {/* Separator between + and notification bell */}
        <div className="topbar-divider" />

        {/* Notification bell — SECOND */}
        <NotificationBell />

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
            <div className="topbar-avatar" style={me.avatar ? { padding: 0, overflow: 'hidden' } : undefined}>
              {me.avatar
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={me.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : (me.name === displayName ? initials : meInitials)}
            </div>
            <div className="topbar-user-info">
              <div className="topbar-user-name">{nameDisplay}</div>
              <div className="topbar-user-role">{orgName}</div>
            </div>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--gray-400)" strokeWidth="2.5" style={{ marginLeft: 4, flexShrink: 0 }}>
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </div>

          {profileOpen && (
            <div className="inv-dropdown" style={{ display: 'block', minWidth: 220, right: 0, left: 'auto' }}>
              <div className="profile-dropdown-header">
                <div className="profile-dropdown-biz">{orgName} · {roleLabel}</div>
                <div className="profile-dropdown-email">{email}</div>
              </div>
              <div className="dd-item" onClick={() => { setProfileOpen(false); setShowProfile(true) }}>
                <div className="dd-icon-wrap">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                    <circle cx="12" cy="7" r="4"/>
                  </svg>
                </div>
                Profile
              </div>
              <div className="dd-sep" />
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
    {showProfile && (
      <ProfileModal
        onClose={() => setShowProfile(false)}
        onSaved={(p: ProfileData) => {
          const full = [p.first_name, p.last_name].filter(Boolean).join(' ')
          setMe({ name: full || email, avatar: p.avatar_url })
          router.refresh()
        }}
      />
    )}
    </>
  )
}
