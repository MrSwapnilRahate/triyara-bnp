'use server'

import type { BuyerServiceCtx } from '@triyara/core'
import {
  addBuyerProductSchema,
  createBuyerProfileSchema,
  updateBuyerProfileSchema,
} from '@triyara/validation'
import { revalidatePath } from 'next/cache'
import { ZodError } from 'zod'

import { requireAuth } from '@/auth/context'
import { buyerService } from '@/lib/buyer-service'

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
function arr(fd: FormData, key: string): string[] | undefined {
  const s = str(fd, key)
  if (s === undefined) return undefined
  const parts = s
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
  return parts.length ? parts : undefined
}
function ctxAnd(auth: Awaited<ReturnType<typeof requireAuth>>): BuyerServiceCtx {
  return { ...auth, requestId: crypto.randomUUID() }
}

function profileDto(fd: FormData) {
  return {
    businessType: str(fd, 'businessType'),
    annualRequirement: str(fd, 'annualRequirement'),
    annualBudgetBand: str(fd, 'annualBudgetBand'),
    importExperience: str(fd, 'importExperience'),
    destinationCountries: arr(fd, 'destinationCountries'),
    destinationPort: str(fd, 'destinationPort'),
    incoterms: arr(fd, 'incoterms'),
    paymentTerms: arr(fd, 'paymentTerms'),
    certificationsRequired: arr(fd, 'certificationsRequired'),
    languages: arr(fd, 'languages'),
    website: str(fd, 'website'),
    description: str(fd, 'description'),
  }
}

export async function createBuyerAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const auth = await requireAuth()
    const accountId = String(fd.get('accountId'))
    const dto = createBuyerProfileSchema.parse(profileDto(fd))
    await buyerService.create(ctxAnd(auth), accountId, dto)
    revalidatePath(`/accounts/${accountId}/buyer`)
    return { ok: true }
  } catch (error) {
    return { error: toMessage(error) }
  }
}

export async function updateBuyerAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const auth = await requireAuth()
    const accountId = String(fd.get('accountId'))
    const version = Number(fd.get('version'))
    const dto = updateBuyerProfileSchema.parse(profileDto(fd))
    await buyerService.update(ctxAnd(auth), accountId, dto, version)
    revalidatePath(`/accounts/${accountId}/buyer`)
    return { ok: true }
  } catch (error) {
    return { error: toMessage(error) }
  }
}

export async function deleteBuyerAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const auth = await requireAuth()
    const accountId = String(fd.get('accountId'))
    await buyerService.remove(ctxAnd(auth), accountId, Number(fd.get('version')))
    revalidatePath(`/accounts/${accountId}/buyer`)
    return { ok: true }
  } catch (error) {
    return { error: toMessage(error) }
  }
}

export async function restoreBuyerAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const auth = await requireAuth()
    const accountId = String(fd.get('accountId'))
    await buyerService.restore(ctxAnd(auth), accountId, Number(fd.get('version')))
    revalidatePath(`/accounts/${accountId}/buyer`)
    return { ok: true }
  } catch (error) {
    return { error: toMessage(error) }
  }
}

export async function addBuyerProductAction(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  try {
    const auth = await requireAuth()
    const accountId = String(fd.get('accountId'))
    const version = Number(fd.get('version'))
    const dto = addBuyerProductSchema.parse({
      product: str(fd, 'product'),
      targetVolume: str(fd, 'targetVolume'),
      targetPrice: str(fd, 'targetPrice'),
      frequency: str(fd, 'frequency'),
    })
    await buyerService.addProduct(ctxAnd(auth), accountId, dto, version)
    revalidatePath(`/accounts/${accountId}/buyer`)
    return { ok: true }
  } catch (error) {
    return { error: toMessage(error) }
  }
}

export async function removeBuyerProductAction(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  try {
    const auth = await requireAuth()
    const accountId = String(fd.get('accountId'))
    const version = Number(fd.get('version'))
    await buyerService.removeProduct(ctxAnd(auth), accountId, String(fd.get('productId')), version)
    revalidatePath(`/accounts/${accountId}/buyer`)
    return { ok: true }
  } catch (error) {
    return { error: toMessage(error) }
  }
}
