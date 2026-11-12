import type { Metadata } from 'next'
import localFont from 'next/font/local'
import './globals.css'

// Fonts are bundled in the app (src/app/fonts) so builds never depend on Google Fonts being reachable.
const plusJakartaSans = localFont({
  src: './fonts/plus-jakarta-sans-latin-wght-normal.woff2',
  weight: '200 800',
  variable: '--font-display',
  display: 'swap',
})

const inter = localFont({
  src: './fonts/inter-latin-wght-normal.woff2',
  weight: '100 900',
  variable: '--font-ui',
  display: 'swap',
})

export const metadata: Metadata = {
  title: { default: 'inventaHQ', template: '%s — inventaHQ' },
  description: 'Inventory Intelligence Platform',
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
