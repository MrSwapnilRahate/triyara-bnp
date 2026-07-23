import { prisma } from '../client'

export interface ReviewerOption {
  id: string
  name: string
  roleNames: string[]
}

// Lists users eligible to review verifications (Verifier or Admin) in an org.
export const reviewerRepository = {
  async listReviewers(orgId: string): Promise<ReviewerOption[]> {
    const users = await prisma.user.findMany({
      where: {
        organizationId: orgId,
        status: 'ACTIVE',
        roles: { some: { role: { name: { in: ['VERIFIER', 'ADMIN'] } } } },
      },
      select: { id: true, name: true, roles: { select: { role: { select: { name: true } } } } },
      orderBy: { name: 'asc' },
    })
    return users.map((u) => ({
      id: u.id,
      name: u.name,
      roleNames: u.roles.map((r) => r.role.name),
    }))
  },
}
