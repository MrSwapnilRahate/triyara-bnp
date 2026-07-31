// @triyara/ui - design system for the Triyara admin portal (TRY-BNP-PORTAL-01).
//
// Presentational only. Nothing here knows about the domain, the router, or the
// API: components take props and render. Business components arrive with their
// feature.
//
// Import tokens.css once at the application root; every component reads its
// colours from those custom properties, which is why no component carries a
// `dark:` variant.

export { cn } from './lib/cn'
export * from './tokens'

// ---- Primitives ----
export * from './components/accordion'
export * from './components/alert'
export * from './components/avatar'
export * from './components/badge'
export * from './components/breadcrumb'
export * from './components/button'
export * from './components/card'
export * from './components/chart'
export * from './components/checkbox'
export * from './components/combobox'
export * from './components/dialog'
export * from './components/drawer'
export * from './components/dropdown-menu'
export * from './components/empty-state'
export * from './components/input'
export * from './components/label'
export * from './components/popover'
export * from './components/progress'
export * from './components/radio'
export * from './components/select'
export * from './components/separator'
export * from './components/skeleton'
export * from './components/spinner'
export * from './components/switch'
export * from './components/tabs'
export * from './components/tooltip'

// ---- Composites ----
export * from './components/command-palette'
export * from './components/data-table'
export * from './components/notification-center'
export * from './components/page-header'
export * from './components/pagination'
export * from './components/toast'

// ---- Layout ----
export * from './layout/app-shell'
export * from './layout/auth-layout'
export * from './layout/organization-switcher'
export * from './layout/sidebar'
export * from './layout/theme'
export * from './layout/top-bar'
export * from './layout/user-menu'
