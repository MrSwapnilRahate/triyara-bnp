import { prisma } from '../client'

export const passwordResetRepository = {
  async create(userId: string, tokenHash: string, expiresAt: Date): Promise<void> {
    await prisma.passwordResetToken.create({ data: { userId, tokenHash, expiresAt } })
  },

  findValidByHash(tokenHash: string) {
    return prisma.passwordResetToken.findFirst({
      where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
    })
  },

  async consume(id: string): Promise<void> {
    await prisma.passwordResetToken.update({ where: { id }, data: { usedAt: new Date() } })
  },
}
