import { createVerificationService } from '@triyara/core'
import { documentRepository, userRepository, verificationRepository } from '@triyara/db'

import { eventBus } from './event-bus'

const reviewers = {
  async findById(id: string) {
    const user = await userRepository.findById(id)
    if (!user) return null
    return { organizationId: user.organizationId, roleNames: user.roles.map((r) => r.role.name) }
  },
}

export const verificationService = createVerificationService({
  repo: verificationRepository,
  documents: documentRepository,
  reviewers,
  events: eventBus,
})
