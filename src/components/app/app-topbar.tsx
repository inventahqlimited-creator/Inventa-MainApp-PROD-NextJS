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
}: {
  displayName: string
  initials: string
  role: string
  orgName: string
  email: string
}) {
  const router = useRouter()
  const supabase = createClient()
  const [profileOpen, setProfileOpen] = useState(false)
  const profileRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false)
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
        <button className="icon-btn" title="Help">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        </button>

        <div className="topbar-divider" />

        <div style={{ position: 'relative' }} ref={profileRef}>
          <div className="topbar-user" onClick={() => setProfileOpen(o => !o)}>
            <div className="topbar-avatar">{initials}</div>
            <div className="topbar-user-info">
              <div className="topbar-user-name">{displayName}</div>
              <div className="topbar-user-role">{roleLabel}</div>
            </div>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--gray-400)" strokeWidth="2.5" style={{ marginLeft: 4, flexShrink: 0 }}>
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </div>

          {profileOpen && (
            <div className="inv-dropdown" style={{ display: 'block', minWidth: 220 }}>
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
