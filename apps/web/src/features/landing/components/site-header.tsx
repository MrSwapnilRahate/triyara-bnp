'use client'

import {
  Button,
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
  IconButton,
} from '@triyara/ui'
import { Menu } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'

/**
 * Landing navigation.
 *
 * The page had none: `app/page.tsx` went straight from hero to footer, and the
 * only `<nav>` in the marketing surface was the footer's. A visitor who scrolled
 * past the hero had no way back to a call to action and no sense that anything
 * else existed.
 *
 * Deliberately four links and one action. A trading company's site earns trust
 * by being navigable, not by being comprehensive - a mega-menu here would be
 * inventing depth the site does not have.
 *
 * Anchors point at the `id`s the sections already carry, so nothing downstream
 * changes to support this.
 */
const LINKS = [
  { href: '#how-it-works', label: 'How it works' },
  { href: '#why-triyara', label: 'Why TRIYARA' },
  { href: '#faq', label: 'FAQ' },
  { href: '#contact', label: 'Contact' },
] as const

function Wordmark() {
  return (
    <Link
      href="/"
      className="focus-ring flex shrink-0 items-center gap-gap rounded-sm"
      aria-label="TRIYARA — home"
    >
      <Image src="/triyara-mark.png" alt="" width={26} height={26} priority className="size-6" />
      <span className="text-md font-semibold tracking-widest text-content">TRIYARA</span>
    </Link>
  )
}

export function SiteHeader() {
  const [open, setOpen] = useState(false)

  return (
    // Solid, not translucent: a blurred bar over scrolling content is the
    // clearest single tell of a template, and it costs legibility for nothing.
    <header className="sticky top-0 z-raised border-b border-line bg-surface">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-gutter">
        <Wordmark />

        <nav aria-label="Primary" className="hidden lg:block">
          <ul className="flex items-center gap-section">
            {LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="focus-ring rounded-sm text-base text-content-muted transition-colors duration-fast hover:text-content"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="hidden items-center gap-gap-lg lg:flex">
          <Link
            href="/login"
            className="focus-ring rounded-sm text-base text-content-muted transition-colors duration-fast hover:text-content"
          >
            Sign in
          </Link>
          {/* One action, pointing at the section that offers both sides. The
              hero splits supplier from buyer; repeating that split up here
              would ask a visitor to choose before they know what this is. */}
          <Button asChild variant="primary" size="sm">
            <Link href="#register">Register</Link>
          </Button>
        </div>

        <Drawer open={open} onOpenChange={setOpen}>
          <DrawerTrigger asChild className="lg:hidden">
            <IconButton label="Open menu" variant="ghost" size="sm">
              <Menu />
            </IconButton>
          </DrawerTrigger>
          <DrawerContent width="sm">
            <DrawerHeader>
              <DrawerTitle className="text-md font-semibold tracking-widest text-content">
                TRIYARA
              </DrawerTitle>
            </DrawerHeader>
            <DrawerBody>
              <nav aria-label="Primary">
                <ul className="divide-y divide-line">
                  {LINKS.map((link) => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        onClick={() => setOpen(false)}
                        className="focus-ring block rounded-sm py-gap-lg text-md text-content"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                  <li>
                    <Link
                      href="/login"
                      onClick={() => setOpen(false)}
                      className="focus-ring block rounded-sm py-gap-lg text-md text-content"
                    >
                      Sign in
                    </Link>
                  </li>
                </ul>
              </nav>
              <Button asChild variant="primary" fullWidth className="mt-gutter">
                <Link href="#register" onClick={() => setOpen(false)}>
                  Register
                </Link>
              </Button>
            </DrawerBody>
          </DrawerContent>
        </Drawer>
      </div>
    </header>
  )
}
