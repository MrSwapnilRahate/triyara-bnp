import preset from '@triyara/config/tailwind'
import type { Config } from 'tailwindcss'

export default {
  presets: [preset],
  content: ['./src/**/*.{ts,tsx}'],
} satisfies Config
