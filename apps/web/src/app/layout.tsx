import './globals.css'

import type { Metadata } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import type { ReactNode } from 'react'

import { Providers } from './providers'

// Self-hosted through next/font: no render-blocking request to Google, and the
// CSS variables feed --font-sans / --font-mono in the token layer.
const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
})

const mono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-jetbrains',
})

export const metadata: Metadata = {
  title: 'Triyara Business Network Platform',
  description: 'Internal business network platform for Triyara Exports LLP.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      // data-theme is written by ThemeProvider after mount. `dark` here is the
      // pre-hydration default, so the first paint is not a white flash.
      data-theme="dark"
      data-density="comfortable"
      className={`${inter.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <body className="bg-canvas text-content antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
