import { createDocumentService } from '@triyara/core'
import { documentRepository } from '@triyara/db'
import { createLoggingEventBus } from '@triyara/events'
import { logger } from '@triyara/lib'
import { createStorageFromEnv } from '@triyara/storage'

export const documentService = createDocumentService({
  repo: documentRepository,
  storage: createStorageFromEnv(),
  events: createLoggingEventBus(logger),
})
