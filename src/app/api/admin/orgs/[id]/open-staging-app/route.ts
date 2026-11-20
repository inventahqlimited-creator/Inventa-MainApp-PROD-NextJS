// Hub → "Open Staging InventaHQ": same as "Open InventaHQ", but signs the Hub admin in to the STAGING app
// (staging database, staging.inventahq.com) as an administrator of this organisation.
import { NextResponse } from 'next/server'
import { requireHub } from '@/lib/hub/guard'
import { isUuid, PLATFORM_ORG_ID } from '@/lib/auth/platform-admin'
import { openSupport } from '@/lib/hub/open-support'
import { stagingConfig, stagingEnabled, createStagingAdminClient } from '@/lib/hub/staging'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireHub()
  if ('res' in g) return g.res
  const { id } = await params
  if (!isUuid(id)) return NextResponse.json({ error: 'Bad id' }, { status: 400 })
  if (id === PLATFORM_ORG_ID) return NextResponse.json({ error: 'This is the internal Hub organisation — there is no customer app to open.' }, { status: 400 })
  if (!stagingEnabled()) return NextResponse.json({ error: 'Staging isn’t connected — add STAGING_SUPABASE_SERVICE_ROLE_KEY to this app’s secrets.' }, { status: 400 })

  const { appBase, linkKey } = stagingConfig()
  const r = await openSupport({
    hubDb: g.db, appDb: createStagingAdminClient(), user: g.user, orgId: id,
    appBase, linkKey, envLabel: 'Staging',
  })
  if ('error' in r) return NextResponse.json({ error: r.error }, { status: r.status })
  return NextResponse.json({ url: r.url })
}
