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
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
          <polyline points="9 22 9 12 15 12 15 22"/>
        </svg>
      ),
    },
  ]

  const isActive = (href: string) => pathname.startsWith(href)

  return (
    <aside style={{
      width: '240px', background: 'var(--slate)', display: 'flex', flexDirection: 'column',
      height: '100vh', flexShrink: 0, position: 'sticky', top: 0,
    }}>
      {/* Logo */}
      <div style={{ padding: '24px 20px 20px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
          <svg style={{ display: 'block', width: '140px' }} viewBox="0 0 480 76" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <clipPath id="sll"><polygon points="0,0 185,0 165,76 0,76"/></clipPath>
              <clipPath id="slr"><polygon points="185,0 480,0 480,76 165,76"/></clipPath>
              <mask id="slm"><rect width="480" height="76" fill="white"/><rect x="3" y="0" width="20" height="17" fill="black"/></mask>
            </defs>
            <text x="3" y="60" fontFamily="'Plus Jakarta Sans',sans-serif" fontSize="54" fontWeight="800" letterSpacing="-2" fill="rgba(255,255,255,0.28)" clipPath="url(#sll)" mask="url(#slm)">inventaHQ</text>
            <text x="3" y="60" fontFamily="'Plus Jakarta Sans',sans-serif" fontSize="54" fontWeight="800" letterSpacing="-2" fill="#5EEAD4" clipPath="url(#slr)" mask="url(#slm)">inventaHQ</text>
          </svg>
        </div>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: '6px',
          background: 'rgba(13,148,136,0.15)', border: '1px solid rgba(13,148,136,0.3)',
          borderRadius: '6px', padding: '3px 8px',
        }}>
          <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--teal-light)' }}/>
          <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--teal-light)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Hub</span>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '12px 8px' }}>
        <div style={{ fontSize: '9.5px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.25)', padding: '8px 10px 6px' }}>
          Management
        </div>
        {navItems.map(item => (
          <a key={item.href} href={item.href} style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            padding: '9px 10px', borderRadius: '8px', marginBottom: '2px',
            background: isActive(item.href) ? 'rgba(13,148,136,0.15)' : 'transparent',
            color: isActive(item.href) ? 'var(--teal-light)' : 'rgba(255,255,255,0.6)',
            textDecoration: 'none', fontSize: '13.5px', fontWeight: isActive(item.href) ? 600 : 400,
            transition: 'background 150ms, color 150ms',
          }}>
            {item.icon}
            {item.label}
          </a>
        ))}
      </nav>

      {/* User */}
      <div style={{ padding: '14px', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
          <div style={{
            width: '32px', height: '32px', borderRadius: '8px',
            background: 'var(--teal-surface)', color: 'var(--teal)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '11px', fontWeight: 700, flexShrink: 0,
          }}>
            {userName.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '12.5px', fontWeight: 600, color: 'white', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{userName}</div>
            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{userEmail}</div>
          </div>
        </div>
        <button onClick={signOut} style={{
          width: '100%', padding: '8px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)',
          background: 'transparent', color: 'rgba(255,255,255,0.4)', fontSize: '12px',
          cursor: 'pointer', fontFamily: 'var(--font-ui)', display: 'flex', alignItems: 'center',
          justifyContent: 'center', gap: '6px', transition: 'background 150ms, color 150ms',
        }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          Sign out
        </button>
      </div>
    </aside>
  )
}
