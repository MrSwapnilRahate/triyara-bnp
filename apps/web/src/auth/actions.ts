'use server'

import { createHash, randomBytes } from 'node:crypto'

import { hashPassword } from '@triyara/auth'
import { passwordResetRepository, userRepository } from '@triyara/db'
import { logger } from '@triyara/lib'
import { redirect } from 'next/navigation'
import { AuthError } from 'next-auth'

import { signIn, signOut } from './index'

export async function loginAction(
  _prev: string | null,
  formData: FormData,
): Promise<string | null> {
  try {
    await signIn('credentials', {
      email: formData.get('email'),
      password: formData.get('password'),
      redirectTo: '/dashboard',
    })
    return null
  } catch (error) {
    if (error instanceof AuthError) return 'Invalid email or password.'
    throw error // re-throw NEXT_REDIRECT and others
  }
}

export async function logoutAction(): Promise<void> {
  await signOut({ redirectTo: '/login' })
}

export async function forgotPasswordAction(
  _prev: string | null,
  formData: FormData,
): Promise<string> {
  const email = String(formData.get('email') ?? '')
  const user = await userRepository.findByEmail(email)

  // Uniform response - never reveal whether the email exists.
  if (user) {
    const token = randomBytes(32).toString('hex')
    const tokenHash = createHash('sha256').update(token).digest('hex')
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000)
    await passwordResetRepository.create(user.id, tokenHash, expiresAt)
    // Email delivery (Resend) arrives in a later phase; log the link for now.
    logger.info(
      { userId: user.id, resetPath: `/reset-password?token=${token}` },
      'Password reset requested',
    )
  }
  return 'If that email is registered, a reset link has been sent.'
}

export async function resetPasswordAction(
  _prev: string | null,
  formData: FormData,
): Promise<string> {
  const token = String(formData.get('token') ?? '')
  const password = String(formData.get('password') ?? '')
  if (password.length < 8) return 'Password must be at least 8 characters.'

  const tokenHash = createHash('sha256').update(token).digest('hex')
  const record = await passwordResetRepository.findValidByHash(tokenHash)
  if (!record) return 'This reset link is invalid or has expired.'

  await userRepository.updatePassword(record.userId, await hashPassword(password))
  await passwordResetRepository.consume(record.id)
  redirect('/login')
}
