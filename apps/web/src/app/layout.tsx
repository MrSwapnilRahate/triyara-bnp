import './globals.css'

import type { Metadata } from 'next'
import { Inter, JetBrains_Mono, Newsreader } from 'next/font/google'
import type { ReactNode } from 'react'

import { Providers } from './providers'

// Self-hosted through next/font: no render-blocking request to Google, and the
// CSS variables feed --font-sans / --font-serif / --font-mono in the token layer.
const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
})

/**
 * The marketing display face. Headlines on the public site, nothing else.
 *
 * WHY A SERIF, AND WHY THIS ONE: the application is set in Inter and should
 * stay that way - it is the right tool for dense tables. But one grotesque
 * doing display, UI and data is what makes a site interchangeable with every
 * other site, and a headline is where a company either sounds like itself or
 * does not. A serif also matches what Triyara actually is: a trade house whose
 * product is a verified record, not a feature.
 *
 * Newsreader over the alternatives on two measurements, not taste. Set at 44px
 * in the hero's real 559px column, "Indian suppliers, verified." occupies 480px
 * - 79px of headroom, so the headline breaks once, at the sentence. Literata
 * needed 540px, leaving 19px, which one font-swap turns into an orphaned
 * "matched.". And Newsreader's lower stroke contrast holds up on the dark
 * canvas this app defaults to, where Source Serif 4's hairlines visibly thin.
 *
 * `weight` is a single value because that is what the page renders - the hero
 * h1 at `font-semibold`, and nothing else. It is not tidiness: asking for two
 * weights makes next/font ship the whole variable file, and asking for one
 * makes it cut a static instance. Measured on the built latin subset that is
 * 58,152 bytes against 23,888 - a 33 KB difference for a weight nothing sets.
 * Add a second weight here when something actually sets it.
 */
const serif = Newsreader({
  subsets: ['latin'],
  display: 'swap',
  weight: ['600'],
  style: ['normal'],
  variable: '--font-newsreader',
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
      className={`${inter.variable} ${serif.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <body className="bg-canvas text-content antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
