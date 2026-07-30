'use client'

import { QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider, ToastProvider, TooltipProvider } from '@triyara/ui'
import { SessionProvider } from 'next-auth/react'
import { type ReactNode, useState } from 'react'

import { createQueryClient } from '@/lib/query-client'

/**
 * Provider stack, outermost first:
 *
 *   SessionProvider   identity
 *   QueryClientProvider  server state
 *   ThemeProvider     writes data-theme / data-density onto <html>
 *   TooltipProvider   one shared hover delay
 *   ToastProvider     owns the live regions
 *
 * The QueryClient is created in state rather than at module scope: a module-level
 * client is shared across requests on the server, which would leak one user's
 * cached data into another's response.
 */
export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient)

  return (
    <SessionProvider>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider defaultTheme="dark">
          <TooltipProvider delayDuration={300} skipDelayDuration={150}>
            <ToastProvider>{children}</ToastProvider>
          </TooltipProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </SessionProvider>
  )
}
