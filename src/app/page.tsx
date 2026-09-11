import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

export default async function RootPage() {
  const headersList = await headers()
  const host = headersList.get('host') ?? ''
  
  if (host.startsWith('hub.')) {
    redirect('/admin')
  } else {
    redirect('/dashboard')
  }
}
