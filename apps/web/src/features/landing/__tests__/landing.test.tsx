import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { expectNoAxeViolations } from '@/test/axe'

import { Contact } from '../components/contact'
import { Faq } from '../components/faq'
import { Hero } from '../components/hero'
import { Process } from '../components/process'
import { RegisterCta } from '../components/register-cta'
import { SiteFooter } from '../components/site-footer'
import { Why } from '../components/why'
import { BUYER_FAQ, BUYER_JOURNEY, CONTACT, SUPPLIER_FAQ, SUPPLIER_JOURNEY, WHY } from '../content'

describe('Hero', () => {
  it('offers both registration paths above anything else', () => {
    render(<Hero />)
    // Neither audience is guessed at: a visitor is one or the other, and
    // hiding their path costs the registration.
    expect(screen.getByRole('link', { name: /register as supplier/i })).toHaveAttribute(
      'href',
      '/register/supplier',
    )
    expect(screen.getByRole('link', { name: /register as buyer/i })).toHaveAttribute(
      'href',
      '/register/buyer',
    )
  })

  it('leads with one h1 that says what this is', () => {
    render(<Hero />)
    const headings = screen.getAllByRole('heading', { level: 1 })
    expect(headings).toHaveLength(1)
    expect(headings[0]).toHaveTextContent(/suppliers/i)
  })
})

describe('Process', () => {
  it('shows both journeys, each in its own list and in order', () => {
    render(<Process />)
    // Ordered lists carry position for a screen reader without alt text on a
    // chevron; the order is the meaning here. Both journeys start with
    // "Register", so each is checked inside its own list rather than globally.
    const lists = screen.getAllByRole('list')
    expect(lists.length).toBeGreaterThanOrEqual(2)

    const [supplierList, buyerList] = lists as [HTMLElement, HTMLElement]
    const titlesIn = (list: HTMLElement) =>
      within(list)
        .getAllByRole('listitem')
        .map((li) => li.querySelector('p')?.textContent ?? '')

    expect(titlesIn(supplierList)).toEqual(SUPPLIER_JOURNEY.map((s) => s.title))
    expect(titlesIn(buyerList)).toEqual(BUYER_JOURNEY.map((s) => s.title))
  })
})

describe('Why', () => {
  it('renders all six differentiators', () => {
    render(<Why />)
    expect(WHY).toHaveLength(6)
    for (const item of WHY) {
      expect(screen.getByRole('heading', { name: item.title })).toBeInTheDocument()
    }
  })
})

describe('RegisterCta', () => {
  it('is buttons only, pointing at the real registration routes', () => {
    render(<RegisterCta />)
    expect(screen.getByRole('link', { name: /become a supplier/i })).toHaveAttribute(
      'href',
      '/register/supplier',
    )
    expect(screen.getByRole('link', { name: /become a buyer/i })).toHaveAttribute(
      'href',
      '/register/buyer',
    )
  })
})

describe('Faq', () => {
  it('keeps supplier and buyer questions apart', () => {
    render(<Faq />)
    expect(screen.getByRole('heading', { name: /for suppliers/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /for buyers/i })).toBeInTheDocument()
    // "What does it cost" exists on both sides with different answers, which is
    // the whole reason they are separate lists.
    expect(screen.getAllByRole('button', { name: /what does it cost/i }).length).toBe(2)
  })

  it('reveals an answer when a question is opened', async () => {
    const user = userEvent.setup()
    render(<Faq />)
    const question = screen.getByRole('button', { name: SUPPLIER_FAQ[1].q })
    await user.click(question)
    expect(await screen.findByText(SUPPLIER_FAQ[1].a)).toBeVisible()
  })

  it('answers every question it asks', () => {
    for (const item of [...SUPPLIER_FAQ, ...BUYER_FAQ]) {
      expect(item.a.trim().length).toBeGreaterThan(20)
    }
  })
})

describe('Contact', () => {
  it('offers a working email link', () => {
    render(<Contact />)
    expect(screen.getByRole('link', { name: CONTACT.email })).toHaveAttribute(
      'href',
      `mailto:${CONTACT.email}`,
    )
  })

  it('omits channels that are not configured rather than inventing them', () => {
    // A fabricated WhatsApp number on a public page sends suppliers to a
    // stranger. Absent is correct until a real number exists.
    render(
      <Contact contact={{ ...CONTACT, whatsapp: null, whatsappDisplay: null, location: null }} />,
    )
    expect(screen.queryByText(/whatsapp/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/^location$/i)).not.toBeInTheDocument()
  })

  it('renders a click-to-chat link once a real number is configured', () => {
    render(
      <Contact
        contact={{
          ...CONTACT,
          whatsapp: '+91 98765 43210',
          whatsappDisplay: '+91 98765 43210',
          location: 'Kochi, Kerala',
        }}
      />,
    )
    // wa.me needs digits only; the display keeps the readable form.
    expect(screen.getByRole('link', { name: '+91 98765 43210' })).toHaveAttribute(
      'href',
      'https://wa.me/919876543210',
    )
    expect(screen.getByText('Kochi, Kerala')).toBeInTheDocument()
  })
})

describe('SiteFooter', () => {
  it('links privacy, terms and contact', () => {
    render(<SiteFooter />)
    const nav = screen.getByRole('navigation', { name: /footer/i })
    expect(within(nav).getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/privacy')
    expect(within(nav).getByRole('link', { name: 'Terms' })).toHaveAttribute('href', '/terms')
    expect(within(nav).getByRole('link', { name: 'Contact' })).toHaveAttribute(
      'href',
      `mailto:${CONTACT.email}`,
    )
  })
})

describe('landing accessibility', () => {
  it.each([
    ['hero', <Hero key="h" />],
    ['process', <Process key="p" />],
    ['why', <Why key="w" />],
    ['register cta', <RegisterCta key="c" />],
    ['faq', <Faq key="f" />],
    ['contact', <Contact key="ct" />],
    ['footer', <SiteFooter key="ft" />],
  ])('%s has no violations', async (_name, node) => {
    const { container } = render(node)
    await expectNoAxeViolations(container)
  })
})

describe('landing copy', () => {
  it('carries no placeholder text', () => {
    const all = JSON.stringify({ WHY, SUPPLIER_JOURNEY, BUYER_JOURNEY, SUPPLIER_FAQ, BUYER_FAQ })
    for (const banned of ['lorem', 'ipsum', 'TODO', 'TBD', 'placeholder', 'coming soon']) {
      expect(all.toLowerCase()).not.toContain(banned.toLowerCase())
    }
  })
})
