'use client'

import { LogOut, Monitor, Moon, Rows3, Rows4, Sun, User } from 'lucide-react'

import { Avatar } from '../components/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../components/dropdown-menu'
import { cn } from '../lib/cn'
import type { Density, Theme } from '../tokens'

export interface UserMenuProps {
  name: string
  email: string
  /** Role names, shown so a user can see why an action is unavailable. */
  roles: string[]
  avatarUrl?: string
  theme: Theme
  onThemeChange: (theme: Theme) => void
  density: Density
  onDensityChange: (density: Density) => void
  profileHref?: string
  /** Rendered as-is so the app can use a server action for sign-out. */
  signOutSlot?: React.ReactNode
  linkComponent?: React.ElementType
}

export function UserMenu({
  name,
  email,
  roles,
  avatarUrl,
  theme,
  onThemeChange,
  density,
  onDensityChange,
  profileHref,
  signOutSlot,
  linkComponent: Link = 'a',
}: UserMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Account menu for ${name}`}
          className={cn(
            'focus-ring gap-gap flex items-center rounded-sm p-0.5',
            'duration-fast hover:bg-surface-sunken transition-colors',
          )}
        >
          <Avatar name={name} src={avatarUrl} size="sm" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-64">
        <div className="px-2 py-1.5">
          <p className="text-content truncate text-base font-medium">{name}</p>
          <p className="text-content-muted truncate text-xs">{email}</p>
          {roles.length > 0 ? (
            <p className="mt-gap text-2xs text-content-subtle tracking-wide uppercase">
              {roles.join(' · ')}
            </p>
          ) : null}
        </div>

        <DropdownMenuSeparator />

        {profileHref ? (
          <DropdownMenuItem asChild>
            <Link href={profileHref}>
              <User />
              Profile
            </Link>
          </DropdownMenuItem>
        ) : null}

        <DropdownMenuSeparator />

        <DropdownMenuLabel>Appearance</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme} onValueChange={(v) => onThemeChange(v as Theme)}>
          <DropdownMenuRadioItem value="light">
            <Sun />
            Light
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <Moon />
            Dark
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">
            <Monitor />
            System
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator />

        <DropdownMenuLabel>Density</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={density}
          onValueChange={(v) => onDensityChange(v as Density)}
        >
          <DropdownMenuRadioItem value="comfortable">
            <Rows3 />
            Comfortable
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="compact">
            <Rows4 />
            Compact
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>

        {signOutSlot ? (
          <>
            <DropdownMenuSeparator />
            <div className="p-1">{signOutSlot}</div>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Standalone sign-out row, for apps that submit a form rather than call a handler. */
export function SignOutItem({ children }: { children?: React.ReactNode }) {
  return (
    <span className="gap-gap text-danger flex items-center px-2 py-1.5 text-base [&_svg]:size-4">
      <LogOut />
      {children ?? 'Sign out'}
    </span>
  )
}
