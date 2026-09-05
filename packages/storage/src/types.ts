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

/**
 * An object's bytes, read back through the server.
 *
 * `contentType` is whatever the store recorded at upload time, and is null when
 * the store does not keep one - the local provider writes bare files. A caller
 * that needs a correct type for a `nosniff` response must have a fallback.
 */
export interface StorageObject {
  bytes: Uint8Array
  contentType: string | null
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
  /**
   * Reads an object's bytes on the server. Null when it does not exist.
   *
   * WHY THIS EXISTS: everything else here hands the BROWSER a URL and steps
   * out of the way, which is right for documents - they are large, and the
   * bytes never need to touch the app. An image rendered in an `<img>` cannot
   * work that way: the app's CSP is `img-src 'self'`, so a presigned URL on the
   * storage host is refused, and so is a redirect to one. Serving such an image
   * at all means the bytes coming back through a same-origin route.
   *
   * DELIBERATELY BUFFERED, NOT STREAMED. The caller is expected to have capped
   * the size long before this is reached - avatars are limited at upload and
   * again on confirmation. Buffering keeps the return type free of a stream
   * flavour that differs between providers, and lets the caller inspect the
   * first bytes, which it must do when `contentType` comes back null. Do not
   * reach for this to serve documents: they are two orders of magnitude larger
   * and already have a URL-based path that costs the app nothing.
   */
  readObject(storageKey: string): Promise<StorageObject | null>
  delete(storageKey: string): Promise<void>
}

const SAFE_KEY = /^[A-Za-z0-9][A-Za-z0-9/_.-]*$/

export function assertSafeKey(key: string): void {
  if (!SAFE_KEY.test(key) || key.includes('..')) {
    throw new Error('Invalid storage key')
  }
}
