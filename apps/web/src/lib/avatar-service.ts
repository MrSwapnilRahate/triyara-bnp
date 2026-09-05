import { createAvatarService } from '@triyara/core'
import { userRepository } from '@triyara/db'
import { createStorageFromEnv } from '@triyara/storage'

// Staff avatar wiring. Same shape as document-service: the repository and the
// storage provider are injected here so route handlers depend only on the
// service, never on Prisma or on which bucket is behind it.
export const avatarService = createAvatarService({
  users: userRepository,
  storage: createStorageFromEnv(),
})
