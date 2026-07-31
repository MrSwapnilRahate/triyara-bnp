import { createInMemoryRateLimiter, isRole, verifyPassword } from '@triyara/auth'
import { userRepository } from '@triyara/db'
import { logger } from '@triyara/lib'
import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { z } from 'zod'

import { authConfig } from './config'

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

// Brute-force protection per email (single-instance; swap for Redis in production).
const loginLimiter = createInMemoryRateLimiter(5, 15 * 60 * 1000)

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw)
        if (!parsed.success) return null
        const { email, password } = parsed.data

        if (!loginLimiter.check(email.toLowerCase()).allowed) {
          logger.warn({ email }, 'Login rate limit exceeded')
          return null
        }

        const user = await userRepository.findByEmail(email)
        if (!user || user.status !== 'ACTIVE') return null

        const valid = await verifyPassword(password, user.passwordHash)
        if (!valid) return null

        await userRepository.markLogin(user.id)
        const roles = user.roles.map((r) => r.role.name).filter(isRole)

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          organizationId: user.organizationId,
          roles,
        }
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    jwt({ token, user }) {
      if (user) {
        token.organizationId = user.organizationId
        token.roles = user.roles
      }
      return token
    },
  },
})
