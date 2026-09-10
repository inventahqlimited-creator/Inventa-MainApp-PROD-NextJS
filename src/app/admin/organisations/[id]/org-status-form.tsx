'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function OrgStatusForm({ orgId, currentStatus }: { orgId: string; currentStatus: string }) {
  const [status, setStatus] = useState(currentStatus)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleSave() {
    setSaving(true)
    await (supabase as any).from('organisations').update({ status }).eq('id', orgId)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    router.refresh()
  }

  return (
    <div style={{ background: 'white', borderRadius: '14px', boxShadow: 'var(--shadow-sm)', padding: '20px 24px' }}>
      <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--gray-400)', marginBottom: '14px' }}>
        Account Status
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <select
          value={status}
          onChange={e => setStatus(e.target.value)}
          style={{ height: '40px', padding: '0 12px', border: '1.5px solid var(--gray-200)', borderRadius: '9px', fontFamily: 'var(--font-ui)', fontSize: '13.5px', color: 'var(--gray-900)', background: 'white', cursor: 'pointer', outline: 'none' }}
        >
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="suspended">Suspended</option>
        </select>
        <button
          onClick={handleSave}
          disabled={saving || status === currentStatus}
          style={{
            height: '40px', padding: '0 18px', borderRadius: '9px', border: 'none',
            background: saved ? '#D1FAE5' : 'var(--teal)', color: saved ? '#065F46' : 'white',
            fontSize: '13px', fontWeight: 600, fontFamily: 'var(--font-ui)',
            cursor: saving || status === currentStatus ? 'not-allowed' : 'pointer',
            opacity: status === currentStatus ? 0.5 : 1, transition: 'background 200ms',
          }}
        >
          {saving ? 'Saving…' : saved ? '✓ Saved' : 'Update Status'}
        </button>
      </div>
    </div>
  )
}
