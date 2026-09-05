import type { AuthContext } from '@triyara/auth'
import type { UserRepository } from '@triyara/db'
import { NotFoundError, ValidationError } from '@triyara/lib'
import type { ObjectStat, PresignedUpload, StorageObject, StorageProvider } from '@triyara/storage'
import { AVATAR_MAX_BYTES, type PresignAvatarDto } from '@triyara/validation'

export type AvatarServiceCtx = AuthContext & { requestId?: string }

export interface AvatarServiceDeps {
  users: Pick<UserRepository, 'updateProfile'>
  storage: StorageProvider
}

/**
 * Where a user's avatar lives, derived rather than stored.
 *
 * THE KEY IS THE AUTHORIZATION. Both segments come from the server: the
 * organization from the caller's session, the user id from the session on write
 * and from the route on read. Because a caller can only ever name their OWN
 * organization's prefix, an id belonging to another tenant resolves to a key
 * that does not exist - the boundary is a property of the address, not a check
 * somebody has to remember to write. There is no request in this feature that
 * accepts a storage key.
 *
 * DETERMINISTIC, NOT A UUID. A new photo overwrites the old object, so
 * replacement cannot leave an orphan behind and removal has exactly one thing
 * to delete. The cost is that the URL never changes, which is why the response
 * carries an ETag: the bytes are what varies, so the checksum is what the
 * browser should revalidate against.
 */
export function avatarStorageKey(organizationId: string, userId: string): string {
  return `${organizationId}/avatars/${userId}`
}

/**
 * The public path an avatar is served from, and the value stored in `avatarUrl`.
 *
 * `version` is the stored object's checksum, and it is the whole reason a
 * replacement is visible. The key is deterministic, so the path never changes -
 * which means a browser that has the old bytes cached under `max-age` has
 * nothing to tell it they are stale, and keeps showing the previous photo until
 * the entry expires. Putting the checksum in the URL makes new bytes a new
 * address, so the change is visible immediately and survives a reload, because
 * the versioned URL is what was persisted rather than something the client
 * assembled and forgot.
 *
 * Derived from the object rather than from a clock or a counter: the same image
 * uploaded twice yields the same URL and stays cached, and no state has to be
 * kept anywhere to know what version this is.
 */
export function avatarPath(userId: string, version?: string): string {
  const path = `/api/v1/users/${userId}/avatar`
  return version ? `${path}?v=${version}` : path
}

/**
 * A checksum reduced to something safe to put in a URL.
 *
 * S3 returns an ETag, which for a multipart upload carries a `-N` suffix, and
 * the local provider returns a sha256. Both are trimmed to hex so the value
 * matches the path the profile contract accepts.
 */
function versionFrom(checksum: string): string {
  return checksum.replace(/[^A-Za-z0-9]/g, '').slice(0, 16) || 'v'
}

export function createAvatarService({ users, storage }: AvatarServiceDeps) {
  function ownKey(ctx: AvatarServiceCtx): string {
    return avatarStorageKey(ctx.organizationId, ctx.user.id)
  }

  return {
    /**
     * Issues an upload target for the caller's own avatar.
     *
     * The DTO carries no identity - it cannot, because the key is built here
     * from the session. What the client sends is a declared type and size, and
     * both are treated as a hint: the type is checked against the allow-list by
     * the schema, and the size is checked again for real in `confirm`.
     */
    presign(ctx: AvatarServiceCtx, dto: PresignAvatarDto): Promise<PresignedUpload> {
      return storage.createUploadUrl({
        storageKey: ownKey(ctx),
        mimeType: dto.mimeType,
        maxBytes: AVATAR_MAX_BYTES,
      })
    },

    /**
     * Records that the upload landed, and only then points the profile at it.
     *
     * The size check here is the authoritative one and is not duplication. A
     * presigned PUT to S3 or R2 carries no length condition, so `maxBytes` on
     * the way out is advisory: the browser can send whatever it likes to that
     * URL. Asking the store how big the object actually is, after the fact, is
     * the only measurement that cannot be talked around - and it happens before
     * `avatarUrl` is written, so an oversized upload never becomes visible.
     */
    async confirm(ctx: AvatarServiceCtx): Promise<{ avatarUrl: string }> {
      const key = ownKey(ctx)
      const stat = await storage.stat(key)
      if (!stat) throw new NotFoundError('No uploaded image found. Upload before confirming.')

      if (stat.size > AVATAR_MAX_BYTES) {
        // Left behind and the profile untouched would mean an oversized object
        // sitting in the bucket forever, reachable by nothing. Deleting it is
        // the same cleanup a replacement would have done.
        await storage.delete(key)
        throw new ValidationError(
          `Profile photos must be ${Math.floor(AVATAR_MAX_BYTES / (1024 * 1024))} MB or smaller.`,
        )
      }

      // Versioned with the checksum `stat` just read, so the URL that gets
      // persisted already identifies these bytes rather than the ones it
      // replaced.
      const avatarUrl = avatarPath(ctx.user.id, versionFrom(stat.checksum))
      await users.updateProfile(ctx.user.id, { avatarUrl })
      return { avatarUrl }
    },

    /**
     * Removes the caller's photo.
     *
     * The object goes first. If the row were cleared first and the delete then
     * failed, the bucket would keep an object nothing points at; this way a
     * failed delete leaves the profile as it was and the operation can simply
     * be repeated.
     */
    async remove(ctx: AvatarServiceCtx): Promise<void> {
      await storage.delete(ownKey(ctx))
      await users.updateProfile(ctx.user.id, { avatarUrl: null })
    },

    /**
     * Reads another user's avatar bytes, scoped to the caller's organization.
     *
     * `userId` comes from the route and is deliberately NOT looked up first.
     * The key is built from the CALLER's organization, so an id from another
     * tenant simply addresses nothing and returns null - no database round trip
     * on an image request, and no way to distinguish "not in your organization"
     * from "has no photo", which is the same flattening the document route
     * makes for the same reason.
     */
    read(ctx: AvatarServiceCtx, userId: string): Promise<StorageObject | null> {
      return storage.readObject(avatarStorageKey(ctx.organizationId, userId))
    },

    /**
     * The stored object's metadata, scoped the same way `read` is.
     *
     * Exists so the serving route can answer a revalidating browser from the
     * checksum without pulling the bytes back. Same key derivation, so it
     * carries the same tenancy property.
     */
    stat(ctx: AvatarServiceCtx, userId: string): Promise<ObjectStat | null> {
      return storage.stat(avatarStorageKey(ctx.organizationId, userId))
    },
  }
}

export type AvatarService = ReturnType<typeof createAvatarService>
