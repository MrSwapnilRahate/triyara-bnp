/**
 * Design tokens, mirrored from tokens.css for consumption in TypeScript.
 *
 * The stylesheet is the source of truth for VALUES; this file is the source of
 * truth for the NAMES. Anything that needs a token at runtime (a chart colour, a
 * canvas render) reads the CSS variable rather than a hard-coded hex, so themes
 * stay authoritative.
 */

export const SPACE = {
  'gap-xs': 4,
  gap: 8,
  'gap-lg': 16,
  gutter: 24,
  section: 32,
  'section-lg': 48,
} as const

export const RADIUS = ['xs', 'sm', 'md', 'lg', 'xl'] as const

export const FONT_SIZE = ['2xs', 'xs', 'sm', 'base', 'md', 'lg', 'xl', '2xl', '3xl'] as const

export const SHADOW = ['xs', 'sm', 'md', 'lg', 'overlay'] as const

/** Layering contract. A component must never invent a z-index. */
export const Z_INDEX = {
  base: 0,
  raised: 10,
  sticky: 20,
  drawer: 30,
  overlay: 40,
  modal: 50,
  popover: 60,
  toast: 70,
  tooltip: 80,
  max: 90,
} as const

export const BREAKPOINT = {
  xs: 480,
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
} as const

export const DURATION = { instant: 75, fast: 150, base: 200, slow: 300 } as const

/** Semantic colour roles. Every one resolves to a CSS custom property. */
export const COLOR_ROLE = [
  'canvas',
  'surface',
  'surface-raised',
  'surface-overlay',
  'surface-sunken',
  'content',
  'content-muted',
  'content-subtle',
  'content-inverted',
  'line',
  'line-strong',
  'accent',
  'success',
  'warning',
  'danger',
  'info',
  'neutral',
] as const

export type ColorRole = (typeof COLOR_ROLE)[number]
export type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info'
export type Size = 'sm' | 'md' | 'lg'
export type Density = 'comfortable' | 'compact'
export type Theme = 'light' | 'dark' | 'system'

/** Reads a token from the live stylesheet. Returns '' during SSR. */
export function readToken(name: string): string {
  if (typeof window === 'undefined') return ''
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}
