import type { NotificationChannel, NotificationType } from '@prisma/client'

import { prisma } from '../client'

export interface PreferenceRecord {
  type: NotificationType
  enabled: boolean
  muted: boolean
  digest: boolean
  channels: NotificationChannel[]
}

export interface ResolvedPref {
  enabled: boolean
  muted: boolean
  channels: NotificationChannel[]
}

export interface UpsertPreference {
  enabled?: boolean
  muted?: boolean
  digest?: boolean
  channels?: NotificationChannel[]
}

export interface NotificationPreferenceRepository {
  getForUser(orgId: string, userId: string): Promise<PreferenceRecord[]>
  getForUsers(
    orgId: string,
    userIds: string[],
    type: NotificationType,
  ): Promise<Map<string, ResolvedPref>>
  upsert(
    orgId: string,
    userId: string,
    type: NotificationType,
    data: UpsertPreference,
  ): Promise<void>
}

export const notificationPreferenceRepository: NotificationPreferenceRepository = {
  getForUser(orgId, userId) {
    return prisma.notificationPreference.findMany({
      where: { organizationId: orgId, userId },
      select: { type: true, enabled: true, muted: true, digest: true, channels: true },
    })
  },

  async getForUsers(orgId, userIds, type) {
    const rows = await prisma.notificationPreference.findMany({
      where: { organizationId: orgId, userId: { in: userIds }, type },
      select: { userId: true, enabled: true, muted: true, channels: true },
    })
    return new Map(
      rows.map((r) => [r.userId, { enabled: r.enabled, muted: r.muted, channels: r.channels }]),
    )
  },

  async upsert(orgId, userId, type, data) {
    await prisma.notificationPreference.upsert({
      where: { userId_type: { userId, type } },
      create: { organizationId: orgId, userId, type, ...data },
      update: { ...data },
    })
  },
}
