import { prisma } from '../client'

// Read-only lookup used by the notification subscriber to resolve recipients.
export const orgUserRepository = {
  async listActiveUserIds(orgId: string): Promise<string[]> {
    const users = await prisma.user.findMany({
      where: { organizationId: orgId, status: 'ACTIVE' },
      select: { id: true },
    })
    return users.map((u) => u.id)
  },
}
