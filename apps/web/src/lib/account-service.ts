import { createAccountService } from '@triyara/core'
import { accountRepository } from '@triyara/db'

import { eventBus } from './event-bus'

export const accountService = createAccountService({ repo: accountRepository, events: eventBus })
