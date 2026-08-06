import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { TooltipProvider } from '../components/tooltip'
import { AppShell, SkipToContent } from '../layout/app-shell'
import { AuthLayout } from '../layout/auth-layout'
import { OrganizationSwitcher } from '../layout/organization-switcher'
import { isActive, type NavGroup, Sidebar } from '../layout/sidebar'
import { TopBar } from '../layout/top-bar'
import { expectNoAxeViolations } from './axe'

const GROUPS: NavGroup[] = [
  { items: [{ label: 'Dashboard', href: '/dashboard', icon: <svg />, matchNested: false }] },
  {
    heading: 'Sourcing',
    items: [
      { label: 'RFQs', href: '/rfqs', icon: <svg />, badge: 3 },
      { label: 'Quotations', href: '/quotations', icon: <svg /> },
    ],
  },
]

describe('isActive', () => {
  it('lights a module for its nested routes', () => {
    expect(isActive('/rfqs/abc/responses', { label: '', href: '/rfqs', icon: null })).toBe(true)
  })

  it('does not match a sibling with a shared prefix', () => {
    expect(isActive('/rfqs-archive', { label: '', href: '/rfqs', icon: null })).toBe(false)
  })

  it('matches exactly when matchNested is false', () => {
    const item = { label: '', href: '/dashboard', icon: null, matchNested: false }
    expect(isActive('/dashboard', item)).toBe(true)
    expect(isActive('/dashboard/detail', item)).toBe(false)
  })
})

describe('Sidebar', () => {
  it('renders one navigation landmark with its groups', () => {
    render(<Sidebar groups={GROUPS} pathname="/rfqs" />)
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument()
    expect(screen.getByText('Sourcing')).toBeInTheDocument()
  })

  it('marks the current route with aria-current', () => {
    render(<Sidebar groups={GROUPS} pathname="/rfqs/abc" />)
    expect(screen.getByRole('link', { name: /RFQs/ })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: /Quotations/ })).not.toHaveAttribute('aria-current')
  })

  it('describes a badge as work needing attention, not a bare number', () => {
    render(<Sidebar groups={GROUPS} pathname="/dashboard" />)
    expect(screen.getByRole('link', { name: /needing attention/ })).toBeInTheDocument()
  })

  it('keeps labels available to screen readers when collapsed', () => {
    render(
      <TooltipProvider>
        <Sidebar groups={GROUPS} pathname="/dashboard" collapsed />
      </TooltipProvider>,
    )
    expect(screen.getByRole('link', { name: /Quotations/ })).toBeInTheDocument()
  })

  it('toggles collapse through a labelled control', async () => {
    const onCollapsedChange = vi.fn()
    render(<Sidebar groups={GROUPS} pathname="/dashboard" onCollapsedChange={onCollapsedChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }))
    expect(onCollapsedChange).toHaveBeenCalledWith(true)
  })

  it('has no axe violations', async () => {
    const { container } = render(<Sidebar groups={GROUPS} pathname="/rfqs" />)
    await expectNoAxeViolations(container)
  })
})

describe('TopBar', () => {
  it('opens the palette from a button, not a text input', async () => {
    const onSearchClick = vi.fn()
    render(<TopBar onSearchClick={onSearchClick} searchPlaceholder="Search or jump to…" />)
    expect(screen.queryByRole('searchbox')).toBeNull()
    await userEvent.click(screen.getAllByRole('button', { name: /search/i })[0]!)
    expect(onSearchClick).toHaveBeenCalled()
  })

  it('has no axe violations', async () => {
    const { container } = render(<TopBar onSearchClick={vi.fn()} onMenuClick={vi.fn()} />)
    await expectNoAxeViolations(container)
  })
})

describe('OrganizationSwitcher', () => {
  it('renders as a static label when there is nowhere to switch to', () => {
    render(<OrganizationSwitcher current={{ id: 'o1', name: 'Triyara Exports' }} />)
    expect(screen.getByText('Triyara Exports')).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('becomes a menu only when more than one organization is supplied', () => {
    render(
      <OrganizationSwitcher
        current={{ id: 'o1', name: 'Triyara Exports' }}
        organizations={[
          { id: 'o1', name: 'Triyara Exports' },
          { id: 'o2', name: 'Triyara Foods' },
        ]}
        onSelect={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: /change organization/i })).toBeInTheDocument()
  })
})

describe('AppShell', () => {
  it('exposes a main landmark and a skip link as the first focusable element', async () => {
    render(
      <>
        <SkipToContent />
        <AppShell sidebar={<nav aria-label="Main" />} topBar={<header />}>
          <p>Body</p>
        </AppShell>
      </>,
    )
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content')
    await userEvent.tab()
    expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveFocus()
  })
})

describe('AuthLayout', () => {
  it('renders a single h1 and no application chrome', async () => {
    const { container } = render(
      <AuthLayout brand={<span>Triyara</span>} title="Sign in" description="Use your work email">
        <form aria-label="Sign in form" />
      </AuthLayout>,
    )
    expect(screen.getByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation')).toBeNull()
    await expectNoAxeViolations(container)
  })
})
