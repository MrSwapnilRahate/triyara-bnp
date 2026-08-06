'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

import type { Density, Theme } from '../tokens'

interface ThemeContextValue {
  theme: Theme
  setTheme: (theme: Theme) => void
  density: Density
  setDensity: (density: Density) => void
  /** The theme actually applied, after resolving `system`. */
  resolved: 'light' | 'dark'
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>')
  return ctx
}

const THEME_KEY = 'triyara.theme'
const DENSITY_KEY = 'triyara.density'

/**
 * Writes `data-theme` and `data-density` onto <html>; the token stylesheet does
 * the rest. Preference is persisted per browser, not per user account - it is a
 * display choice, not business data, and does not deserve a round trip.
 */
export function ThemeProvider({
  children,
  defaultTheme = 'dark',
  defaultDensity = 'comfortable',
}: {
  children: React.ReactNode
  defaultTheme?: Theme
  defaultDensity?: Density
}) {
  const [theme, setThemeState] = useState<Theme>(defaultTheme)
  const [density, setDensityState] = useState<Density>(defaultDensity)
  const [systemDark, setSystemDark] = useState(false)

  // Read persisted preference after mount: localStorage is unavailable on the
  // server, and reading it during render would desynchronise hydration.
  useEffect(() => {
    const storedTheme = localStorage.getItem(THEME_KEY) as Theme | null
    const storedDensity = localStorage.getItem(DENSITY_KEY) as Density | null
    if (storedTheme) setThemeState(storedTheme)
    if (storedDensity) setDensityState(storedDensity)
  }, [])

  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    setSystemDark(query.matches)
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  const resolved: 'light' | 'dark' = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme

  useEffect(() => {
    document.documentElement.dataset.theme = resolved
    // Tailwind's `dark:` variant is class-based; keep it in step for any
    // third-party component that relies on it.
    document.documentElement.classList.toggle('dark', resolved === 'dark')
  }, [resolved])

  useEffect(() => {
    document.documentElement.dataset.density = density
  }, [density])

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next)
    localStorage.setItem(THEME_KEY, next)
  }, [])

  const setDensity = useCallback((next: Density) => {
    setDensityState(next)
    localStorage.setItem(DENSITY_KEY, next)
  }, [])

  const value = useMemo(
    () => ({ theme, setTheme, density, setDensity, resolved }),
    [theme, setTheme, density, setDensity, resolved],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
