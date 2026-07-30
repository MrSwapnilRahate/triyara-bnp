import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import {
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../components/dialog'
import { expectNoAxeViolations } from './axe'

describe('Dialog', () => {
  it('opens from its trigger and is named for assistive technology', async () => {
    render(
      <Dialog>
        <DialogTrigger>Open</DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revise lines</DialogTitle>
          </DialogHeader>
        </DialogContent>
      </Dialog>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Open' }))
    expect(await screen.findByRole('dialog', { name: 'Revise lines' })).toBeInTheDocument()
  })

  it('closes on Escape', async () => {
    render(
      <Dialog defaultOpen>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm</DialogTitle>
          </DialogHeader>
        </DialogContent>
      </Dialog>,
    )
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('traps focus inside the dialog', async () => {
    render(
      <Dialog defaultOpen>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Focus</DialogTitle>
          </DialogHeader>
          <button type="button">Inside</button>
        </DialogContent>
      </Dialog>,
    )
    const dialog = screen.getByRole('dialog')
    await waitFor(() => expect(dialog).toContainElement(document.activeElement as HTMLElement))
  })

  it('has no axe violations while open', async () => {
    const { baseElement } = render(
      <Dialog defaultOpen>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Accessible dialog</DialogTitle>
          </DialogHeader>
        </DialogContent>
      </Dialog>,
    )
    await expectNoAxeViolations(baseElement as HTMLElement)
  })
})

describe('ConfirmDialog', () => {
  function Harness({ onConfirm }: { onConfirm: () => void | Promise<void> }) {
    const [open, setOpen] = useState(true)
    return (
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Withdraw quotation?"
        description="This cannot be undone."
        confirmLabel="Withdraw"
        tone="danger"
        onConfirm={onConfirm}
      />
    )
  }

  it('runs the action and closes on confirm', async () => {
    const onConfirm = vi.fn()
    render(<Harness onConfirm={onConfirm} />)
    await userEvent.click(screen.getByRole('button', { name: 'Withdraw' }))
    expect(onConfirm).toHaveBeenCalledOnce()
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
  })

  it('closes without running the action on cancel', async () => {
    const onConfirm = vi.fn()
    render(<Harness onConfirm={onConfirm} />)
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('stays open and shows the reason when the action fails', async () => {
    const onConfirm = vi.fn().mockRejectedValue(new Error('A SENT quotation cannot be edited.'))
    render(<Harness onConfirm={onConfirm} />)
    await userEvent.click(screen.getByRole('button', { name: 'Withdraw' }))

    // The dialog must stay open AND say why - a dialog that silently did
    // nothing is indistinguishable from a broken button.
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('A SENT quotation cannot be edited.')
  })

  it('does not leak an unhandled rejection when the action fails', async () => {
    const onError = vi.fn()
    const onConfirm = vi.fn().mockRejectedValue(new Error('boom'))
    render(
      <ConfirmDialog
        open
        onOpenChange={vi.fn()}
        title="Withdraw?"
        onConfirm={onConfirm}
        onError={onError}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(onError).toHaveBeenCalledOnce())
  })

  it('is an alertdialog, not a plain dialog', () => {
    render(<Harness onConfirm={vi.fn()} />)
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
  })
})
