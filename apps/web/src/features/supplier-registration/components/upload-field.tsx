'use client'

import { Button, Progress } from '@triyara/ui'
import { Paperclip, X } from 'lucide-react'
import { useId, useRef, useState } from 'react'

import { uploadRegistrationFile, type UploadResult } from '../api/registration'

/**
 * One file, uploaded as soon as it is chosen.
 *
 * Uploading on selection rather than on submit is what keeps the final submit
 * fast and recoverable: by the time someone presses Submit, the bytes are
 * already in storage and only a small JSON payload has to succeed. A failed
 * upload is also reported next to the field that caused it, while the person
 * still remembers which file it was.
 */
export function UploadField({
  label,
  hint,
  value,
  onUploaded,
  onCleared,
}: {
  label: string
  hint?: string
  value?: { fileName?: string; storageKey?: string }
  onUploaded: (result: UploadResult) => void
  onCleared: () => void
}) {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [percent, setPercent] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function choose(file: File | undefined) {
    if (!file) return
    setError(null)
    setPercent(0)
    try {
      const result = await uploadRegistrationFile(file, setPercent)
      onUploaded(result)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Upload failed. Please try again.')
    } finally {
      setPercent(null)
      // Clearing the input lets the same file be re-picked after a failure,
      // which otherwise fires no change event and looks like nothing happened.
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const uploaded = Boolean(value?.storageKey)

  return (
    <div className="space-y-gap-xs">
      <label htmlFor={inputId} className="block text-xs font-medium text-content">
        {label}
      </label>
      {hint ? <p className="text-2xs text-content-muted">{hint}</p> : null}

      {uploaded ? (
        <div className="flex items-center justify-between gap-gap rounded-sm border border-line bg-surface px-2.5 py-1.5">
          <span className="flex min-w-0 items-center gap-gap-xs text-xs text-content">
            <Paperclip className="size-3.5 shrink-0 text-content-muted" aria-hidden="true" />
            <span className="truncate">{value?.fileName ?? 'Attached'}</span>
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCleared}
            aria-label={`Remove ${value?.fileName ?? label}`}
          >
            <X className="size-3.5" aria-hidden="true" />
          </Button>
        </div>
      ) : (
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          disabled={percent !== null}
          onChange={(event) => void choose(event.target.files?.[0])}
          className="focus-ring block w-full cursor-pointer rounded-sm border border-line bg-surface text-xs text-content-muted file:mr-2 file:cursor-pointer file:border-0 file:bg-surface-sunken file:px-2.5 file:py-1.5 file:text-xs file:text-content disabled:opacity-50"
        />
      )}

      {percent !== null ? (
        <Progress value={percent} label={`Uploading ${label}`} className="h-1" />
      ) : null}
      {error ? (
        <p role="alert" className="text-2xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  )
}
