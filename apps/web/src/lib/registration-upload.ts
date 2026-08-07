'use client'

import { api } from '@/lib/api-client'

// The two-step public upload, shared by the supplier and buyer forms: ask for a
// target, then PUT the bytes straight at it. Only the presign endpoint differs,
// so that is the parameter and everything else is written once.

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
 * Uploads one file and resolves with the key to record.
 *
 * XMLHttpRequest rather than fetch, only because fetch still cannot report
 * upload progress — and someone on a slow connection sending a company profile
 * needs to see that something is happening.
 */
export async function uploadViaPresign(
  presignPath: string,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<UploadResult> {
  const presigned = await api.post<PresignedUpload>(presignPath, {
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
