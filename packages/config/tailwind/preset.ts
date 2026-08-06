import type { Config } from 'tailwindcss'

// Shared Tailwind preset. Brand tokens live here so every app renders one system.
//
// Colours are declared as CSS custom properties (see @triyara/ui/tokens.css)
// rather than hex literals, so a single stylesheet re-themes every component and
// light/dark needs no `dark:` variant on any component. Tailwind consumes the
// variables through the `<alpha-value>` form so opacity utilities still work.
//
// The legacy `navy`/`gold` scale is retained: the pre-portal pages still use it,
// and removing it would break them without improving anything. It is NOT part of
// the design system - nothing new should reference it.

const preset = {
  content: [],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // ---- Legacy marketing palette (pre-portal pages only) ----
        navy: { DEFAULT: '#142233', deep: '#0b1420', elevated: '#1b2a3d' },
        gold: { DEFAULT: '#c9a227', light: '#e0c05a' },

        // ---- Surfaces, by elevation ----
        canvas: 'hsl(var(--canvas) / <alpha-value>)',
        surface: {
          DEFAULT: 'hsl(var(--surface) / <alpha-value>)',
          raised: 'hsl(var(--surface-raised) / <alpha-value>)',
          overlay: 'hsl(var(--surface-overlay) / <alpha-value>)',
          sunken: 'hsl(var(--surface-sunken) / <alpha-value>)',
        },

        // ---- Content ----
        content: {
          DEFAULT: 'hsl(var(--content) / <alpha-value>)',
          muted: 'hsl(var(--content-muted) / <alpha-value>)',
          subtle: 'hsl(var(--content-subtle) / <alpha-value>)',
          inverted: 'hsl(var(--content-inverted) / <alpha-value>)',
        },

        // ---- Lines ----
        line: {
          DEFAULT: 'hsl(var(--line) / <alpha-value>)',
          strong: 'hsl(var(--line-strong) / <alpha-value>)',
        },

        // ---- Brand accent (blue) ----
        accent: {
          DEFAULT: 'hsl(var(--accent) / <alpha-value>)',
          hover: 'hsl(var(--accent-hover) / <alpha-value>)',
          active: 'hsl(var(--accent-active) / <alpha-value>)',
          subtle: 'hsl(var(--accent-subtle) / <alpha-value>)',
          fg: 'hsl(var(--accent-fg) / <alpha-value>)',
        },

        // ---- Status. One ramp, used by every StatusBadge in every module. ----
        success: {
          DEFAULT: 'hsl(var(--success) / <alpha-value>)',
          subtle: 'hsl(var(--success-subtle) / <alpha-value>)',
          fg: 'hsl(var(--success-fg) / <alpha-value>)',
        },
        warning: {
          DEFAULT: 'hsl(var(--warning) / <alpha-value>)',
          subtle: 'hsl(var(--warning-subtle) / <alpha-value>)',
          fg: 'hsl(var(--warning-fg) / <alpha-value>)',
        },
        danger: {
          DEFAULT: 'hsl(var(--danger) / <alpha-value>)',
          subtle: 'hsl(var(--danger-subtle) / <alpha-value>)',
          fg: 'hsl(var(--danger-fg) / <alpha-value>)',
        },
        info: {
          DEFAULT: 'hsl(var(--info) / <alpha-value>)',
          subtle: 'hsl(var(--info-subtle) / <alpha-value>)',
          fg: 'hsl(var(--info-fg) / <alpha-value>)',
        },
        neutral: {
          DEFAULT: 'hsl(var(--neutral) / <alpha-value>)',
          subtle: 'hsl(var(--neutral-subtle) / <alpha-value>)',
          fg: 'hsl(var(--neutral-fg) / <alpha-value>)',
        },
      },

      // 8px grid. Tailwind's default scale is already 4px-based; these named
      // steps are what the design system uses, so spacing intent stays legible.
      spacing: {
        'gap-xs': '0.25rem', // 4  - half-step, icon gaps only
        gap: '0.5rem', // 8
        'gap-lg': '1rem', // 16
        gutter: '1.5rem', // 24
        section: '2rem', // 32
        'section-lg': '3rem', // 48
      },

      borderRadius: {
        xs: 'var(--radius-xs)',
        sm: 'var(--radius-sm)',
        DEFAULT: 'var(--radius-md)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
      },

      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },

      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }], // 11 - table meta
        xs: ['0.75rem', { lineHeight: '1.125rem' }], // 12 - labels
        sm: ['0.8125rem', { lineHeight: '1.25rem' }], // 13 - dense table body
        base: ['0.875rem', { lineHeight: '1.375rem' }], // 14 - app default
        md: ['1rem', { lineHeight: '1.5rem' }], // 16 - prose
        lg: ['1.125rem', { lineHeight: '1.75rem' }], // 18
        xl: ['1.375rem', { lineHeight: '1.875rem' }], // 22 - page title
        '2xl': ['1.75rem', { lineHeight: '2.25rem' }], // 28
        '3xl': ['2.25rem', { lineHeight: '2.75rem' }], // 36
      },

      boxShadow: {
        xs: 'var(--shadow-xs)',
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
        overlay: 'var(--shadow-overlay)',
      },

      zIndex: {
        base: '0',
        raised: '10',
        sticky: '20',
        drawer: '30',
        overlay: '40',
        modal: '50',
        popover: '60',
        toast: '70',
        tooltip: '80',
        max: '90',
      },

      screens: {
        xs: '480px',
        sm: '640px',
        md: '768px',
        lg: '1024px',
        xl: '1280px',
        '2xl': '1536px',
      },

      transitionDuration: {
        instant: '75ms',
        fast: '150ms',
        base: '200ms',
        slow: '300ms',
      },

      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'fade-out': { from: { opacity: '1' }, to: { opacity: '0' } },
        'zoom-in': {
          from: { opacity: '0', transform: 'scale(0.96)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        'zoom-out': {
          from: { opacity: '1', transform: 'scale(1)' },
          to: { opacity: '0', transform: 'scale(0.96)' },
        },
        'slide-in-right': {
          from: { transform: 'translateX(100%)' },
          to: { transform: 'translateX(0)' },
        },
        'slide-out-right': {
          from: { transform: 'translateX(0)' },
          to: { transform: 'translateX(100%)' },
        },
        'slide-in-top': {
          from: { transform: 'translateY(-8px)', opacity: '0' },
          to: { transform: 'translateY(0)', opacity: '1' },
        },
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
      },

      animation: {
        'fade-in': 'fade-in 150ms ease-out',
        'fade-out': 'fade-out 150ms ease-in',
        'zoom-in': 'zoom-in 150ms ease-out',
        'zoom-out': 'zoom-out 150ms ease-in',
        'slide-in-right': 'slide-in-right 200ms ease-out',
        'slide-out-right': 'slide-out-right 200ms ease-in',
        'slide-in-top': 'slide-in-top 150ms ease-out',
        'accordion-down': 'accordion-down 200ms ease-out',
        'accordion-up': 'accordion-up 200ms ease-out',
        shimmer: 'shimmer 1.6s infinite',
      },
    },
  },
  plugins: [],
} satisfies Config

export default preset
