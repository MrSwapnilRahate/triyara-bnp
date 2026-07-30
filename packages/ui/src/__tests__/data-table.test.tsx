import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import {
  DataTable,
  DataTableCell,
  DataTableHead,
  DataTableHeaderCell,
  DataTableLayout,
  DataTableRow,
} from '../components/data-table'
import { EmptyState } from '../components/empty-state'
import { PaginationControls } from '../components/pagination'
import { expectNoAxeViolations } from './axe'

function ExampleTable() {
  return (
    <DataTable caption="Suppliers">
      <DataTableHead>
        <tr>
          <DataTableHeaderCell sortable sortDirection="asc">
            Code
          </DataTableHeaderCell>
          <DataTableHeaderCell sortable sortDirection={null}>
            Name
          </DataTableHeaderCell>
          <DataTableHeaderCell>Country</DataTableHeaderCell>
        </tr>
      </DataTableHead>
      <tbody>
        <DataTableRow>
          <DataTableCell>SUP-000001</DataTableCell>
          <DataTableCell>Acme Spices</DataTableCell>
          <DataTableCell>IN</DataTableCell>
        </DataTableRow>
      </tbody>
    </DataTable>
  )
}

describe('DataTable', () => {
  it('uses real table semantics with a caption', () => {
    render(<ExampleTable />)
    expect(screen.getByRole('table', { name: 'Suppliers' })).toBeInTheDocument()
    expect(screen.getAllByRole('columnheader')).toHaveLength(3)
  })

  it('exposes sort direction through aria-sort', () => {
    render(<ExampleTable />)
    expect(screen.getByRole('columnheader', { name: 'Code' })).toHaveAttribute(
      'aria-sort',
      'ascending',
    )
    expect(screen.getByRole('columnheader', { name: 'Name' })).toHaveAttribute('aria-sort', 'none')
    // An unsortable column must not claim a sort state at all.
    expect(screen.getByRole('columnheader', { name: 'Country' })).not.toHaveAttribute('aria-sort')
  })

  it('renders a state instead of rows when one is supplied', () => {
    render(
      <DataTableLayout state={<EmptyState title="No suppliers yet" />}>
        <ExampleTable />
      </DataTableLayout>,
    )
    expect(screen.getByText('No suppliers yet')).toBeInTheDocument()
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('has no axe violations', async () => {
    const { container } = render(
      <DataTableLayout toolbar={<span>Toolbar</span>}>
        <ExampleTable />
      </DataTableLayout>,
    )
    await expectNoAxeViolations(container)
  })
})

describe('PaginationControls', () => {
  it('disables Next when there is no cursor - keyset paging has no page count', () => {
    render(
      <PaginationControls
        count={3}
        limit={25}
        nextCursor={null}
        onNext={vi.fn()}
        onPrevious={vi.fn()}
        hasPrevious={false}
      />,
    )
    expect(screen.getByRole('button', { name: /next/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /previous/i })).toBeDisabled()
  })

  it('never renders a page number', () => {
    render(
      <PaginationControls
        count={25}
        limit={25}
        nextCursor="cursor-1"
        onNext={vi.fn()}
        onPrevious={vi.fn()}
        hasPrevious
      />,
    )
    expect(screen.queryByText(/page \d+ of/i)).toBeNull()
    expect(screen.getByText('25 rows on this page')).toBeInTheDocument()
  })

  it('advances when Next is pressed', async () => {
    const onNext = vi.fn()
    render(
      <PaginationControls
        count={25}
        limit={25}
        nextCursor="cursor-1"
        onNext={onNext}
        onPrevious={vi.fn()}
        hasPrevious={false}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /next/i }))
    expect(onNext).toHaveBeenCalledOnce()
  })

  it('has no axe violations', async () => {
    const { container } = render(
      <PaginationControls
        count={25}
        limit={25}
        onLimitChange={vi.fn()}
        nextCursor="cursor-1"
        onNext={vi.fn()}
        onPrevious={vi.fn()}
        hasPrevious
      />,
    )
    await expectNoAxeViolations(container)
  })
})
