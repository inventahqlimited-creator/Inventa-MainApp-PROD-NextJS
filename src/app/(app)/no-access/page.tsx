// src/app/(app)/no-access/page.tsx
// Shown when someone's role doesn't give them access to any screen yet.
export default function NoAccessPage() {
  return (
    <div style={{ padding: 64, textAlign: 'center', maxWidth: 480, margin: '0 auto' }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, color: 'var(--slate)', marginBottom: 8 }}>No access yet</div>
      <div style={{ fontSize: 14, color: 'var(--gray-500)', lineHeight: 1.6 }}>
        Your role doesn’t give you access to any part of InventaHQ yet. Ask an admin to update your role.
      </div>
    </div>
  )
}
