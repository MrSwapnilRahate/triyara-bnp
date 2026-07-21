import './globals.css'

import type { Metadata } from 'next'
import type { ReactNode } from 'react'

import { Providers } from './providers'

export const metadata: Metadata = {
  title: 'Triyara Business Network Platform',
  description: 'Internal business network platform for Triyara Exports LLP.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-navy-deep text-white antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
