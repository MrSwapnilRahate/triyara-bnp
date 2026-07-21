'use server'

import type { AccountServiceCtx } from '@triyara/core'
import {
  assignOwnerSchema,
  bulkAccountSchema,
  changeStatusSchema,
  createAccountSchema,
  updateAccountSchema,
} from '@triyara/validation'
import { revalidatePath } from 'next/cache'
import { ZodError } from 'zod'

import { requireAuth } from '@/auth/context'
import { accountService } from '@/lib/account-service'

export interface ActionState {
  ok?: boolean
  error?: string
}

function toMessage(error: unknown): string {
  if (error instanceof ZodError) return error.issues[0]?.message ?? 'Invalid input'
  if (error instanceof Error) return error.message
  return 'Something went wrong'
}

function str(fd: FormData, key: string): string | undefined {
  const v = fd.get(key)
  const s = typeof v === 'string' ? v.trim() : ''
  return s === '' ? undefined : s
}

async function ctx(): Promise<AccountServiceCtx> {
  const auth = await requireAuth()
  return { ...auth, requestId: crypto.randomUUID() }
}

export async function createAccountAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const dto = createAccountSchema.parse({
      legalName: str(fd, 'legalName'),
      displayName: str(fd, 'displayName'),
      country: str(fd, 'country'),
      source: str(fd, 'source'),
      relationshipStatus: str(fd, 'relationshipStatus'),
    })
    await accountService.create(await ctx(), dto)
    revalidatePath('/accounts')
    return { ok: true }
  } catch (error) {
    return { error: toMessage(error) }
  }
}

export async function updateAccountAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const id = String(fd.get('id'))
    const version = Number(fd.get('version'))
    const dto = updateAccountSchema.parse({
      legalName: str(fd, 'legalName'),
      displayName: str(fd, 'displayName') ?? null,
      country: str(fd, 'country') ?? null,
      source: str(fd, 'source') ?? null,
    })
    await accountService.update(await ctx(), id, dto, version)
    revalidatePath('/accounts')
    return { ok: true }
  } catch (error) {
    return { error: toMessage(error) }
  }
}

export async function changeStatusAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const id = String(fd.get('id'))
    const version = Number(fd.get('version'))
    const dto = changeStatusSchema.parse({ relationshipStatus: str(fd, 'relationshipStatus') })
    await accountService.changeStatus(await ctx(), id, dto, version)
    revalidatePath('/accounts')
    return { ok: true }
  } catch (error) {
    return { error: toMessage(error) }
  }
}

export async function assignAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const id = String(fd.get('id'))
    const version = Number(fd.get('version'))
    const dto = assignOwnerSchema.parse({ ownerId: str(fd, 'ownerId') ?? null })
    await accountService.assign(await ctx(), id, dto, version)
    revalidatePath('/accounts')
    return { ok: true }
  } catch (error) {
    return { error: toMessage(error) }
  }
}

export async function deleteAccountAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await accountService.remove(await ctx(), String(fd.get('id')), Number(fd.get('version')))
    revalidatePath('/accounts')
    return { ok: true }
  } catch (error) {
    return { error: toMessage(error) }
  }
}

export async function restoreAccountAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await accountService.restore(await ctx(), String(fd.get('id')), Number(fd.get('version')))
    revalidatePath('/accounts')
    return { ok: true }
  } catch (error) {
    return { error: toMessage(error) }
  }
}

export async function bulkStatusAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ids = String(fd.get('ids') ?? '')
      .split(',')
      .filter(Boolean)
    const dto = bulkAccountSchema.parse({
      action: 'set_status',
      ids,
      payload: { relationshipStatus: str(fd, 'relationshipStatus') },
    })
    const res = await accountService.bulk(await ctx(), dto)
    revalidatePath('/accounts')
    return { ok: true, error: res.summary.failed > 0 ? `${res.summary.failed} failed` : undefined }
  } catch (error) {
    return { error: toMessage(error) }
  }
}
