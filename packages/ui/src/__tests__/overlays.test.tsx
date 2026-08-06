import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '../components/accordion'
import { Alert } from '../components/alert'
import { Breadcrumb } from '../components/breadcrumb'
import { Combobox } from '../components/combobox'
import { CommandPalette } from '../components/command-palette'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../components/dropdown-menu'
import { EmptyState } from '../components/empty-state'
import { NotificationCenter } from '../components/notification-center'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/tabs'
import { expectNoAxeViolations } from './axe'

describe('Tabs', () => {
  it('exposes tablist semantics and switches panels by keyboard', async () => {
    render(
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="lines" count={4}>
            Lines
          </TabsTrigger>
        </TabsList>
        <TabsContent value="overview">Overview panel</TabsContent>
        <TabsContent value="lines">Lines panel</TabsContent>
      </Tabs>,
    )
    expect(screen.getByRole('tablist')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: /Overview/ }))
    await userEvent.keyboard('{ArrowRight}')
    expect(await screen.findByText('Lines panel')).toBeInTheDocument()
  })

  it('has no axe violations', async () => {
    const { container } = render(
      <Tabs defaultValue="a">
        <TabsList>
          <TabsTrigger value="a">A</TabsTrigger>
        </TabsList>
        <TabsContent value="a">Panel</TabsContent>
      </Tabs>,
    )
    await expectNoAxeViolations(container)
  })
})

describe('Accordion', () => {
  it('expands and collapses a section', async () => {
    render(
      <Accordion type="single" collapsible>
        <AccordionItem value="one">
          <AccordionTrigger>Charges</AccordionTrigger>
          <AccordionContent>Freight, insurance</AccordionContent>
        </AccordionItem>
      </Accordion>,
    )
    const trigger = screen.getByRole('button', { name: 'Charges' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
  })
})

describe('DropdownMenu', () => {
  it('opens with a menu role and selects an item by keyboard', async () => {
    const onSelect = vi.fn()
    render(
      <DropdownMenu>
        <DropdownMenuTrigger>Actions</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onSelect={onSelect}>Approve</DropdownMenuItem>
          <DropdownMenuItem tone="danger">Withdraw</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Actions' }))
    expect(await screen.findByRole('menu')).toBeInTheDocument()
    await userEvent.keyboard('{ArrowDown}{Enter}')
    await waitFor(() => expect(onSelect).toHaveBeenCalled())
  })
})

describe('Combobox', () => {
  it('is a labelled combobox that reports its expanded state', async () => {
    function Harness() {
      const [value, setValue] = useState<string | null>(null)
      return (
        <>
          <span id="supplier-label">Supplier</span>
          <Combobox
            aria-labelledby="supplier-label"
            options={[
              { value: 's1', label: 'Acme Spices', hint: 'SUP-000001' },
              { value: 's2', label: 'Kerala Exports', hint: 'SUP-000002' },
            ]}
            value={value}
            onValueChange={setValue}
          />
        </>
      )
    }
    render(<Harness />)
    const trigger = screen.getByRole('combobox', { name: 'Supplier' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    await userEvent.click(await screen.findByText('Kerala Exports'))
    expect(screen.getByRole('combobox', { name: 'Supplier' })).toHaveTextContent('Kerala Exports')
  })
})

describe('CommandPalette', () => {
  it('runs the selected action and closes', async () => {
    const onSelect = vi.fn()
    const onOpenChange = vi.fn()
    render(
      <CommandPalette
        open
        onOpenChange={onOpenChange}
        query=""
        onQueryChange={vi.fn()}
        shouldFilter
        groups={[{ heading: 'Go to', items: [{ id: 'r', label: 'RFQs', onSelect }] }]}
      />,
    )
    await userEvent.click(await screen.findByText('RFQs'))
    expect(onSelect).toHaveBeenCalledOnce()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})

describe('NotificationCenter', () => {
  it('names the trigger with the unread count', () => {
    render(<NotificationCenter items={[]} unreadCount={3} />)
    expect(screen.getByRole('button', { name: 'Notifications, 3 unread' })).toBeInTheDocument()
  })

  it('marks unread items for screen readers, not only by colour', async () => {
    render(
      <NotificationCenter
        unreadCount={1}
        items={[{ id: 'n1', title: 'RFQ awaiting approval', timeAgo: '2h ago', read: false }]}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /1 unread/ }))
    expect(await screen.findByText('(unread)')).toBeInTheDocument()
  })
})

describe('Breadcrumb', () => {
  it('marks the last crumb as the current page', () => {
    render(
      <Breadcrumb
        items={[
          { label: 'RFQs', href: '/rfqs' },
          { label: 'RFQ-2026-000001', href: '/rfqs/1' },
          { label: 'Responses' },
        ]}
      />,
    )
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument()
    expect(screen.getByText('Responses')).toHaveAttribute('aria-current', 'page')
  })
})

describe('Alert and EmptyState', () => {
  it('gives a danger alert an assertive role', () => {
    render(<Alert tone="danger" title="Could not save" />)
    expect(screen.getByRole('alert')).toHaveTextContent('Could not save')
  })

  it('keeps a calmer alert out of the interrupt path', () => {
    render(<Alert tone="info" title="Terms are frozen" />)
    expect(screen.getByRole('status')).toHaveTextContent('Terms are frozen')
  })

  it('distinguishes an error empty state from an ordinary one', () => {
    const { rerender } = render(<EmptyState title="No results" variant="filtered" />)
    expect(screen.getByRole('status')).toBeInTheDocument()
    rerender(<EmptyState title="Could not load" variant="error" />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })
})
