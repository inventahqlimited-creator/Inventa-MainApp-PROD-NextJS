import type { Metadata } from 'next'
import localFont from 'next/font/local'
import './globals.css'

const plusJakartaSans = localFont({
  src: [
    { path: '../../public/fonts/plus-jakarta-sans/PlusJakartaSans-Regular.ttf',   weight: '400', style: 'normal' },
    { path: '../../public/fonts/plus-jakarta-sans/PlusJakartaSans-Medium.ttf',    weight: '500', style: 'normal' },
    { path: '../../public/fonts/plus-jakarta-sans/PlusJakartaSans-SemiBold.ttf',  weight: '600', style: 'normal' },
    { path: '../../public/fonts/plus-jakarta-sans/PlusJakartaSans-Bold.ttf',      weight: '700', style: 'normal' },
    { path: '../../public/fonts/plus-jakarta-sans/PlusJakartaSans-ExtraBold.ttf', weight: '800', style: 'normal' },
  ],
  variable: '--font-display',
  display: 'swap',
})

const inter = localFont({
  src: [
    { path: '../../public/fonts/inter/Inter-Regular.ttf',   weight: '400', style: 'normal' },
    { path: '../../public/fonts/inter/Inter-Medium.ttf',    weight: '500', style: 'normal' },
    { path: '../../public/fonts/inter/Inter-SemiBold.ttf',  weight: '600', style: 'normal' },
    { path: '../../public/fonts/inter/Inter-Bold.ttf',      weight: '700', style: 'normal' },
  ],
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
