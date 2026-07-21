import { Prisma } from '@prisma/client'

export function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}

export async function writeAudit(
  tx: Prisma.TransactionClient,
  params: {
    organizationId: string
    actorId: string
    requestId?: string
    entityType: string
    entityId: string
    action: string
    before?: unknown
    after?: unknown
  },
): Promise<void> {
  await tx.auditLog.create({
    data: {
      organizationId: params.organizationId,
      entityType: params.entityType,
      entityId: params.entityId,
      actorId: params.actorId,
      action: params.action,
      before: params.before ? toJson(params.before) : Prisma.JsonNull,
      after: params.after ? toJson(params.after) : Prisma.JsonNull,
      requestId: params.requestId,
    },
  })
}
