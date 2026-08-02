'use client'

import { useMutation } from '@tanstack/react-query'
import type { SupplierRegistrationInput } from '@triyara/validation'

import { api } from '@/lib/api-client'

const BASE = '/api/public/supplier-registration'

interface PresignedUpload {
  uploadUrl: string
  method: 'PUT'
  headers: Record<string, string>
  storageKey: string
  expiresAt: string
}

export interface UploadResult {
  storageKey: string
  fileName: string
  mimeType: string
}

/**
 * Two-step upload, matching the authenticated pipeline: ask for a target, then
 * PUT the bytes straight at it.
 *
 * XMLHttpRequest rather than fetch, only because fetch still cannot report
 * upload progress — and a supplier on a slow connection sending a factory
 * photo needs to see that something is happening.
 */
export async function uploadRegistrationFile(
  file: File,
  onProgress?: (percent: number) => void,
): Promise<UploadResult> {
  const presigned = await api.post<PresignedUpload>(`${BASE}/presign`, {
    fileName: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
  })
  const target = presigned.data

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open(target.method, target.uploadUrl)
    for (const [header, value] of Object.entries(target.headers)) {
      xhr.setRequestHeader(header, value)
    }
    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100))
    })
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve()
      else reject(new Error(`Upload failed (${xhr.status}). Please try again.`))
    })
    xhr.addEventListener('error', () =>
      reject(new Error('Upload failed. Check your connection and try again.')),
    )
    xhr.addEventListener('abort', () => reject(new Error('Upload cancelled.')))
    xhr.send(file)
  })

  return { storageKey: target.storageKey, fileName: file.name, mimeType: file.type }
}

export function useSubmitRegistration() {
  return useMutation({
    mutationFn: async (payload: SupplierRegistrationInput) => {
      const result = await api.post<{ submitted: boolean; companyName: string }>(BASE, payload)
      return result.data
    },
  })
}
