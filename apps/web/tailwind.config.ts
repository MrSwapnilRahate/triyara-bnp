import preset from '@triyara/config/tailwind'
import type { Config } from 'tailwindcss'

export default {
  presets: [preset],
  content: [
    './src/**/*.{ts,tsx}',
    // The design system lives in a workspace package. Tailwind generates CSS by
    // scanning source text, so a class used only inside @triyara/ui produces no
    // rule unless that source is scanned here too.
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
} satisfies Config
