'use client'

import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface Props {
  userName: string
  userEmail: string
}

export default function HubSidebar({ userName, userEmail }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const navItems = [
    {
      label: 'Organisations',
      href: '/admin/organisations',
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
          <polyline points="9 22 9 12 15 12 15 22"/>
        </svg>
      ),
    },
  ]

  const isActive = (href: string) => pathname.startsWith(href)

  return (
    <aside style={{
      width: '256px',
      background: '#0A1628',
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      flexShrink: 0,
      position: 'sticky',
      top: 0,
      borderRight: '1px solid rgba(255,255,255,0.06)',
    }}>

      {/* Logo + Hub badge */}
      <div style={{ padding: '28px 20px 22px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <svg style={{ display: 'block', width: '130px', marginBottom: '14px' }} viewBox="0 0 480 76" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <clipPath id="sll"><polygon points="0,0 185,0 165,76 0,76"/></clipPath>
            <clipPath id="slr"><polygon points="185,0 480,0 480,76 165,76"/></clipPath>
            <mask id="slm"><rect width="480" height="76" fill="white"/><rect x="3" y="0" width="20" height="17" fill="black"/></mask>
          </defs>
          <text x="3" y="60" fontFamily="'Plus Jakarta Sans',sans-serif" fontSize="54" fontWeight="800" letterSpacing="-2" fill="rgba(255,255,255,0.22)" clipPath="url(#sll)" mask="url(#slm)">inventaHQ</text>
          <text x="3" y="60" fontFamily="'Plus Jakarta Sans',sans-serif" fontSize="54" fontWeight="800" letterSpacing="-2" fill="#5EEAD4" clipPath="url(#slr)" mask="url(#slm)">inventaHQ</text>
        </svg>

        {/* Hub badge */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: '7px',
          background: 'rgba(13,148,136,0.12)',
          border: '1px solid rgba(13,148,136,0.25)',
          borderRadius: '7px', padding: '5px 10px',
        }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#5EEAD4" strokeWidth="2.5">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
          </svg>
          <span style={{ fontSize: '10.5px', fontWeight: 700, color: '#5EEAD4', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            Hub
          </span>
          <span style={{ fontSize: '10px', color: 'rgba(94,234,212,0.5)', fontWeight: 500 }}>
            Internal
          </span>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '16px 10px' }}>
        <div style={{
          fontSize: '9px', fontWeight: 700, letterSpacing: '0.14em',
          textTransform: 'uppercase', color: 'rgba(255,255,255,0.2)',
          padding: '6px 10px 8px',
        }}>
          Management
        </div>
        {navItems.map(item => (
          <a key={item.href} href={item.href} style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            padding: '9px 10px', borderRadius: '8px', marginBottom: '2px',
            background: isActive(item.href) ? 'rgba(13,148,136,0.12)' : 'transparent',
            color: isActive(item.href) ? '#5EEAD4' : 'rgba(255,255,255,0.5)',
            textDecoration: 'none', fontSize: '13px',
            fontWeight: isActive(item.href) ? 600 : 400,
            transition: 'background 150ms, color 150ms',
            borderLeft: isActive(item.href) ? '2px solid #0D9488' : '2px solid transparent',
          }}>
            {item.icon}
            {item.label}
          </a>
        ))}
      </nav>

      {/* Admin warning */}
      <div style={{ padding: '0 14px 10px' }}>
        <div style={{
          background: 'rgba(239,68,68,0.08)',
          border: '1px solid rgba(239,68,68,0.15)',
          borderRadius: '8px', padding: '8px 10px',
          display: 'flex', alignItems: 'center', gap: '7px',
        }}>
          <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#EF4444', flexShrink: 0 }}/>
          <span style={{ fontSize: '10.5px', color: 'rgba(239,68,68,0.7)', fontWeight: 600 }}>
            Admin access — handle with care
          </span>
        </div>
      </div>

      {/* User */}
      <div style={{ padding: '14px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
          <div style={{
            width: '34px', height: '34px', borderRadius: '8px',
            background: 'rgba(13,148,136,0.15)',
            color: '#5EEAD4',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '11px', fontWeight: 700, flexShrink: 0,
            border: '1px solid rgba(13,148,136,0.2)',
          }}>
            {userName.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '12.5px', fontWeight: 600, color: 'rgba(255,255,255,0.85)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {userName}
            </div>
            <div style={{ fontSize: '10.5px', color: 'rgba(255,255,255,0.3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {userEmail}
            </div>
          </div>
        </div>
        <button onClick={signOut} style={{
          width: '100%', padding: '8px', borderRadius: '8px',
          border: '1px solid rgba(255,255,255,0.08)',
          background: 'transparent', color: 'rgba(255,255,255,0.3)',
          fontSize: '12px', cursor: 'pointer', fontFamily: 'var(--font-ui)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: '6px', transition: 'background 150ms, color 150ms',
        }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
          Sign out
        </button>
      </div>
    </aside>
  )
}
