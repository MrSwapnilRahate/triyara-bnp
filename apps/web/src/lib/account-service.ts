import { createAccountService } from '@triyara/core'
import { accountRepository } from '@triyara/db'
import { createLoggingEventBus } from '@triyara/events'
import { logger } from '@triyara/lib'

export const accountService = createAccountService({
  repo: accountRepository,
  events: createLoggingEventBus(logger),
})
