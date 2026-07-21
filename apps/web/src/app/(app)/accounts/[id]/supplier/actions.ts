'use server'

import type { SupplierServiceCtx } from '@triyara/core'
import {
  addSupplierProductSchema,
  createSupplierProfileSchema,
  updateSupplierProfileSchema,
} from '@triyara/validation'
import { revalidatePath } from 'next/cache'
import { ZodError } from 'zod'

import { requireAuth } from '@/auth/context'
import { supplierService } from '@/lib/supplier-service'

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
function num(fd: FormData, key: string): number | undefined {
  const s = str(fd, key)
  return s === undefined ? undefined : Number(s)
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
function bool(fd: FormData, key: string): boolean {
  return fd.get(key) != null
}

function ctxAnd(auth: Awaited<ReturnType<typeof requireAuth>>): SupplierServiceCtx {
  return { ...auth, requestId: crypto.randomUUID() }
}

function profileDto(fd: FormData) {
  return {
    manufacturingType: str(fd, 'manufacturingType'),
    businessType: str(fd, 'businessType'),
    factorySizeSqm: num(fd, 'factorySizeSqm'),
    employees: num(fd, 'employees'),
    productionCapacity: str(fd, 'productionCapacity'),
    annualTurnoverBand: str(fd, 'annualTurnoverBand'),
    exportExperienceYears: num(fd, 'exportExperienceYears'),
    primaryMarkets: arr(fd, 'primaryMarkets'),
    exportCountries: arr(fd, 'exportCountries'),
    languages: arr(fd, 'languages'),
    incoterms: arr(fd, 'incoterms'),
    paymentTerms: arr(fd, 'paymentTerms'),
    supportedDocuments: arr(fd, 'supportedDocuments'),
    certifications: arr(fd, 'certifications'),
    leadTimeDays: num(fd, 'leadTimeDays'),
    moq: str(fd, 'moq'),
    packaging: str(fd, 'packaging'),
    oem: bool(fd, 'oem'),
    odm: bool(fd, 'odm'),
    privateLabel: bool(fd, 'privateLabel'),
    website: str(fd, 'website'),
    description: str(fd, 'description'),
  }
}

export async function createSupplierAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const auth = await requireAuth()
    const accountId = String(fd.get('accountId'))
    const dto = createSupplierProfileSchema.parse(profileDto(fd))
    await supplierService.create(ctxAnd(auth), accountId, dto)
    revalidatePath(`/accounts/${accountId}/supplier`)
    return { ok: true }
  } catch (error) {
    return { error: toMessage(error) }
  }
}

export async function updateSupplierAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const auth = await requireAuth()
    const accountId = String(fd.get('accountId'))
    const version = Number(fd.get('version'))
    const dto = updateSupplierProfileSchema.parse(profileDto(fd))
    await supplierService.update(ctxAnd(auth), accountId, dto, version)
    revalidatePath(`/accounts/${accountId}/supplier`)
    return { ok: true }
  } catch (error) {
    return { error: toMessage(error) }
  }
}

export async function deleteSupplierAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const auth = await requireAuth()
    const accountId = String(fd.get('accountId'))
    await supplierService.remove(ctxAnd(auth), accountId, Number(fd.get('version')))
    revalidatePath(`/accounts/${accountId}/supplier`)
    return { ok: true }
  } catch (error) {
    return { error: toMessage(error) }
  }
}

export async function restoreSupplierAction(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  try {
    const auth = await requireAuth()
    const accountId = String(fd.get('accountId'))
    await supplierService.restore(ctxAnd(auth), accountId, Number(fd.get('version')))
    revalidatePath(`/accounts/${accountId}/supplier`)
    return { ok: true }
  } catch (error) {
    return { error: toMessage(error) }
  }
}

export async function addProductAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const auth = await requireAuth()
    const accountId = String(fd.get('accountId'))
    const version = Number(fd.get('version'))
    const dto = addSupplierProductSchema.parse({
      product: str(fd, 'product'),
      capacityPerMonth: str(fd, 'capacityPerMonth'),
      moq: str(fd, 'productMoq'),
      leadTimeDays: num(fd, 'productLeadTime'),
    })
    await supplierService.addProduct(ctxAnd(auth), accountId, dto, version)
    revalidatePath(`/accounts/${accountId}/supplier`)
    return { ok: true }
  } catch (error) {
    return { error: toMessage(error) }
  }
}

export async function removeProductAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const auth = await requireAuth()
    const accountId = String(fd.get('accountId'))
    const version = Number(fd.get('version'))
    await supplierService.removeProduct(
      ctxAnd(auth),
      accountId,
      String(fd.get('productId')),
      version,
    )
    revalidatePath(`/accounts/${accountId}/supplier`)
    return { ok: true }
  } catch (error) {
    return { error: toMessage(error) }
  }
}
