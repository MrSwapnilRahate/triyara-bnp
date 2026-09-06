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
  // Declared here rather than through the app/icon.* file convention so there
  // is one place that says what the browser gets, and no chance of two
  // declarations disagreeing. The tab icons put the emblem on the brand navy:
  // the mark is gold on dark by design, and a tab may be either, so the
  // container is what keeps it legible without touching the artwork.
  //
  // `/favicon.ico` is listed because a browser asks for that path whether or
  // not anything links to it - it is the one icon request nothing here
  // controls. Without the file that request 404s on every page view, which is
  // how this was noticed. It lives in `public/` rather than `app/favicon.ico`
  // deliberately: the app-directory convention would emit a SECOND link tag
  // next to these, which is exactly the disagreement this block exists to
  // avoid. Same 32px artwork, wrapped in an ICO container.
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '32x32', type: 'image/x-icon' },
      { url: '/icon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [{ url: '/apple-icon.png', sizes: '180x180', type: 'image/png' }],
  },
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
