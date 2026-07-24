import { createDocumentService } from '@triyara/core'
import { documentRepository } from '@triyara/db'
import { createStorageFromEnv } from '@triyara/storage'

import { eventBus } from './event-bus'

export const documentService = createDocumentService({
  repo: documentRepository,
  storage: createStorageFromEnv(),
  events: eventBus,
})
