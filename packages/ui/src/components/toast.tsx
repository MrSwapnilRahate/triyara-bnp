'use client'

import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react'
import { createContext, useCallback, useContext, useMemo, useState } from 'react'

import { cn } from '../lib/cn'

export type ToastTone = 'success' | 'danger' | 'warning' | 'info'

export interface Toast {
  id: string
  tone: ToastTone
  title: string
  description?: string
  /** Support reference. Shown for failures so a user can quote it in a ticket. */
  requestId?: string
  action?: { label: string; onClick: () => void }
  /** ms. Errors default to persistent - a failure must not vanish unread. */
  duration?: number | null
}

export type ToastInput = Omit<Toast, 'id'>

interface ToastContextValue {
  toasts: Toast[]
  push: (toast: ToastInput) => string
  dismiss: (id: string) => void
  /** Convenience wrappers; `error` is persistent by default. */
  success: (title: string, description?: string) => string
  error: (title: string, options?: { description?: string; requestId?: string }) => string
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}

let counter = 0

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((t) => t.id !== id))
  }, [])

  const push = useCallback(
    (input: ToastInput) => {
      counter += 1
      const id = `toast-${counter}`
      // A failure stays until dismissed; a success does not need to be read.
      const duration =
        input.duration === undefined ? (input.tone === 'danger' ? null : 5000) : input.duration
      setToasts((current) => [...current, { ...input, id, duration }])
      if (duration !== null) {
        setTimeout(() => dismiss(id), duration)
      }
      return id
    },
    [dismiss],
  )

  const value = useMemo<ToastContextValue>(
    () => ({
      toasts,
      push,
      dismiss,
      success: (title, description) => push({ tone: 'success', title, description }),
      error: (title, options) =>
        push({
          tone: 'danger',
          title,
          description: options?.description,
          requestId: options?.requestId,
        }),
    }),
    [toasts, push, dismiss],
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastRegion toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  )
}

const ICONS = {
  success: CheckCircle2,
  danger: XCircle,
  warning: AlertTriangle,
  info: Info,
} as const

/**
 * Two live regions, not one: errors are assertive so they interrupt, everything
 * else is polite. A single region would either shout every success or bury every
 * failure.
 */
export function ToastRegion({
  toasts,
  onDismiss,
}: {
  toasts: Toast[]
  onDismiss: (id: string) => void
}) {
  const errors = toasts.filter((t) => t.tone === 'danger')
  const rest = toasts.filter((t) => t.tone !== 'danger')

  return (
    <div className="z-toast bottom-gap-lg right-gap-lg gap-gap pointer-events-none fixed flex w-full max-w-sm flex-col">
      <div role="alert" aria-live="assertive" className="gap-gap flex flex-col">
        {errors.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
        ))}
      </div>
      <div role="status" aria-live="polite" className="gap-gap flex flex-col">
        {rest.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
        ))}
      </div>
    </div>
  )
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  const Icon = ICONS[toast.tone]
  return (
    <div
      className={cn(
        'gap-gap bg-surface-overlay p-gap-lg shadow-overlay pointer-events-auto flex rounded-md border',
        'animate-slide-in-top',
        toast.tone === 'success' && 'border-success/30',
        toast.tone === 'danger' && 'border-danger/30',
        toast.tone === 'warning' && 'border-warning/30',
        toast.tone === 'info' && 'border-info/30',
      )}
    >
      <Icon
        aria-hidden="true"
        className={cn(
          'mt-0.5 size-4 shrink-0',
          toast.tone === 'success' && 'text-success',
          toast.tone === 'danger' && 'text-danger',
          toast.tone === 'warning' && 'text-warning',
          toast.tone === 'info' && 'text-info',
        )}
      />
      <div className="min-w-0 flex-1">
        <p className="text-content text-base font-medium">{toast.title}</p>
        {toast.description ? (
          <p className="text-content-muted mt-0.5 text-xs">{toast.description}</p>
        ) : null}
        {toast.requestId ? (
          <p className="mt-gap text-2xs text-content-subtle font-mono">
            Reference {toast.requestId}
          </p>
        ) : null}
        {toast.action ? (
          <button
            type="button"
            onClick={toast.action.onClick}
            className="focus-ring mt-gap text-accent rounded-xs text-xs font-medium hover:underline"
          >
            {toast.action.label}
          </button>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss notification"
        className="focus-ring text-content-subtle hover:text-content -mt-1 -mr-1 h-6 w-6 shrink-0 rounded-xs"
      >
        <X className="mx-auto size-3.5" />
      </button>
    </div>
  )
}
