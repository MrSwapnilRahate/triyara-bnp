'use client'

import { Command as CommandPrimitive } from 'cmdk'
import { useEffect } from 'react'

import { cn } from '../lib/cn'
import { Dialog, DialogContent } from './dialog'
import { Spinner } from './spinner'

export interface CommandItem {
  id: string
  label: string
  /** Second line: a code, a status, a supplier name. */
  hint?: string
  icon?: React.ReactNode
  shortcut?: string
  onSelect: () => void
  /** Extra terms that should match but are not displayed. */
  keywords?: string[]
}

export interface CommandGroup {
  heading: string
  items: CommandItem[]
}

export interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  query: string
  onQueryChange: (query: string) => void
  groups: CommandGroup[]
  loading?: boolean
  placeholder?: string
  emptyMessage?: string
  /**
   * Results are fetched remotely, so local filtering is off by default -
   * filtering server results again is how a palette shows "no matches" for a
   * record the server just returned.
   */
  shouldFilter?: boolean
}

/**
 * The ⌘K surface. A NAVIGATOR, not a report: it fans out across modules and
 * takes you to a record. It also indexes static destinations and actions, which
 * is what makes it worth the keystroke - most invocations are navigation.
 */
export function CommandPalette({
  open,
  onOpenChange,
  query,
  onQueryChange,
  groups,
  loading,
  placeholder = 'Search or jump to…',
  emptyMessage = 'No results.',
  shouldFilter = false,
}: CommandPaletteProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="lg"
        hideClose
        className="top-[15%] translate-y-0 overflow-hidden p-0"
        aria-label="Command palette"
      >
        <CommandPrimitive shouldFilter={shouldFilter} loop label="Command palette">
          <div className="gap-gap border-line px-gap-lg flex items-center border-b">
            <CommandPrimitive.Input
              value={query}
              onValueChange={onQueryChange}
              placeholder={placeholder}
              className="text-md text-content placeholder:text-content-subtle h-12 w-full bg-transparent outline-none"
            />
            {loading ? <Spinner size="sm" label={null} className="text-content-subtle" /> : null}
          </div>

          <CommandPrimitive.List className="p-gap max-h-80 overflow-y-auto">
            {loading ? null : (
              <CommandPrimitive.Empty className="px-gap-lg py-section text-content-muted text-center text-base">
                {emptyMessage}
              </CommandPrimitive.Empty>
            )}

            {groups.map((group) => (
              <CommandPrimitive.Group
                key={group.heading}
                heading={group.heading}
                className={cn(
                  '[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5',
                  '[&_[cmdk-group-heading]]:text-2xs [&_[cmdk-group-heading]]:font-semibold',
                  '[&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:uppercase',
                  '[&_[cmdk-group-heading]]:text-content-subtle',
                )}
              >
                {group.items.map((item) => (
                  <CommandPrimitive.Item
                    key={item.id}
                    value={`${item.label} ${item.hint ?? ''} ${(item.keywords ?? []).join(' ')}`}
                    onSelect={() => {
                      item.onSelect()
                      onOpenChange(false)
                    }}
                    className={cn(
                      'gap-gap flex cursor-default items-center rounded-sm px-2 py-2 text-base select-none',
                      'data-[selected=true]:bg-surface-sunken',
                      '[&_svg]:text-content-subtle [&_svg]:size-4 [&_svg]:shrink-0',
                    )}
                  >
                    {item.icon}
                    <span className="min-w-0 flex-1">
                      <span className="text-content block truncate">{item.label}</span>
                      {item.hint ? (
                        <span className="text-content-subtle block truncate text-xs">
                          {item.hint}
                        </span>
                      ) : null}
                    </span>
                    {item.shortcut ? (
                      <kbd className="text-2xs text-content-subtle font-mono tracking-widest">
                        {item.shortcut}
                      </kbd>
                    ) : null}
                  </CommandPrimitive.Item>
                ))}
              </CommandPrimitive.Group>
            ))}
          </CommandPrimitive.List>
        </CommandPrimitive>
      </DialogContent>
    </Dialog>
  )
}

/** Binds ⌘K / Ctrl+K. Ignores the shortcut while typing in a field. */
export function useCommandShortcut(onOpen: () => void) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== 'k' || !(event.metaKey || event.ctrlKey)) return
      event.preventDefault()
      onOpen()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onOpen])
}
