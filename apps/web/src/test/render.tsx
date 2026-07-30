import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render as rtlRender, type RenderOptions } from '@testing-library/react'
import { buildAbilityFor, type Role } from '@triyara/auth'
import { ToastProvider, TooltipProvider } from '@triyara/ui'
import type { ReactElement, ReactNode } from 'react'

import { AbilityProvider } from '@/lib/ability-context'

/**
 * Renders a screen inside the real provider stack, with a per-test QueryClient.
 *
 * Retries are off: a test asserting an error path should not wait for two
 * silent retries first, and a shared client would leak cache between tests.
 */
export interface RenderWithProvidersOptions extends Omit<RenderOptions, 'wrapper'> {
  roles?: Role[]
  queryClient?: QueryClient
}

export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  })
}

export function renderWithProviders(
  ui: ReactElement,
  {
    roles = ['ADMIN'],
    queryClient = createTestQueryClient(),
    ...options
  }: RenderWithProvidersOptions = {},
) {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <AbilityProvider roles={roles}>
          <TooltipProvider>
            <ToastProvider>{children}</ToastProvider>
          </TooltipProvider>
        </AbilityProvider>
      </QueryClientProvider>
    )
  }

  return { queryClient, ...rtlRender(ui, { wrapper: Wrapper, ...options }) }
}

export { buildAbilityFor }
