'use server'

import { createHash, randomBytes } from 'node:crypto'

import { hashPassword } from '@triyara/auth'
import { passwordResetRepository, userRepository } from '@triyara/db'
import { logger } from '@triyara/lib'
import { redirect } from 'next/navigation'
import { AuthError } from 'next-auth'

import { emailService } from '@/lib/email'

import { signIn, signOut } from './index'
import { safeCallbackPath } from './safe-callback'

/** Reset links are short-lived; the email states this figure to the user. */
const RESET_TTL_MS = 60 * 60 * 1000

export async function loginAction(
  _prev: string | null,
  formData: FormData,
): Promise<string | null> {
  try {
    // Where they were going before they were asked to sign in, if it is a path
    // on this site. `safeCallbackPath` is the authority - the field it reads is
    // caller-controlled, so anything carrying its own origin is discarded and
    // the usual destination is used instead.
    //
    // This does not decide what anyone may reach. `authorized()` still routes a
    // buyer to /portal and staff to /dashboard, so a callback naming a page the
    // signed-in role cannot use is redirected exactly as a direct visit would
    // have been.
    const callback = safeCallbackPath(formData.get('callbackUrl'))

    await signIn('credentials', {
      email: formData.get('email'),
      password: formData.get('password'),
      redirectTo: callback ?? '/dashboard',
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
    const expiresAt = new Date(Date.now() + RESET_TTL_MS)
    await passwordResetRepository.create(user.id, tokenHash, expiresAt)

    // Never allowed to change the response. A delivery failure that surfaced
    // here would tell an attacker which addresses are registered, which is the
    // one thing this uniform reply exists to hide.
    try {
      await emailService.passwordReset({
        email: user.email,
        token,
        expiresInMinutes: RESET_TTL_MS / 60_000,
      })
    } catch (err) {
      logger.error({ err: String(err), userId: user.id }, 'password_reset.email_failed')
    }
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
