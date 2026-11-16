// src/app/(app)/sales/returns/new/page.tsx — ?so=<closed order id>
import { redirect } from 'next/navigation'
import { getAccess, can } from '@/lib/auth/access'
import { loadReturnScreen } from '@/lib/credit-notes/screen'
import CreditNoteForm from '@/components/app/credit-note-form'

export const dynamic = 'force-dynamic'

export default async function NewReturnPage({ searchParams }: { searchParams: Promise<{ so?: string }> }) {
  const { so } = await searchParams
  const a = await getAccess()
  if (!a) redirect('/login')
  if (!can(a, 'process_returns')) redirect('/no-access')
  const d = await loadReturnScreen(a, { so })
  if ('redirect' in d) redirect(d.redirect)
  return <CreditNoteForm data={d} canProcess isAdmin={a.isAdmin} />
}
