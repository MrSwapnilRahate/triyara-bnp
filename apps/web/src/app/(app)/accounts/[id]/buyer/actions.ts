'use server'

import type { BuyerServiceCtx } from '@triyara/core'
import type { BuyerProfileRecord } from '@triyara/db'
import {
  addBuyerProductSchema,
  createBuyerProfileSchema,
  updateBuyerProfileSchema,
} from '@triyara/validation'
import { ZodError } from 'zod'

import { requireAuth } from '@/auth/context'
import { buyerService } from '@/lib/buyer-service'

export interface ActionState {
  ok?: boolean
  error?: string
  /**
   * The row this action just wrote, returned so the screen can settle on the
   * server's own answer instead of waiting for a re-rendered tree. See
   * `createBuyerAction` for why that wait is not safe to depend on.
   */
  profile?: BuyerProfileRecord
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

/**
 * Creates the profile and hands the new row straight back.
 *
 * Deliberately does NOT call `revalidatePath`. When a Server Action revalidates,
 * Next returns the re-rendered route inside the action's own response, and React
 * applies that tree in the same transition that owns `useActionState`'s pending
 * flag. If applying it suspends, React parks the transition - correctly, since a
 * transition must not replace visible content with a fallback - and waits for a
 * ping that, measured here, does not always arrive. The row was written, the
 * response arrived in full, and the button stayed on "Creating..." indefinitely.
 *
 * Returning the record instead lets the screen settle on data the action already
 * has. `useSettleOnOk` still refreshes afterwards, so the server stays the
 * source of truth; that refresh is now reconciliation rather than the only way
 * the user ever sees their profile.
 */
export async function createBuyerAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const auth = await requireAuth()
    const accountId = String(fd.get('accountId'))
    const dto = createBuyerProfileSchema.parse(profileDto(fd))
    const profile = await buyerService.create(ctxAnd(auth), accountId, dto)
    return { ok: true, profile }
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
    const profile = await buyerService.update(ctxAnd(auth), accountId, dto, version)
    return { ok: true, profile }
  } catch (error) {
    return { error: toMessage(error) }
  }
}

export async function deleteBuyerAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const auth = await requireAuth()
    const accountId = String(fd.get('accountId'))
    const profile = await buyerService.remove(ctxAnd(auth), accountId, Number(fd.get('version')))
    return { ok: true, profile }
  } catch (error) {
    return { error: toMessage(error) }
  }
}

export async function restoreBuyerAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const auth = await requireAuth()
    const accountId = String(fd.get('accountId'))
    const profile = await buyerService.restore(ctxAnd(auth), accountId, Number(fd.get('version')))
    return { ok: true, profile }
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
    const profile = await buyerService.addProduct(ctxAnd(auth), accountId, dto, version)
    return { ok: true, profile }
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
    const profile = await buyerService.removeProduct(
      ctxAnd(auth),
      accountId,
      String(fd.get('productId')),
      version,
    )
    return { ok: true, profile }
  } catch (error) {
    return { error: toMessage(error) }
  }
}
