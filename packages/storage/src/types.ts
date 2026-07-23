export interface PresignedUpload {
  uploadUrl: string
  method: 'PUT'
  headers: Record<string, string>
  storageKey: string
  expiresAt: string
}

export interface ObjectStat {
  size: number
  checksum: string
}

// Provider-agnostic storage contract. Services depend ONLY on this interface -
// never on a concrete provider (TRY-BNP-DEV-01, TRY-BNP-TDR-01).
export interface StorageProvider {
  createUploadUrl(input: {
    storageKey: string
    mimeType: string
    maxBytes: number
  }): Promise<PresignedUpload>
  createDownloadUrl(input: {
    storageKey: string
    downloadName?: string
    contentType?: string
    disposition?: 'inline' | 'attachment'
    expiresInSeconds?: number
  }): Promise<string>
  stat(storageKey: string): Promise<ObjectStat | null>
  delete(storageKey: string): Promise<void>
}

const SAFE_KEY = /^[A-Za-z0-9][A-Za-z0-9/_.-]*$/

export function assertSafeKey(key: string): void {
  if (!SAFE_KEY.test(key) || key.includes('..')) {
    throw new Error('Invalid storage key')
  }
}
