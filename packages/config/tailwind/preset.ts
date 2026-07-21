import type { Config } from 'tailwindcss'

// Shared Tailwind preset. Brand tokens live here so every app renders one system.
const preset = {
  content: [],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: '#142233', deep: '#0b1420', elevated: '#1b2a3d' },
        gold: { DEFAULT: '#c9a227', light: '#e0c05a' },
      },
    },
  },
  plugins: [],
} satisfies Config

export default preset
