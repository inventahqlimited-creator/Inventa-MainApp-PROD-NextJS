import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { Plus_Jakarta_Sans, Inter } from 'next/font/google'
import './globals.css'

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-display',
  display: 'swap',
})

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-ui',
  display: 'swap',
})

// Production keeps the plain name; the staging app says so in the tab
export async function generateMetadata(): Promise<Metadata> {
  const host = ((await headers()).get('host') ?? '').toLowerCase()
  const staging = host.includes('staging') || (process.env.NEXT_PUBLIC_APP_URL ?? '').toLowerCase().includes('staging')
  return {
    title: staging ? { default: 'inventaHQ | Staging', template: '%s | Staging' } : { default: 'inventaHQ', template: '%s — inventaHQ' },
    description: 'Inventory Intelligence Platform',
  }
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${plusJakartaSans.variable} ${inter.variable}`}>
      <body>{children}</body>
    </html>
  )
}
