'use client'

import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { forwardRef, useState } from 'react'

import { cn } from '../lib/cn'
import { Alert } from './alert'
import { Button, IconButton } from './button'

export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogClose = DialogPrimitive.Close

const SIZES = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }

export const DialogContent = forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    size?: keyof typeof SIZES
    /** Hide the default close button when the dialog must be resolved by a choice. */
    hideClose?: boolean
  }
>(function DialogContent({ className, size = 'md', hideClose, children, ...props }, ref) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        className={cn(
          'z-overlay bg-content/40 fixed inset-0 backdrop-blur-[2px]',
          'data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out',
        )}
      />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          'z-modal fixed top-1/2 left-1/2 w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2',
          'border-line bg-surface-overlay shadow-overlay rounded-lg border',
          'max-h-[calc(100vh-4rem)] overflow-y-auto',
          'data-[state=open]:animate-zoom-in data-[state=closed]:animate-zoom-out',
          SIZES[size],
          className,
        )}
        {...props}
      >
        {children}
        {hideClose ? null : (
          <DialogPrimitive.Close asChild>
            <IconButton label="Close" className="absolute top-3 right-3" size="sm">
              <X />
            </IconButton>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
})

export function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-gutter pb-gap-lg pr-section pt-gutter', className)} {...props} />
}

export const DialogTitle = forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(function DialogTitle({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Title
      ref={ref}
      className={cn('text-content text-lg font-semibold', className)}
      {...props}
    />
  )
})

export const DialogDescription = forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(function DialogDescription({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Description
      ref={ref}
      className={cn('mt-gap-xs text-content-muted text-base', className)}
      {...props}
    />
  )
})

export function DialogBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-gutter pb-gap-lg', className)} {...props} />
}

export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'gap-gap border-line px-gutter py-gap-lg flex flex-col-reverse border-t sm:flex-row sm:justify-end',
        className,
      )}
      {...props}
    />
  )
}

export interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  /** `danger` for anything irreversible. */
  tone?: 'default' | 'danger'
  /** May be async; the dialog shows a pending state and closes on resolve. */
  onConfirm: () => void | Promise<void>
  /** Called when onConfirm rejects, in addition to the in-dialog message. */
  onError?: (error: unknown) => void
  children?: React.ReactNode
}

/** Best-effort message from an unknown rejection. */
function messageFrom(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string' && error) return error
  return 'The action could not be completed.'
}

/**
 * The one confirmation surface. A destructive action never uses window.confirm
 * (unstyleable, unlabelable) and never confirms inline in a menu (too easy to
 * mis-click).
 *
 * A rejection from onConfirm keeps the dialog OPEN and renders the message
 * inside it. The rejection is caught rather than allowed to propagate: an
 * unhandled promise rejection out of a click handler is an uncaught error in the
 * browser, and it would leave the user looking at a dialog that silently did
 * nothing.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'default',
  onConfirm,
  onError,
  children,
}: ConfirmDialogProps) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleConfirm() {
    setPending(true)
    setError(null)
    try {
      await onConfirm()
      onOpenChange(false)
    } catch (caught) {
      setError(messageFrom(caught))
      onError?.(caught)
    } finally {
      setPending(false)
    }
  }

  function handleOpenChange(next: boolean) {
    if (pending) return
    if (!next) setError(null)
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent size="sm" hideClose role="alertdialog">
        <DialogHeader className="pr-gutter">
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        {children || error ? (
          <DialogBody>
            {children}
            {error ? (
              <Alert tone="danger" className={cn(children && 'mt-gap-lg')}>
                {error}
              </Alert>
            ) : null}
          </DialogBody>
        ) : null}
        <DialogFooter>
          <Button variant="secondary" onClick={() => handleOpenChange(false)} disabled={pending}>
            {cancelLabel}
          </Button>
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            loading={pending}
            onClick={handleConfirm}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
