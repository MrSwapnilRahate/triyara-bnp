import type { AuthContext } from '@triyara/auth'
import type { NotificationPreferenceRepository, PreferenceRecord } from '@triyara/db'
import { NOTIFICATION_TYPES, type UpdatePreferencesDto } from '@triyara/validation'

export function createNotificationPreferenceService({
  repo,
}: {
  repo: NotificationPreferenceRepository
}) {
  return {
    async get(ctx: AuthContext): Promise<PreferenceRecord[]> {
      const stored = await repo.getForUser(ctx.organizationId, ctx.user.id)
      const byType = new Map(stored.map((p) => [p.type, p]))
      // Fill defaults for any type without a stored row.
      return NOTIFICATION_TYPES.map(
        (type) =>
          byType.get(type) ?? {
            type,
            enabled: true,
            muted: false,
            digest: false,
            channels: ['IN_APP'],
          },
      )
    },
    async update(ctx: AuthContext, dto: UpdatePreferencesDto): Promise<PreferenceRecord[]> {
      for (const pref of dto.preferences) {
        const { type, ...data } = pref
        await repo.upsert(ctx.organizationId, ctx.user.id, type, data)
      }
      return this.get(ctx)
    },
  }
}
export type NotificationPreferenceService = ReturnType<typeof createNotificationPreferenceService>
