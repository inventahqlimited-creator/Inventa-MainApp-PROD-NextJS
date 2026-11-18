// src/app/(app)/sales/returns/[id]/page.tsx — view, edit (while Open), close or cancel one credit note
import { redirect } from 'next/navigation'
import { getAccess, can } from '@/lib/auth/access'
import { loadReturnScreen } from '@/lib/credit-notes/screen'
import CreditNoteForm from '@/components/app/credit-note-form'
import { relatedForCreditNote } from '@/lib/related-docs'

export const dynamic = 'force-dynamic'

export default async function ReturnPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ edit?: string }> }) {
  const { id } = await params
  const { edit } = await searchParams
  const a = await getAccess()
  if (!a) redirect('/login')
  if (!can(a, 'view_sales')) redirect('/no-access')
  const d = await loadReturnScreen(a, { id })
  if ('redirect' in d) redirect(d.redirect)
  const related = await relatedForCreditNote(a.db, a.orgId, id)
  return <CreditNoteForm data={d} canProcess={can(a, 'process_returns')} isAdmin={a.isAdmin} startInEdit={edit === '1'} related={related} />
}
