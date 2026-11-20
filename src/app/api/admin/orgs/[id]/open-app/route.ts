// Hub → "Open InventaHQ": signs the Hub admin in to the app as an administrator of this organisation.
import { NextResponse } from 'next/server'
import { requireHub } from '@/lib/hub/guard'
import { isUuid, PLATFORM_ORG_ID } from '@/lib/auth/platform-admin'
import { appUrl } from '@/lib/hub/support'
import { openSupport } from '@/lib/hub/open-support'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireHub()
  if ('res' in g) return g.res
  const { id } = await params
  if (!isUuid(id)) return NextResponse.json({ error: 'Bad id' }, { status: 400 })
  if (id === PLATFORM_ORG_ID) return NextResponse.json({ error: 'This is the internal Hub organisation — there is no customer app to open.' }, { status: 400 })

  const r = await openSupport({ hubDb: g.db, appDb: g.db, user: g.user, orgId: id, appBase: appUrl() })
  if ('error' in r) return NextResponse.json({ error: r.error }, { status: r.status })
  return NextResponse.json({ url: r.url })
}
