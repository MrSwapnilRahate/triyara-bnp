'use client'

import { Alert, Avatar, Button, Spinner } from '@triyara/ui'
import { AVATAR_MAX_BYTES, AVATAR_MIME_TYPES } from '@triyara/validation'
import { useEffect, useRef, useState } from 'react'

import { describeApiError } from '@/lib/api-error'

import { useRemoveAvatar, useUploadAvatar } from '../api/admin'

const MAX_MB = Math.floor(AVATAR_MAX_BYTES / (1024 * 1024))
const ACCEPT = AVATAR_MIME_TYPES.join(',')
const TYPE_LABEL = 'PNG, JPEG or WebP'

/**
 * The signed-in user's own profile photo.
 *
 * Separate from the profile form on purpose. The photo is not a text field
 * being saved with the rest of the record - it is its own three-step request
 * against its own endpoint, and folding it into the form would mean an upload
 * only taking effect when somebody remembered to press Save.
 *
 * The client-side type and size checks are a courtesy, not the control: they
 * spare a round trip and give a specific message, but the server checks the
 * real object after it lands, because a presigned PUT cannot be constrained
 * from here.
 */
export function AvatarUpload({ avatarUrl, name }: { avatarUrl: string | null; name: string }) {
  const upload = useUploadAvatar()
  const remove = useRemoveAvatar()
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  /**
   * What the live region last had to say.
   *
   * A single value on purpose. Reading `upload.isSuccess` and
   * `remove.isSuccess` side by side announced whichever had ever succeeded,
   * not what just happened: remove a photo and upload another, and the region
   * still said "Profile photo removed." while a photo was plainly set. One
   * operation happens at a time, so one message describes it.
   */
  const [announcement, setAnnouncement] = useState<string | null>(null)

  // An object URL is a live handle, not a string: leaving it un-revoked keeps
  // the file in memory for as long as the document lives.
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview)
    },
    [preview],
  )

  const busy = upload.isPending || remove.isPending

  function onPick(file: File | undefined) {
    if (!file) return
    setError(null)
    setAnnouncement(null)

    if (!(AVATAR_MIME_TYPES as readonly string[]).includes(file.type)) {
      setError(`That file is not an image this platform accepts. Use ${TYPE_LABEL}.`)
      return
    }
    if (file.size > AVATAR_MAX_BYTES) {
      setError(
        `That image is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is ${MAX_MB} MB.`,
      )
      return
    }

    const objectUrl = URL.createObjectURL(file)
    setPreview(objectUrl)

    upload.mutate(file, {
      onError: (err) => {
        const described = describeApiError(err)
        const message = described.description ?? described.title
        setError(message)
        setAnnouncement(message)
        // Back to the stored photo, so a failed upload never leaves a picture
        // on screen that is not actually saved.
        setPreview(null)
        URL.revokeObjectURL(objectUrl)
      },
      onSuccess: () => {
        setAnnouncement('Profile photo updated.')
        setPreview(null)
        URL.revokeObjectURL(objectUrl)
      },
    })
  }

  // No cache-busting here any more. `avatarUrl` arrives already versioned by
  // the checksum of the stored object, so a replacement is a different URL by
  // the time it reaches this component - and stays one after a reload, which
  // the old `?v={submittedAt}` could not manage: that value reset to 0 on
  // remount and handed the browser back the address it had cached.
  const src = preview ?? avatarUrl ?? undefined

  return (
    <div className="flex flex-wrap items-center gap-gap-lg">
      <div className="relative">
        <Avatar size="lg" {...(src ? { src } : {})} name={name} />
        {busy ? (
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-surface/70">
            <Spinner size="sm" label={null} />
          </span>
        ) : null}
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-base font-medium text-content">Profile photo</p>
        <p className="mt-0.5 text-xs text-content-muted">
          {TYPE_LABEL}, up to {MAX_MB} MB. Shown to colleagues across the platform.
        </p>

        <div className="mt-gap flex flex-wrap items-center gap-gap">
          {/* The real control is the button. The input stays in the DOM and
              focusable-by-label rather than hidden with `display:none`, which
              would take it out of the accessibility tree entirely. */}
          <label htmlFor="avatar-file" className="sr-only">
            Choose a profile photo
          </label>
          <input
            ref={inputRef}
            id="avatar-file"
            type="file"
            accept={ACCEPT}
            disabled={busy}
            className="sr-only"
            onChange={(e) => {
              onPick(e.target.files?.[0])
              // Cleared so choosing the same file twice still fires a change.
              e.target.value = ''
            }}
          />
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            loading={upload.isPending}
            onClick={() => inputRef.current?.click()}
          >
            {avatarUrl ? 'Change photo' : 'Upload photo'}
          </Button>

          {avatarUrl ? (
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              loading={remove.isPending}
              onClick={() => {
                setError(null)
                setAnnouncement(null)
                remove.mutate(undefined, {
                  onError: (err) => {
                    const described = describeApiError(err)
                    const message = described.description ?? described.title
                    setError(message)
                    setAnnouncement(message)
                  },
                  onSuccess: () => setAnnouncement('Profile photo removed.'),
                })
              }}
            >
              Remove
            </Button>
          ) : null}
        </div>

        {error ? (
          <Alert tone="danger" className="mt-gap">
            {error}
          </Alert>
        ) : null}
        {/* Announced rather than shown as a banner: the photo changing is its
            own confirmation for anyone who can see it. */}
        <p aria-live="polite" className="sr-only">
          {announcement ?? ''}
        </p>
      </div>
    </div>
  )
}
