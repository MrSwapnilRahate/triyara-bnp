'use client'

import { Bell, CheckCheck } from 'lucide-react'

import { cn } from '../lib/cn'
import { Button, IconButton } from './button'
import { EmptyState } from './empty-state'
import { Popover, PopoverContent, PopoverTrigger } from './popover'
import { Separator } from './separator'
import { Skeleton } from './skeleton'

export interface NotificationItem {
  id: string
  title: string
  body?: string
  /** Pre-formatted relative time; formatting is the caller's concern. */
  timeAgo: string
  read: boolean
  href?: string
}

export interface NotificationCenterProps {
  items: NotificationItem[]
  unreadCount: number
  loading?: boolean
  onMarkRead?: (id: string) => void
  onMarkAllRead?: () => void
  onOpenChange?: (open: boolean) => void
  /** Link to the full page. */
  viewAllHref?: string
  linkComponent?: React.ElementType
}

/**
 * Persistent, system-originated messages - distinct from a Toast, which reports
 * the outcome of the user's own action and may disappear. A workflow event
 * ("awaiting your approval") must survive a navigation, so it belongs here.
 */
export function NotificationCenter({
  items,
  unreadCount,
  loading,
  onMarkRead,
  onMarkAllRead,
  onOpenChange,
  viewAllHref,
  linkComponent: Link = 'a',
}: NotificationCenterProps) {
  return (
    <Popover onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <IconButton
          label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
          className="relative"
        >
          <Bell />
          {unreadCount > 0 ? (
            <span
              aria-hidden="true"
              className="bg-danger text-2xs absolute -top-0.5 -right-0.5 flex min-w-4 items-center justify-center rounded-full px-1 leading-4 font-semibold text-white"
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          ) : null}
        </IconButton>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="px-gap-lg py-gap flex items-center justify-between">
          <p className="text-content text-base font-semibold">Notifications</p>
          {onMarkAllRead && unreadCount > 0 ? (
            <Button size="sm" variant="ghost" leadingIcon={<CheckCheck />} onClick={onMarkAllRead}>
              Mark all read
            </Button>
          ) : null}
        </div>
        <Separator />

        <div className="max-h-96 overflow-y-auto">
          {loading ? (
            <div className="space-y-gap-lg p-gap-lg">
              {[0, 1, 2].map((i) => (
                <div key={i} className="space-y-gap">
                  <Skeleton variant="text" className="w-3/4" />
                  <Skeleton variant="text" className="w-1/2" />
                </div>
              ))}
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              size="sm"
              icon={<Bell />}
              title="Nothing new"
              description="Workflow events and assignments will appear here."
            />
          ) : (
            <ul>
              {items.map((item) => {
                const Wrapper = item.href ? Link : 'div'
                return (
                  <li key={item.id} className="border-line border-b last:border-b-0">
                    <Wrapper
                      {...(item.href ? { href: item.href } : {})}
                      onClick={() => !item.read && onMarkRead?.(item.id)}
                      className={cn(
                        'gap-gap px-gap-lg py-gap duration-instant flex w-full text-left transition-colors',
                        item.href && 'focus-ring hover:bg-surface-sunken',
                        !item.read && 'bg-accent-subtle/40',
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          'mt-1.5 size-1.5 shrink-0 rounded-full',
                          item.read ? 'bg-transparent' : 'bg-accent',
                        )}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="text-content block text-base">
                          {item.title}
                          {item.read ? null : <span className="sr-only"> (unread)</span>}
                        </span>
                        {item.body ? (
                          <span className="text-content-muted mt-0.5 block truncate text-xs">
                            {item.body}
                          </span>
                        ) : null}
                        <span className="text-2xs text-content-subtle mt-0.5 block">
                          {item.timeAgo}
                        </span>
                      </span>
                    </Wrapper>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {viewAllHref ? (
          <>
            <Separator />
            <div className="p-gap">
              <Button asChild variant="ghost" fullWidth size="sm">
                <Link href={viewAllHref}>View all notifications</Link>
              </Button>
            </div>
          </>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}
